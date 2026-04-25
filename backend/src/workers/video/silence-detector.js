// workers/video/silence-detector.js
// ─────────────────────────────────────────────────────────────────────────
// Detects silences and audio energy levels purely via FFmpeg silencedetect
// filter — zero AI calls, zero extra dependencies.
//
// Outputs two things:
//   silences:  [{start, end, duration}]   — intervals of near-silence
//   loudness:  [{time, rms}]              — per-second energy map (0–1)
//
// These feed the cut-planner so it can:
//   • remove dead air without AI
//   • weight segments by audio energy (louder = more engaging)
//   • detect exact pause boundaries (not just Whisper segment gaps)
// ─────────────────────────────────────────────────────────────────────────

import { exec }      from 'child_process';
import { promisify } from 'util';
import { logger }    from '../../lib/logger.js';

const execAsync = promisify(exec);

// Threshold below which audio is considered silence (dB, negative)
const SILENCE_THRESHOLD_SHORT = -35;  // aggressive — short form
const SILENCE_THRESHOLD_LONG  = -40;  // relaxed   — long form
const MIN_SILENCE_DURATION    = 0.4;  // seconds — shorter than this, keep

/**
 * Detect silence intervals in a video/audio file.
 *
 * @param {string} filePath
 * @param {'short'|'long'} mode
 * @param {string} jobId
 * @returns {{ silences: Array<{start,end,duration}>, loudness: Array<{time,rms}> }}
 */
export async function detectSilences(filePath, mode = 'short', jobId = '') {
  const threshold = mode === 'short' ? SILENCE_THRESHOLD_SHORT : SILENCE_THRESHOLD_LONG;
  const minDur    = mode === 'short' ? 0.4 : 1.0;

  logger.info(`[SilenceDetector:${jobId}] Scanning audio (threshold=${threshold}dB, minDur=${minDur}s)`);

  // ── Run silencedetect ──────────────────────────────────────────────────
  // filePath is a multer-generated hex path (no spaces/special chars) — safe to interpolate
  const silenceCmd = [
    'ffmpeg', '-i', filePath,
    '-af', `silencedetect=noise=${threshold}dB:d=${minDur}`,
    '-f', 'null', '-',
  ].join(' ');

  let silenceRaw = '';
  try {
    const { stderr } = await execAsync(silenceCmd, { timeout: 3 * 60 * 1000 });
    silenceRaw = stderr;
  } catch (err) {
    // ffmpeg writes to stderr even on success — capture it
    silenceRaw = err.stderr || '';
  }

  // Parse silence intervals
  const silences = _parseSilences(silenceRaw);
  logger.info(`[SilenceDetector:${jobId}] Found ${silences.length} silence intervals`);

  // ── Run astats for per-second loudness map ─────────────────────────────
  const loudness = await _measureLoudness(filePath, jobId);

  return { silences, loudness };
}

/**
 * Given silence intervals, compute the inverse: segments to KEEP.
 * Merges adjacent keep-segments that are too short to stand alone (<0.3s).
 *
 * @param {number} totalDuration  — video total duration in seconds
 * @param {Array}  silences       — [{start, end, duration}]
 * @param {object} opts
 * @param {number} opts.silencePad  — seconds of audio to keep around each cut (natural feel)
 * @returns {Array<{start, end}>}
 */
export function buildKeepSegments(totalDuration, silences, opts = {}) {
  const pad = opts.silencePad ?? 0.05; // 50ms padding — prevents audio clicks

  if (!silences.length) return [{ start: 0, end: totalDuration }];

  const cuts = [];
  let cursor = 0;

  for (const s of silences) {
    const segEnd = Math.max(cursor, s.start - pad);
    if (segEnd - cursor > 0.2) {       // discard slivers < 200ms
      cuts.push({ start: cursor, end: segEnd });
    }
    cursor = Math.min(totalDuration, s.end + pad);
  }

  // Trailing segment after last silence
  if (totalDuration - cursor > 0.2) {
    cuts.push({ start: cursor, end: totalDuration });
  }

  return _mergeAdjacentSegments(cuts, 0.5);
}

// ── Internal helpers ───────────────────────────────────────────────────────

function _parseSilences(raw) {
  const silences = [];
  const startRe  = /silence_start: ([\d.]+)/g;
  const endRe    = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g;

  const starts = [...raw.matchAll(startRe)].map(m => parseFloat(m[1]));
  const ends   = [...raw.matchAll(endRe)].map(m => ({
    end: parseFloat(m[1]), duration: parseFloat(m[2]),
  }));

  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    silences.push({
      start:    starts[i],
      end:      ends[i].end,
      duration: ends[i].duration,
    });
  }

  // Handle trailing silence (video ends in silence — no silence_end)
  if (starts.length > ends.length) {
    silences.push({ start: starts[starts.length - 1], end: Infinity, duration: Infinity });
  }

  return silences;
}

async function _measureLoudness(filePath, jobId) {
  // ebur128 gives momentary loudness (M) — much better for speech energy than RMS.
  // M values are in LUFS, roughly -70 (silence) to -5 (loud speech).
  // We sample at 10Hz (every 100ms) using the ebur128 filter.
  const cmd = [
    'ffmpeg', '-i', filePath,
    '-af', 'ebur128=peak=none:framelog=quiet:metadata=1,ametadata=print:key=lavfi.r128.M',
    '-f', 'null', '-',
  ].join(' ');

  try {
    const { stderr } = await execAsync(cmd, { timeout: 2 * 60 * 1000 }).catch(e => ({ stderr: e.stderr || '' }));
    const points = _parseLoudness(stderr);
    if (points.length > 0) return points;
    // Fallback to astats if ebur128 produces no output
    return await _measureLoudnessAstats(filePath);
  } catch {
    return [];
  }
}

async function _measureLoudnessAstats(filePath) {
  const cmd = [
    'ffmpeg', '-i', filePath,
    '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
    '-f', 'null', '-',
  ].join(' ');
  try {
    const { stderr } = await execAsync(cmd, { timeout: 2 * 60 * 1000 }).catch(e => ({ stderr: e.stderr || '' }));
    const re = /pts_time:([\d.]+).*?RMS_level=([-\d.]+)/gs;
    const points = [];
    for (const m of stderr.matchAll(re)) {
      const time = parseFloat(m[1]);
      const rms  = parseFloat(m[2]);
      if (!isNaN(time) && isFinite(rms)) {
        points.push({ time, rms: Math.max(0, Math.min(1, (rms + 60) / 60)) });
      }
    }
    return points;
  } catch { return []; }
}

function _parseLoudness(raw) {
  const points = [];
  // ebur128: lavfi.r128.M=-23.5 at pts_time:1.234
  const re = /pts_time:([\d.]+).*?lavfi\.r128\.M=([-\d.]+)/gs;
  for (const m of raw.matchAll(re)) {
    const time  = parseFloat(m[1]);
    const lufs  = parseFloat(m[2]);  // LUFS momentary, typically -70 to -5
    if (!isNaN(time) && isFinite(lufs)) {
      // Normalize: -70 LUFS → 0.0, -5 LUFS → 1.0
      points.push({ time, rms: Math.max(0, Math.min(1, (lufs + 70) / 65)) });
    }
  }
  return points;
}

function _mergeAdjacentSegments(segments, minGap = 0.5) {
  if (!segments.length) return segments;
  const merged = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    if (segments[i].start - last.end < minGap) {
      last.end = segments[i].end;
    } else {
      merged.push({ ...segments[i] });
    }
  }
  return merged;
}

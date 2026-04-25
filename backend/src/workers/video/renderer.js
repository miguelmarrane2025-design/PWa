// workers/video/renderer.js — v18.1
// Fix applied: hasAudio guard, concat skip for single segment,
//              safe bufsize calculation, robust ASS path escaping.

import { exec, spawn }  from 'child_process';
import { promisify }    from 'util';
import { logger }       from '../../lib/logger.js';

const execAsync = promisify(exec);

// ── Platform presets ──────────────────────────────────────────────────────
const PLATFORMS = {
  tiktok:  { w: 1080, h: 1920, crf: 22, bitrate: 4,  audioBitrate: '128k', fps: 30 },
  reels:   { w: 1080, h: 1920, crf: 22, bitrate: 4,  audioBitrate: '128k', fps: 30 },
  shorts:  { w: 1080, h: 1920, crf: 22, bitrate: 4,  audioBitrate: '128k', fps: 30 },
  youtube: { w: 1920, h: 1080, crf: 20, bitrate: 8,  audioBitrate: '192k', fps: null },
  hd:      { w: 1920, h: 1080, crf: 22, bitrate: 6,  audioBitrate: '128k', fps: null },
};

export async function probeVideo(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${_esc(filePath)}"`,
    );
    const data    = JSON.parse(stdout);
    const vStream = data.streams?.find(s => s.codec_type === 'video');
    const aStream = data.streams?.find(s => s.codec_type === 'audio');
    const duration = parseFloat(data.format?.duration || '0');
    const width    = parseInt(vStream?.width  || '1920');
    const height   = parseInt(vStream?.height || '1080');

    let fps = 30;
    if (vStream?.r_frame_rate) {
      const [n, d] = vStream.r_frame_rate.split('/').map(Number);
      fps = d ? n / d : n;
      if (!isFinite(fps) || fps <= 0) fps = 30;
    }

    return {
      duration,
      width,
      height,
      fps,
      // FIX #1a: expose hasAudio so renderVideo can build the correct filter graph
      hasAudio: !!aStream,
      codec: vStream?.codec_name,
    };
  } catch (err) {
    logger.warn(`[Renderer] probeVideo failed: ${err.message}`);
    return { duration: 0, width: 1920, height: 1080, fps: 30, hasAudio: true };
  }
}

export async function renderVideo({
  inputPath, outputPath, assPath, keepSegments, probe,
  mode, platform, normalizeAudio = true, jobId, onProgress,
}) {
  const segs   = keepSegments?.length ? keepSegments : [{ start: 0, end: probe.duration }];
  const preset = _resolvePlatform(platform, mode, probe);

  // FIX #1b: honour hasAudio from probe — default true for safety
  const hasAudio = probe.hasAudio !== false;

  logger.info(`[Renderer:${jobId}] ${segs.length} segs platform=${preset._name} ${preset.w}x${preset.h} audio=${hasAudio}`);

  const vParts  = [];
  const aParts  = [];
  const vLabels = [];
  const aLabels = [];

  segs.forEach((seg, i) => {
    vParts.push(`[0:v]trim=start=${seg.start.toFixed(4)}:end=${seg.end.toFixed(4)},setpts=PTS-STARTPTS[sv${i}]`);
    vLabels.push(`[sv${i}]`);

    if (hasAudio) {
      aParts.push(`[0:a]atrim=start=${seg.start.toFixed(4)}:end=${seg.end.toFixed(4)},asetpts=PTS-STARTPTS[sa${i}]`);
      aLabels.push(`[sa${i}]`);
    }
  });

  const n = segs.length;

  // FIX #9: skip concat filter for single segment (saves a generation step)
  if (n === 1) {
    vParts.push(`[sv0]copy[vc]`);
    if (hasAudio) aParts.push(`[sa0]acopy[ac]`);
  } else {
    vParts.push(`${vLabels.join('')}concat=n=${n}:v=1:a=0[vc]`);
    if (hasAudio) aParts.push(`${aLabels.join('')}concat=n=${n}:v=0:a=1[ac]`);
  }

  // Smart scale + crop for vertical formats (no black bars).
  // For vertical target (9:16): scale to fill width, crop to target height from center.
  // For horizontal target (16:9): scale with aspect ratio, minimal letterbox (acceptable).
  const isVertical = preset.h > preset.w;
  let scaleFilter;
  if (isVertical) {
    // Scale so width = target width (maintains aspect), then crop height from center
    // This keeps the frame full — no black bars on short-form content
    scaleFilter = [
      `[vc]scale=${preset.w}:-2:flags=lanczos`,         // scale to target width
      `crop=${preset.w}:${preset.h}:(iw-${preset.w})/2:(ih-${preset.h})/2`, // center-crop height
      `[vs]`,
    ].join(',');
  } else {
    // Horizontal: scale with letterbox (black bars acceptable, content stays intact)
    scaleFilter = `[vc]scale=${preset.w}:${preset.h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${preset.w}:${preset.h}:(ow-iw)/2:(oh-ih)/2:black[vs]`;
  }
  vParts.push(scaleFilter);

  // ASS subtitles
  vParts.push(`[vs]ass='${_assPath(assPath)}'[vout]`);

  // Audio chain — only when video has audio
  if (hasAudio) {
    aParts.push(normalizeAudio
      ? `[ac]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`
      : `[ac]acopy[aout]`);
  }

  const filterComplex = [...vParts, ...aParts].join(';');

  // FIX #8: store bitrate as number, build strings safely
  const fpsOpt   = preset.fps ? ['-r', String(preset.fps)] : [];
  const bitrateM = `${preset.bitrate}M`;
  const bufsizeM = `${preset.bitrate * 2}M`;   // clean integer math, no parseInt

  const args = [
    '-i', inputPath,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    ...(hasAudio ? ['-map', '[aout]'] : []),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf',     String(preset.crf),
    '-maxrate',  bitrateM,
    '-bufsize',  bufsizeM,
    ...fpsOpt,
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', preset.audioBitrate, '-ar', '44100'] : ['-an']),
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ];

  await _spawnFFmpeg(args, probe.duration, jobId, onProgress);
  logger.info(`[Renderer:${jobId}] Render complete → ${outputPath}`);
}

// ── Spawn FFmpeg with progress ─────────────────────────────────────────────
function _spawnFFmpeg(args, totalDuration, jobId, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      const txt = chunk.toString();
      stderr += txt;
      if (onProgress && totalDuration > 0) {
        const m = txt.match(/time=(\d+):(\d+):([\d.]+)/);
        if (m) {
          const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
          onProgress(Math.min(99, Math.round((secs / totalDuration) * 100)));
        }
      }
    });

    proc.on('close', (code) => {
      if (code === 0) { if (onProgress) onProgress(100); resolve(); }
      else reject(new Error(`FFmpeg exited ${code}: ${_extractError(stderr)}`));
    });
    proc.on('error', reject);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function _resolvePlatform(platform, mode, probe) {
  if (!platform || platform === 'auto') {
    platform = mode === 'short'
      ? (probe.height > probe.width ? 'reels' : 'tiktok')
      : 'youtube';
  }
  const p = PLATFORMS[platform] || PLATFORMS[mode === 'short' ? 'reels' : 'youtube'];
  return { ...p, _name: platform };
}

function _esc(p) {
  // Escape for shell double-quote context
  return p.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

function _assPath(p) {
  // Escape for FFmpeg ass= filter value (inside single quotes in filter_complex)
  return p
    .replace(/\\/g, '/')
    .replace(/:/g,  '\\:')
    .replace(/'/g,  "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function _extractError(stderr) {
  const lines = stderr.split('\n').filter(Boolean).reverse();
  return (lines.find(l => /error|invalid|unable|cannot|failed|no such/i.test(l)) || lines[0] || 'unknown')
    .trim().slice(0, 200);
}

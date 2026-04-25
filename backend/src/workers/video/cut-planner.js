// workers/video/cut-planner.js — v18
// ─────────────────────────────────────────────────────────────────────────
// Builds the final edit plan by combining:
//   • Whisper segments (what was said and when)
//   • Silence detector output (exact dead-air intervals)
//   • Content analyzer scores (semantic value per segment)
//
// SHORT mode:
//   1. Lock onto the best 30–90s window from content-analyzer
//   2. Within that window, remove silences + filler using silence-detector
//   3. Result: tight, high-energy clip that starts on the strongest hook
//
// LONG mode:
//   1. Keep all scored.keep === true segments
//   2. Remove silence intervals detected by ffmpeg
//   3. Merge adjacent keep-segments, preserve chapters
//   4. Result: clean full video, no dead air, no filler
// ─────────────────────────────────────────────────────────────────────────

import { logger } from '../../lib/logger.js';

/**
 * Build final edit plan from analysis results.
 *
 * @param {object} opts
 * @param {string}  opts.jobId
 * @param {string}  opts.mode           — 'short' | 'long'
 * @param {object}  opts.probe          — { duration, width, height, fps }
 * @param {Array}   opts.scoredSegments — from content-analyzer
 * @param {object}  opts.bestWindow     — from content-analyzer (short mode)
 * @param {Array}   opts.silences       — from silence-detector
 * @param {object}  opts.intent         — parsed user intent
 * @returns {EditPlan}
 */
export function planCuts({
  jobId, mode, probe, scoredSegments, bestWindow, silences, intent,
}) {
  logger.info(`[CutPlanner:${jobId}] Building ${mode} edit plan`);

  if (!scoredSegments.length) {
    return _passThroughPlan(probe.duration);
  }

  const plan = mode === 'short'
    ? _buildShortPlan({ jobId, probe, scoredSegments, bestWindow, silences, intent })
    : _buildLongPlan({  jobId, probe, scoredSegments, silences, intent });

  logger.info(`[CutPlanner:${jobId}] Plan: ${plan.keepSegments.length} segments, ${plan.silencesRemoved} silences removed, est. duration=${plan.estimatedDuration.toFixed(1)}s`);
  return plan;
}

// ── SHORT FORM plan ────────────────────────────────────────────────────────
function _buildShortPlan({ jobId, probe, scoredSegments, bestWindow, silences, intent }) {
  // 1. Determine the content window
  let windowStart = 0;
  let windowEnd   = Math.min(probe.duration, 90);

  if (bestWindow) {
    windowStart = bestWindow.start;
    windowEnd   = bestWindow.end;
    logger.info(`[CutPlanner:${jobId}] Best window: ${windowStart.toFixed(2)}s–${windowEnd.toFixed(2)}s (score=${bestWindow.score})`);
  }

  // 2. Filter scored segments to window
  const inWindow = scoredSegments.filter(s => s.start >= windowStart && s.end <= windowEnd);

  // 3. Segments to keep inside the window (based on AI scores + silence)
  const keepFromScores = inWindow
    .filter(s => s.keep !== false)
    .map(s => ({ start: s.start, end: s.end }));

  // 4. Apply silence-based removal on top of score-based selection
  const refined = _removeIntervalsFromSegments(keepFromScores, silences, {
    pad: 0.05,
    minSegmentDuration: 0.3,
  });

  // 5. Merge very small gaps for natural feel
  const merged = _mergeCloseSegments(refined, 0.15);

  // 6. Cap at 90s
  const capped = _capTotalDuration(merged, 90);

  const silencesRemoved = silences.filter(
    s => s.start >= windowStart && s.end <= windowEnd,
  ).length;

  // 7. Generate chapter markers (for short: just one)
  const chapters = bestWindow
    ? [{ time: 0, title: 'Intro', originalTime: windowStart }]
    : [];

  return {
    keepSegments:      capped,
    silencesRemoved,
    estimatedDuration: _totalDuration(capped),
    highlights:        bestWindow ? [{ start: windowStart, end: windowEnd, score: bestWindow.score }] : [],
    chapters,
    windowStart,
    windowEnd,
    removedSegments:   inWindow.filter(s => s.keep === false).map(s => ({ start: s.start, end: s.end, reason: s.removeReason })),
  };
}

// ── LONG FORM plan ─────────────────────────────────────────────────────────
function _buildLongPlan({ jobId, probe, scoredSegments, silences, intent }) {
  // 1. Collect all keep=true segments
  const keepFromScores = scoredSegments
    .filter(s => s.keep !== false)
    .map(s => ({ start: s.start, end: s.end }));

  // If no segments were scored, fall back to full video minus silences
  const base = keepFromScores.length
    ? keepFromScores
    : [{ start: 0, end: probe.duration }];

  // 2. Remove silence intervals
  const refined = _removeIntervalsFromSegments(base, silences, {
    pad:                0.08,   // 80ms — more natural for long-form
    minSegmentDuration: 0.5,
  });

  // 3. Merge segments close together (< 300ms gap = keep as one)
  const merged = _mergeCloseSegments(refined, 0.3);

  // 4. Build chapters from topic shifts in scored segments
  const chapters = _buildChapters(scoredSegments);

  const silencesRemoved = silences.length;

  return {
    keepSegments:      merged,
    silencesRemoved,
    estimatedDuration: _totalDuration(merged),
    highlights:        _findHighlights(scoredSegments),
    chapters,
    windowStart:       0,
    windowEnd:         probe.duration,
    removedSegments:   scoredSegments.filter(s => s.keep === false).map(s => ({ start: s.start, end: s.end, reason: s.removeReason })),
  };
}

// ── Geometry helpers ───────────────────────────────────────────────────────

/**
 * Remove silence intervals from a list of keep-segments.
 * Segments are split around silences; slivers below minSegmentDuration are dropped.
 * Padding is applied to preserve natural speech boundaries (avoid cutting mid-word).
 */
function _removeIntervalsFromSegments(segments, silences, opts = {}) {
  const { pad = 0.08, minSegmentDuration = 0.35 } = opts;  // slightly larger defaults for natural cuts
  if (!silences.length) return segments;

  const result = [];

  for (const seg of segments) {
    let cursor = seg.start;

    for (const s of silences) {
      if (s.end <= seg.start || s.start >= seg.end) continue; // outside segment

      const cutStart = Math.max(seg.start, s.start - pad);
      const cutEnd   = Math.min(seg.end,   s.end   + pad);

      if (cutStart - cursor >= minSegmentDuration) {
        result.push({ start: cursor, end: cutStart });
      }
      cursor = cutEnd;
    }

    // Trailing piece
    if (seg.end - cursor >= minSegmentDuration) {
      result.push({ start: cursor, end: seg.end });
    }
  }

  return result;
}

/**
 * Merge segments where the gap between them is less than minGap seconds.
 */
function _mergeCloseSegments(segments, minGap = 0.15) {
  if (segments.length <= 1) return segments;
  const out = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const last = out[out.length - 1];
    if (segments[i].start - last.end <= minGap) {
      last.end = segments[i].end;
    } else {
      out.push({ ...segments[i] });
    }
  }
  return out;
}

function _capTotalDuration(segments, maxDur) {
  const result = [];
  let total = 0;
  for (const s of segments) {
    const available = maxDur - total;
    if (available <= 0) break;
    const d = Math.min(s.end - s.start, available);
    result.push({ start: s.start, end: s.start + d });
    total += d;
  }
  return result;
}

function _totalDuration(segments) {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0);
}

function _passThroughPlan(duration) {
  return {
    keepSegments:      [{ start: 0, end: duration }],
    silencesRemoved:   0,
    estimatedDuration: duration,
    highlights:        [],
    chapters:          [],
    windowStart:       0,
    windowEnd:         duration,
    removedSegments:   [],
  };
}

function _findHighlights(scored) {
  return scored
    .filter(s => s.hook >= 7 || s.retention >= 8)
    .slice(0, 5)
    .map(s => ({ start: s.start, end: s.end, score: (s.hook + s.retention) / 2, tone: s.tone }));
}

function _buildChapters(scored) {
  // Mark chapter break when tone shifts significantly or retention drops then recovers
  const chapters = [{ time: 0, title: 'Início' }];
  for (let i = 5; i < scored.length - 2; i++) {
    const prev = scored[i - 1];
    const curr = scored[i];
    const toneShift = prev.tone !== curr.tone && curr.tone !== 'neutral';
    const energyBump = curr.retention - prev.retention >= 3;
    if ((toneShift || energyBump) && curr.start - (chapters[chapters.length - 1]?.time ?? 0) > 30) {
      chapters.push({ time: curr.start, title: _toneLabel(curr.tone) });
    }
  }
  return chapters;
}

function _toneLabel(tone) {
  const map = { excitement: 'Momento de impacto', authority: 'Ponto-chave', curiosity: 'Revelação', neutral: 'Continuação' };
  return map[tone] || 'Próxima parte';
}

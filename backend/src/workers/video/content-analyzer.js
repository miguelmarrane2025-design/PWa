// workers/video/content-analyzer.js — v25
// ─────────────────────────────────────────────────────────────────────────
// 5-dimension scoring model with automatic start/end adjustment.
//
//   compositeScore = hook×0.35 + impact×0.25 + value×0.20 + clarity×0.10 + curiosity×0.10
//
// Gate rules (applied before clip candidate construction):
//   • hook < 7  → segment cannot open a clip
//   • isFiller  → always removed
//
// New in v25:
//   • curiosity dimension (was missing)
//   • startIdeal — AI identifies the exact word/phrase where the clip should start
//     (strips weak preamble like "então vamos lá… hoje eu vou te mostrar…")
//   • hasCleanEnd — AI flags whether segment ends with a complete idea
//   • _adjustClipStart() — trims the opener segment to startIdeal timestamp
//   • _adjustClipEnd()   — extends window to include the closing sentence if needed
//
// Returns (same interface as v24, backward-compat):
//   scoredSegments, bestWindow, topClips, fillerCount, selectionReason
// ─────────────────────────────────────────────────────────────────────────

import { chat }   from '../../lib/provider-manager.js';
import { logger } from '../../lib/logger.js';

const FILLER_RE = /^(é+\s*,?|hmm+|ahn+|ã+|então\s*,?|tipo\s*,?|né\s*,?|cara\s*,?|sabe\s*,?|olha\s*,?|bom\s*,?|tá\s*,?|ok\s*,?|certo\s*,?|ah+|oh+|uh+|um+|er+)$/i;

// 5-dimension weights (sum = 1.0)
const W = { hook: 0.35, impact: 0.25, value: 0.20, clarity: 0.10, curiosity: 0.10 };

// A clip can only START on a segment with hook >= this threshold
const MIN_HOOK_TO_OPEN = 7;

// How far before the startIdeal timestamp we trim (keeps natural breath before phrase)
const START_PAD_SEC = 0.15;

// ── Public entry point ─────────────────────────────────────────────────────
export async function analyzeContent({
  userId, segments, loudness, mode, transcript, userRequest, jobId,
}) {
  if (!segments.length) {
    return { scoredSegments: [], bestWindow: null, topClips: [], fillerCount: 0, selectionReason: '' };
  }

  // Step 1: pre-compute signals (no AI)
  const withSignals = segments.map(s => {
    const duration     = Math.max(0.1, s.end - s.start);
    const wordCount    = s.text.trim().split(/\s+/).filter(Boolean).length;
    const speechRate   = parseFloat((wordCount / duration).toFixed(2));
    const densityScore = Math.min(1, speechRate / 4.5);
    return {
      ...s,
      isFiller:     FILLER_RE.test(s.text.trim()),
      energy:       _avgEnergy(s.start, s.end, loudness),
      speechRate,
      densityScore,
    };
  });

  // Step 2: 5-dimension AI scoring
  logger.info(`[ContentAnalyzer:${jobId}] Scoring ${Math.min(segments.length, 120)} segs (5-dim)`);
  const scored = await _scoreSegments({ userId, segments: withSignals, mode, transcript, userRequest, jobId });

  // Step 3: build ranked clips with start/end adjustment
  const topClips = _buildTopClips(scored, mode);
  const best     = topClips[0] ?? null;

  // Backward-compat: bestWindow shape for cut-planner
  const bestWindowCompat = best ? {
    start:     best.adjustedStart ?? best.start,
    end:       best.adjustedEnd   ?? best.end,
    score:     best.compositeScore,
    hookScore: best.hookScore,
    segments:  best.segments,
  } : null;

  const fillerCount     = withSignals.filter(s => s.isFiller).length;
  const selectionReason = best?.explanation ?? '';

  logger.info(
    `[ContentAnalyzer:${jobId}] Done. fillers=${fillerCount} clips=${topClips.length}` +
    (best ? ` best=${best.adjustedStart?.toFixed(1) ?? best.start.toFixed(1)}s–${best.adjustedEnd?.toFixed(1) ?? best.end.toFixed(1)}s score=${best.compositeScore}` : ''),
  );

  return { scoredSegments: scored, bestWindow: bestWindowCompat, topClips, fillerCount, selectionReason };
}

// ── 5-dimension AI scoring ─────────────────────────────────────────────────
async function _scoreSegments({ userId, segments, mode, transcript, userRequest, jobId }) {
  const MAX_SEGS = 120;
  const batch    = segments.slice(0, MAX_SEGS);

  const segList = batch
    .map((s, i) =>
      `[${i}] ${s.start.toFixed(2)}s-${s.end.toFixed(2)}s ` +
      `energy=${s.energy.toFixed(2)} density=${s.densityScore.toFixed(2)} filler=${s.isFiller} | ` +
      `"${s.text.trim()}"`)
    .join('\n');

  const modeCtx = mode === 'short'
    ? 'Goal: find the BEST 30–90s viral clip. Hook must be irresistible (≥7). Prioritize curiosity and impact.'
    : 'Goal: clean long-form edit. Keep narrative, value and clarity. Remove dead air and filler.';

  const prompt = `You are a viral content strategist scoring video segments for maximum retention.

${modeCtx}
USER REQUEST: "${userRequest}"
VIDEO CONTEXT: "${transcript.slice(0, 500)}"

SEGMENTS:
${segList}

Score each segment on FIVE dimensions (0–10):

hook (0-10) — strength as a clip opener:
  9-10: surprising claim, bold result, pattern interrupt, strong number/promise
        e.g. "this one habit tripled my income", "nobody talks about this"
  7-8:  direct statement, strong contrast, engaging question
  5-6:  neutral, needs prior context to make sense
  0-4:  "uh", "so today", "let me explain", "hello everyone", "vamos lá"
  RULE: hook < 7 means segment CANNOT open a clip (mark keep=false if overall weak)

impact (0-10) — emotional intensity / energy level:
  9-10: peak emotion, high vocal energy, surprise, tension
  7-8:  clear enthusiasm, authority in delivery
  4-6:  moderate engagement
  0-3:  flat, monotone, low energy

value (0-10) — information density / usefulness:
  9-10: specific result, step-by-step, concrete insight, actionable
  7-8:  clear teaching point, direct answer
  4-6:  supporting context, builds on previous point
  0-3:  filler, meta-commentary, repetition

clarity (0-10) — understandable without prior context:
  9-10: completely self-contained, works as standalone clip
  7-8:  minimal context needed
  4-6:  references prior content ("as I said", "so this means")
  0-3:  incomprehensible without context ("that's why", "like I explained")

curiosity (0-10) — makes viewer want to keep watching:
  9-10: open loop, teaser, half-revealed insight ("and then I discovered…")
  7-8:  implies something valuable ahead, raises a question
  4-6:  informative but complete, no open loop
  0-3:  closes the loop, feels like an ending

tone: "excitement"|"authority"|"curiosity"|"story"|"humor"|"neutral"

startIdeal: the EXACT word or short phrase where this segment becomes strong
  — if the segment starts strong from the first word, set to null
  — e.g. if text is "então vamos lá… hoje eu vou te mostrar como triplicar…"
    startIdeal = "hoje eu vou te mostrar" or the strong part
  — this will be used to trim weak preamble from the segment start

hasCleanEnd: true if segment ends with a complete idea/sentence, false if it trails off

removeReason: null | "filler" | "intro-filler" | "repetition" | "off-topic" | "low-energy" | "low-hook"

keep: false if hook < 4 OR removeReason is set, otherwise true

Return ONLY a JSON array of exactly ${batch.length} objects, no markdown:
[{"idx":0,"hook":8,"impact":7,"value":8,"clarity":9,"curiosity":6,"tone":"authority","startIdeal":null,"hasCleanEnd":true,"removeReason":null,"keep":true},...]`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: 'Video editor AI. Return ONLY a valid JSON array, no markdown.' },
        { role: 'user', content: prompt },
      ],
      { userId, model: 'gpt-4o-mini', max_tokens: 4000, temperature: 0.15 },
    );

    const scores = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!Array.isArray(scores)) throw new Error('non-array response');

    if (scores.length !== batch.length) {
      logger.warn(`[ContentAnalyzer:${jobId}] AI ${scores.length}/${batch.length} scores — padding`);
    }

    const byIdx = Object.fromEntries(scores.map((s, pos) => [s.idx ?? pos, s]));

    return batch.map((seg, i) => {
      const sc = byIdx[i] ?? {};

      const hook      = typeof sc.hook      === 'number' ? Math.min(10, Math.max(0, sc.hook))      : 5;
      const impact    = typeof sc.impact    === 'number' ? Math.min(10, Math.max(0, sc.impact))    : 5;
      const value     = typeof sc.value     === 'number' ? Math.min(10, Math.max(0, sc.value))     : 5;
      const clarity   = typeof sc.clarity   === 'number' ? Math.min(10, Math.max(0, sc.clarity))   : 5;
      const curiosity = typeof sc.curiosity === 'number' ? Math.min(10, Math.max(0, sc.curiosity)) : 5;

      const compositeScore = parseFloat(
        (hook * W.hook + impact * W.impact + value * W.value + clarity * W.clarity + curiosity * W.curiosity)
        .toFixed(2)
      );

      const autoRemove = seg.isFiller ? 'filler' : (sc.removeReason ?? null);
      const keep       = !seg.isFiller && (sc.keep ?? true) && hook >= 3;

      // startIdeal: find the character position in text, convert to time offset
      const startIdealTime = _resolveStartIdeal(seg, sc.startIdeal);

      return {
        ...seg,
        hook, impact, value, clarity, curiosity,
        compositeScore,
        retention:    impact,   // backward-compat alias (cut-planner uses this)
        tone:         sc.tone ?? 'neutral',
        removeReason: autoRemove,
        keep,
        startIdeal:   sc.startIdeal ?? null,     // raw text phrase
        startIdealTime,                          // resolved timestamp (or null)
        hasCleanEnd:  sc.hasCleanEnd ?? true,
      };
    });
  } catch (err) {
    logger.warn(`[ContentAnalyzer:${jobId}] AI scoring failed: ${err.message} — energy fallback`);
    return batch.map(seg => {
      const hook      = Math.min(10, seg.energy * 6 + seg.densityScore * 4);
      const impact    = Math.min(10, seg.energy * 8 + seg.densityScore * 2);
      const value     = Math.min(10, seg.densityScore * 10);
      const clarity   = 5;
      const curiosity = 5;
      const compositeScore = parseFloat(
        (hook * W.hook + impact * W.impact + value * W.value + clarity * W.clarity + curiosity * W.curiosity)
        .toFixed(2)
      );
      return {
        ...seg,
        hook, impact, value, clarity, curiosity, compositeScore,
        retention:     impact,
        tone:          'neutral',
        removeReason:  seg.isFiller ? 'filler' : (seg.energy < 0.05 ? 'silence' : null),
        keep:          !seg.isFiller && seg.energy >= 0.05,
        startIdeal:    null,
        startIdealTime: null,
        hasCleanEnd:   true,
      };
    });
  }
}

// ── Resolve startIdeal text phrase → timestamp ────────────────────────────
// Finds the phrase in segment text, estimates the timestamp proportionally.
// If the phrase is found early in the text (< 20%) we skip — not worth trimming.
function _resolveStartIdeal(seg, startIdeal) {
  if (!startIdeal || !seg.text) return null;

  const text      = seg.text.trim();
  const needle    = startIdeal.trim().toLowerCase();
  const haystack  = text.toLowerCase();
  const idx       = haystack.indexOf(needle);

  if (idx <= 0) return null;

  const charFrac  = idx / text.length;
  if (charFrac < 0.15) return null; // only trim if phrase starts after 15% of segment

  // Estimate time: linear interpolation within segment
  const duration   = seg.end - seg.start;
  const idealTime  = seg.start + duration * charFrac - START_PAD_SEC;

  return Math.max(seg.start, parseFloat(idealTime.toFixed(3)));
}

// ── Build ranked non-overlapping clip candidates with start/end adjustment ─
function _buildTopClips(scored, mode, maxDuration = 90, maxClips = 5) {
  if (!scored.length) return [];

  const totalDur = scored[scored.length - 1].end;
  const minDur   = mode === 'short' ? 20 : 60;

  const candidates = [];

  for (let i = 0; i < scored.length; i++) {
    const opener = scored[i];

    // Gate: only segments with hook >= threshold can open a clip
    if (opener.hook < MIN_HOOK_TO_OPEN) continue;
    if (!opener.keep) continue;

    // Adjust start: use startIdealTime if the opener has a weak preamble
    const adjustedStart = opener.startIdealTime ?? opener.start;

    const windowEnd  = adjustedStart + maxDuration;
    let   j          = i;
    while (j < scored.length && scored[j].end <= windowEnd) j++;
    let windowSegs = scored.slice(i, j);

    // End adjustment: if last segment has no clean end, try to include the next segment
    const lastSeg = windowSegs[windowSegs.length - 1];
    if (lastSeg && !lastSeg.hasCleanEnd && j < scored.length) {
      const next = scored[j];
      // Include next segment only if it fits and improves the ending
      if (next && (adjustedStart + next.end - adjustedStart) <= maxDuration + 10) {
        windowSegs = [...windowSegs, next];
        j++;
      }
    }

    const adjustedEnd = Math.min(
      windowSegs[windowSegs.length - 1]?.end ?? (adjustedStart + maxDuration),
      totalDur,
    );

    const wDur = adjustedEnd - adjustedStart;
    if (wDur < minDur) continue;

    const keepSegs = windowSegs.filter(s => s.keep !== false);
    if (!keepSegs.length) continue;

    // Score: avg composite of kept segments + hook bonus above threshold
    const avgComposite  = keepSegs.reduce((a, s) => a + s.compositeScore, 0) / keepSegs.length;
    const hookBonus     = (opener.hook - MIN_HOOK_TO_OPEN) * 0.25;
    const fillerPenalty = windowSegs.filter(s => !s.keep).length / windowSegs.length * 2;
    // Bonus if clip has clean opening AND closing
    const completenessBonus = opener.startIdealTime == null ? 0.2 : 0;   // strong start from word 1
    const endBonus          = (lastSeg?.hasCleanEnd ?? true) ? 0.2 : 0;

    const windowScore = parseFloat(
      (avgComposite + hookBonus + completenessBonus + endBonus - fillerPenalty).toFixed(2)
    );

    candidates.push({
      start:          opener.start,
      adjustedStart,
      end:            Math.min(opener.start + maxDuration, totalDur),
      adjustedEnd,
      compositeScore: windowScore,
      hookScore:      opener.hook,
      impactScore:    opener.impact,
      valueScore:     opener.value,
      clarityScore:   opener.clarity,
      curiosityScore: opener.curiosity,
      hookText:       opener.text?.trim().slice(0, 100) ?? '',
      startIdeal:     opener.startIdeal ?? null,
      tone:           opener.tone ?? 'neutral',
      segments:       windowSegs,
      keepCount:      keepSegs.length,
      hasCleanEnd:    lastSeg?.hasCleanEnd ?? true,
    });
  }

  candidates.sort((a, b) => b.compositeScore - a.compositeScore);

  // Pick top N non-overlapping (based on adjusted ranges)
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= maxClips) break;
    const overlaps = picked.some(p =>
      Math.max(p.adjustedStart, c.adjustedStart) < Math.min(p.adjustedEnd, c.adjustedEnd)
    );
    if (!overlaps) picked.push(c);
  }

  return picked.map((c, rank) => ({
    ...c,
    rank:        rank + 1,
    score:       c.compositeScore,  // backward compat alias
    explanation: _buildExplanation(c, rank),
  }));
}

// ── Human-readable explanation for each clip ──────────────────────────────
function _buildExplanation(clip, rank) {
  const toneMap = {
    excitement: 'alta energia',
    authority:  'autoridade',
    curiosity:  'curiosidade',
    story:      'narrativa',
    humor:      'humor',
    neutral:    'valor direto',
  };
  const toneLabel  = toneMap[clip.tone] ?? 'conteúdo relevante';
  const strongest  = _strongestDimension(clip);
  const preview    = clip.hookText ? `"${clip.hookText.slice(0, 70)}…"` : '';
  const trimNote   = clip.startIdeal ? ` (início ajustado: preamble removido)` : '';
  const endNote    = !clip.hasCleanEnd ? ' · final estendido para ideia completa' : '';

  if (rank === 0) {
    return `Selecionado por ${strongest} · ${toneLabel} · hook ${clip.hookScore}/10${trimNote}${endNote}. Abre em: ${preview}`;
  }
  return `Alternativa ${rank + 1}: ${toneLabel} · score ${clip.compositeScore} (hook ${clip.hookScore})${trimNote}`;
}

function _strongestDimension(clip) {
  const dims = [
    { label: 'hook forte',     val: (clip.hookScore      ?? 0) * W.hook },
    { label: 'alto impacto',   val: (clip.impactScore    ?? 0) * W.impact },
    { label: 'alto valor',     val: (clip.valueScore     ?? 0) * W.value },
    { label: 'alta clareza',   val: (clip.clarityScore   ?? 0) * W.clarity },
    { label: 'alta curiosidade',val:(clip.curiosityScore ?? 0) * W.curiosity },
  ];
  return dims.sort((a, b) => b.val - a.val)[0].label;
}

function _avgEnergy(start, end, loudness) {
  if (!loudness.length) return 0.5;
  const pts = loudness.filter(p => p.time >= start && p.time <= end);
  if (!pts.length) return 0.5;
  return pts.reduce((a, p) => a + p.rms, 0) / pts.length;
}

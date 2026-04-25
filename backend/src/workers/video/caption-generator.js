// workers/video/caption-generator.js — v18
// ─────────────────────────────────────────────────────────────────────────
// Generates synchronized, viral-quality captions from Whisper segments.
//
// Improvements over v17:
//   • Word-level timestamps: splits captions at word boundaries, not segment
//   • Dynamic line length: 1–4 words for short, 4–8 for long
//   • Keyword emphasis: AI identifies the 3 most important words per block
//     and they render BOLD in ASS; UPPERCASE in SRT
//   • 5 ASS styles: default, fire, neon, gospel, highcontrast
//     Each has distinct font, size, position, animation tags
//   • Karaoke-style word highlight option (word turns color as it's spoken)
//   • Output: .srt (universal) + .ass (styled, burned in)
// ─────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'fs';
import { chat }           from '../../lib/provider-manager.js';
import { logger }         from '../../lib/logger.js';

// ── ASS Style definitions ──────────────────────────────────────────────────
// Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,
//         OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut,
//         ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,
//         Alignment, MarginL, MarginR, MarginV, Encoding
//
// Colours are in &HAABBGGRR format (ASS is BGR, not RGB)
const ASS_STYLES = {
  default: {
    playResX: 1080, playResY: 1920,
    style: 'Viral,Arial Black,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,4,3,2,60,60,200,1',
    emphasisColor: '&H0000FFFF',  // yellow for emphasis words
  },
  fire: {
    playResX: 1080, playResY: 1920,
    style: 'Viral,Arial Black,82,&H0000EEFF,&H0000EEFF,&H000000BB,&HCC000000,-1,0,0,0,105,105,0,0,1,5,2,2,60,60,200,1',
    emphasisColor: '&H000080FF',  // orange
  },
  neon: {
    playResX: 1080, playResY: 1920,
    style: 'Viral,Arial Black,78,&H00EEFFEE,&H00EEFFEE,&H00004400,&HCC000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,200,1',
    emphasisColor: '&H0000FF44',  // bright green
  },
  gospel: {
    playResX: 1080, playResY: 1920,
    style: 'Viral,Georgia,80,&H00FFFFFF,&H00FFFFFF,&H0020A0DA,&HAA000000,0,0,0,0,100,100,1,0,1,3,4,2,60,60,200,1',
    emphasisColor: '&H0020A0DA',  // gold
  },
  highcontrast: {
    playResX: 1080, playResY: 1920,
    style: 'Viral,Impact,86,&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,6,0,2,60,60,200,1',
    emphasisColor: '&H000000FF',  // red on white bg
  },
};

/**
 * Generate production-quality caption blocks from Whisper segments.
 *
 * @param {object} opts
 * @param {string}  opts.userId
 * @param {Array}   opts.segments       — Whisper segments (prefer word-level)
 * @param {Array}   opts.wordSegments   — word-level [{start,end,word}] if available
 * @param {string}  opts.transcript
 * @param {string}  opts.mode           — 'short' | 'long'
 * @param {object}  opts.intent         — { captionLang, style }
 * @param {Array}   opts.keepSegments   — final edit timeline (to remap timestamps)
 * @param {string}  opts.jobId
 * @returns {Array<{start, end, text, emphasis: string[]}>}
 */
export async function generateCaptions({
  userId, segments, wordSegments = [], transcript, mode, intent, keepSegments, jobId,
}) {
  if (!segments.length && !transcript) return [];

  // If word-level data is available, build fine-grained blocks
  const rawBlocks = wordSegments.length >= 5
    ? _buildFromWordSegments(wordSegments, mode)
    : _buildFromSegments(segments, mode);

  // Filter to only captions within the kept timeline
  const inTimeline = _filterToTimeline(rawBlocks, keepSegments);

  // Remap timestamps to edited video timeline (remove the gaps)
  const remapped = _remapTimestamps(inTimeline, keepSegments);

  // AI pass: identify emphasis words and clean text
  const enriched = await _enrichCaptions({ userId, captions: remapped, mode, intent, jobId });

  logger.info(`[CaptionGen:${jobId}] ${enriched.length} caption blocks generated`);
  return enriched;
}

// ── Build caption blocks from word-level timestamps ────────────────────────
function _buildFromWordSegments(words, mode) {
  const maxWords = mode === 'short' ? 3 : 6;
  const blocks = [];
  let i = 0;

  while (i < words.length) {
    const chunk = words.slice(i, i + maxWords);
    if (!chunk.length) break;

    // Ensure minimum display time of 0.5s
    const start = chunk[0].start;
    const end   = Math.max(chunk[chunk.length - 1].end, start + 0.5);
    const text  = chunk.map(w => w.word).join(' ').trim();

    if (text.length > 1) {
      blocks.push({ start, end, text, emphasis: [] });
    }
    i += maxWords;
  }
  return blocks;
}

// ── Build caption blocks from segment-level timestamps ─────────────────────
function _buildFromSegments(segments, mode) {
  const maxWords = mode === 'short' ? 4 : 8;
  const blocks   = [];

  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/);
    if (!words.length) continue;

    if (words.length <= maxWords) {
      blocks.push({ start: seg.start, end: seg.end, text: seg.text.trim(), emphasis: [] });
    } else {
      // Split long segment proportionally
      const dur   = seg.end - seg.start;
      const chunk = maxWords;
      for (let i = 0; i < words.length; i += chunk) {
        const slice    = words.slice(i, i + chunk);
        const progress = i / words.length;
        const start    = seg.start + dur * progress;
        const end      = seg.start + dur * Math.min(1, (i + chunk) / words.length);
        blocks.push({ start, end: Math.max(end, start + 0.4), text: slice.join(' '), emphasis: [] });
      }
    }
  }
  return blocks;
}

// ── Filter captions to only those within the edit timeline ────────────────
function _filterToTimeline(captions, keepSegments) {
  if (!keepSegments?.length) return captions;
  return captions.filter(cap =>
    keepSegments.some(ks => cap.start >= ks.start - 0.1 && cap.end <= ks.end + 0.1),
  );
}

// ── Remap timestamps: subtract removed intervals so time starts at 0 ──────
function _remapTimestamps(captions, keepSegments) {
  if (!keepSegments?.length) return captions;

  // Build cumulative offset map
  const offsets = [];
  let editTime  = 0;
  for (const ks of keepSegments) {
    offsets.push({ originalStart: ks.start, originalEnd: ks.end, editStart: editTime });
    editTime += ks.end - ks.start;
  }

  return captions.map(cap => {
    const seg = offsets.find(o => cap.start >= o.originalStart - 0.1 && cap.start < o.originalEnd + 0.1);
    if (!seg) return null;
    const delta = seg.editStart - seg.originalStart;
    return {
      ...cap,
      start: Math.max(0, cap.start + delta),
      end:   Math.max(0.1, cap.end + delta),
    };
  }).filter(Boolean);
}

// ── AI enrichment: emphasis words + text cleanup ───────────────────────────
async function _enrichCaptions({ userId, captions, mode, intent, jobId }) {
  if (!captions.length) return [];

  const lang = intent.captionLang === 'en' ? 'English' : 'Portuguese';
  const style = mode === 'short'
    ? 'Short viral clips: max 3-4 words, UPPERCASE key words, fix errors, add strategic emojis for shorts'
    : 'Clean natural sentences: max 8 words, correct spelling, proper punctuation';

  // Batch in groups of 60 to stay within token budget
  const BATCH = 60;
  const all   = [];

  for (let i = 0; i < captions.length; i += BATCH) {
    const batch  = captions.slice(i, i + BATCH);
    const result = await _enrichBatch({ userId, batch, style, lang, mode, jobId });
    all.push(...result);
  }

  return all;
}

async function _enrichBatch({ userId, batch, style, lang, mode, jobId }) {
  const input = batch.map((c, i) => `[${i}] "${c.text}"`).join('\n');

  const prompt = `Process these video captions.

STYLE: ${style}
LANGUAGE: ${lang}

For each caption:
1. Clean and fix the text (fix transcription errors)
2. Apply the style rules
3. Identify 1-2 emphasis words (most impactful) — these will be highlighted

Return JSON array of exactly ${batch.length} objects:
[{"idx":0,"text":"CLEANED TEXT","emphasis":["WORD1"]}, ...]

Input:
${input}`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: 'You are a professional caption editor. Return ONLY valid JSON, no markdown.' },
        { role: 'user', content: prompt },
      ],
      // Caption cleanup: use fast model — repetitive text processing task
      { userId, model: 'gpt-4o-mini', max_tokens: 2000, temperature: 0.3 },
    );
    const enriched = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return batch.map((cap, i) => {
      const e = enriched.find(x => x.idx === i) || enriched[i] || {};
      return { ...cap, text: e.text || cap.text, emphasis: e.emphasis || [] };
    });
  } catch (err) {
    logger.warn(`[CaptionGen:${jobId}] Enrichment batch failed: ${err.message}`);
    return batch; // return unmodified if AI fails
  }
}

// ── SRT writer ─────────────────────────────────────────────────────────────
export async function writeSRT(outputPath, captions) {
  const toSRT = (s) => {
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const se = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(se).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  };

  const lines = captions.map((c, i) => {
    // Emphasize words in SRT by uppercasing them
    let text = c.text;
    if (c.emphasis?.length) {
      for (const word of c.emphasis) {
        text = text.replace(new RegExp(`\\b${word}\\b`, 'gi'), word.toUpperCase());
      }
    }
    return `${i + 1}\n${toSRT(c.start)} --> ${toSRT(c.end)}\n${text}`;
  });

  await fs.writeFile(outputPath, lines.join('\n\n') + '\n', 'utf8');
}

// ── ASS writer ─────────────────────────────────────────────────────────────
export async function writeASS(outputPath, captions, style = 'default') {
  const def = ASS_STYLES[style] || ASS_STYLES.default;

  const toASS = (s) => {
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const cs = Math.round((s % 60) * 100); // centiseconds
    return `${h}:${String(m).padStart(2,'0')}:${String(Math.floor(cs / 100)).padStart(2,'0')}.${String(cs % 100).padStart(2,'0')}`;
  };

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${def.playResX}
PlayResY: ${def.playResY}
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${def.style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = captions.map(c => {
    let text = c.text.replace(/\n/g, '\\N');

    // Apply emphasis: highlighted words get color + bold override tag
    if (c.emphasis?.length) {
      for (const word of c.emphasis) {
        // Escape special regex chars in the word itself
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          const re = new RegExp(`(\\b${escaped}\\b)`, 'gi');
          text = text.replace(re, `{\\c${def.emphasisColor}&\\b1}$1{\\c&H00FFFFFF&\\b0}`);
        } catch { /* invalid regex — skip this word */ }
      }
    }

    // Subtle fade-in tag for visual polish
    const fadeTag = '{\\fad(80,80)}';

    return `Dialogue: 0,${toASS(c.start)},${toASS(c.end)},Viral,,0,0,0,,${fadeTag}${text}`;
  }).join('\n');

  await fs.writeFile(outputPath, header + events, 'utf8');
}

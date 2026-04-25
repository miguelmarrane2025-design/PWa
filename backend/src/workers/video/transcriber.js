// workers/video/transcriber.js — v18
// ─────────────────────────────────────────────────────────────────────────
// Whisper transcription with word-level timestamps.
//
// Returns:
//   transcript   — full text string
//   segments     — segment-level [{start, end, text, avg_logprob}]
//   words        — word-level [{start, end, word}] (when available)
//
// The word-level data feeds the caption generator for frame-accurate
// caption splits. avg_logprob is passed to content-analyzer as a
// confidence signal (low confidence segments may be filler or noise).
// ─────────────────────────────────────────────────────────────────────────

import { promises as fs }  from 'fs';
import path                from 'path';
import { exec }            from 'child_process';
import { promisify }       from 'util';
import { createReadStream } from 'fs';
import { getClientForUser } from '../../lib/provider-manager.js';
import { logger }          from '../../lib/logger.js';

const execAsync = promisify(exec);

/**
 * Transcribe a video file via Whisper.
 *
 * @param {object} opts
 * @param {string} opts.videoPath
 * @param {string} opts.tempDir
 * @param {string} opts.userId
 * @param {string} opts.language   — 'pt' | 'en'
 * @param {string} opts.jobId
 * @returns {{ transcript, segments, words }}
 */
export async function transcribeVideo({ videoPath, tempDir, userId, language = 'pt', jobId }) {
  const audioPath = path.join(tempDir, `${jobId}_audio.mp3`);

  // ── Extract audio optimized for Whisper ─────────────────────────────────
  // 16kHz mono is Whisper's native format — saves tokens and speeds transcription
  logger.info(`[Transcriber:${jobId}] Extracting audio`);
  await execAsync(
    `ffmpeg -i ${videoPath} -vn -ar 16000 -ac 1 -c:a libmp3lame -q:a 5 ${audioPath} -y`,
    { timeout: 5 * 60 * 1000 },
  );

  // ── Call Whisper ─────────────────────────────────────────────────────────
  logger.info(`[Transcriber:${jobId}] Calling Whisper`);
  try {
    const { client } = await getClientForUser(userId);
    const stream = createReadStream(audioPath);

    const resp = await client.audio.transcriptions.create({
      model:                   'whisper-1',
      file:                    stream,
      response_format:         'verbose_json',
      timestamp_granularities: ['segment', 'word'],
      language:                language === 'en' ? 'en' : 'pt',
    });

    const segments = (resp.segments || []).map(s => ({
      start:       s.start,
      end:         s.end,
      text:        s.text,
      avg_logprob: s.avg_logprob ?? -0.3,  // confidence: closer to 0 = better
      no_speech:   s.no_speech_prob ?? 0,
    }));

    // Word-level data (available when granularities includes 'word')
    const words = (resp.words || []).map(w => ({
      start: w.start,
      end:   w.end,
      word:  w.word?.trim(),
    })).filter(w => w.word);

    logger.info(`[Transcriber:${jobId}] ${segments.length} segments, ${words.length} words`);

    return {
      transcript: resp.text || '',
      segments,
      words,
    };
  } catch (err) {
    logger.warn(`[Transcriber:${jobId}] Whisper failed: ${err.message}`);
    return { transcript: '', segments: [], words: [] };
  } finally {
    await fs.unlink(audioPath).catch(() => {});
  }
}

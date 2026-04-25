// agents/videoAgent.js — v18
// ─────────────────────────────────────────────────────────────────────────
// VideoMaker Agent — professional edit pipeline.
//
// Pipeline stages:
//   1. probe         — video metadata (duration, resolution, fps)
//   2. transcribe    — Whisper (segment + word level timestamps)
//   3. detect        — FFmpeg silencedetect (exact silence intervals + energy)
//   4. analyze       — AI content scoring (hook, retention, filler, tone)
//   5. plan          — pure geometry cut planner (no extra AI calls)
//   6. captions      — AI caption enrichment + emphasis words
//   7. render        — FFmpeg with audio normalization + platform preset
//
// External API (routes/video.js) is UNCHANGED.
// ─────────────────────────────────────────────────────────────────────────

import { promises as fs }  from 'fs';
import path                from 'path';
import { v4 as uuidv4 }   from 'uuid';
import { chat }            from '../lib/provider-manager.js';
import { config }          from '../config/index.js';
import { logger }          from '../lib/logger.js';

// Workers
import { transcribeVideo }                           from '../workers/video/transcriber.js';
import { detectSilences, buildKeepSegments }         from '../workers/video/silence-detector.js';
import { analyzeContent }                            from '../workers/video/content-analyzer.js';
import { planCuts }                                  from '../workers/video/cut-planner.js';
import { generateCaptions, writeSRT, writeASS }      from '../workers/video/caption-generator.js';
import { probeVideo, renderVideo }                   from '../workers/video/renderer.js';

const OUTPUT_DIR  = config.storage.output || '/app/storage/outputs';
const TEMP_DIR    = config.storage.temp   || '/app/storage/temp';
const BACKEND_URL = () => process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;

// ── Intent parser ─────────────────────────────────────────────────────────
function _parseIntent(message) {
  const m = message.toLowerCase();

  const mode = /\b(short|reels?|tiktok|shorts?|vertical|curto|clip)\b/.test(m) ? 'short'
             : /\b(long|youtube|podcast|horizontal|longo|completo|full)\b/.test(m) ? 'long'
             : 'auto';

  const platform = /\btiktok\b/.test(m)              ? 'tiktok'
                 : /\breels?\b/.test(m)               ? 'reels'
                 : /\bshorts?\b/.test(m)              ? 'shorts'
                 : /\byoutube\b/.test(m)              ? 'youtube'
                 : null; // auto-detect

  const style = /\b(fire|chama|laranja)\b/.test(m)       ? 'fire'
              : /\b(neon|verde)\b/.test(m)                ? 'neon'
              : /\b(gospel|ouro|dourado)\b/.test(m)       ? 'gospel'
              : /\b(highcontrast|contraste|preto)\b/.test(m) ? 'highcontrast'
              : /\b(clean|branco|simples)\b/.test(m)      ? 'default'
              : 'default';

  const removeSilence = !/\b(mant[eé]r?\s+pausas?|keep\s+silence)\b/.test(m);
  const removeFiller  = !/\b(mant[eé]r?\s+(filler|v[íi]cios))\b/.test(m);
  const captionLang   = /\b(english|ingl[eê]s)\b/.test(m) ? 'en' : 'pt';
  const noAudio       = /\b(sem\s+legenda|no\s+caption|sem\s+closed)\b/.test(m);

  return { mode, platform, style, removeSilence, removeFiller, captionLang, noAudio };
}

// ── Main entry point ──────────────────────────────────────────────────────
export async function videoAgent({ userId, message, context = [], files = [], onStageChange = null }) {
  const videoFiles = files.filter(f => /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(f.originalname ?? ''));

  if (!videoFiles.length) {
    return _conversational({ userId, message, context });
  }

  const intent = _parseIntent(message);
  logger.info(`[VideoAgent] mode=${intent.mode} platform=${intent.platform || 'auto'} style=${intent.style} files=${videoFiles.length}`);

  const results = [];
  for (const file of videoFiles) {
    try {
      results.push(await _processVideo({ userId, file, intent, message, onStageChange }));
    } catch (err) {
      logger.error(`[VideoAgent] ${file.originalname}: ${err.message}`);
      results.push({ filename: file.originalname, status: 'error', error: err.message });
    }
  }

  const ok     = results.filter(r => r.status === 'done');
  const failed = results.filter(r => r.status === 'error');
  return { type: 'video_result', content: _buildSummary(ok, failed, intent), results: ok };
}

// ── Core pipeline ─────────────────────────────────────────────────────────
async function _processVideo({ userId, file, intent, message, onStageChange }) {
  const notify = async (stage) => {
    if (typeof onStageChange === 'function') await onStageChange(stage).catch(() => {});
  };
  const jobId    = uuidv4();
  const baseName = path.parse(file.originalname).name.replace(/[^a-z0-9_-]/gi, '_');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(TEMP_DIR,   { recursive: true });

  // ── STAGE 1: Probe ───────────────────────────────────────────────────
  logger.info(`[VideoAgent:${jobId}] ▶ Stage 1/7 — Probe`);
  await notify('analyzing');
  const probe = await probeVideo(file.path);
  if (!probe.duration) throw new Error('Não foi possível ler a duração do vídeo. Verifique o arquivo.');

  // Resolve final mode
  const mode = intent.mode === 'auto'
    ? (probe.duration <= 150 ? 'short' : 'long')
    : intent.mode;

  logger.info(`[VideoAgent:${jobId}] duration=${probe.duration.toFixed(1)}s mode=${mode} ${probe.width}x${probe.height}@${probe.fps.toFixed(1)}fps`);

  // ── STAGE 2: Transcribe ──────────────────────────────────────────────
  logger.info(`[VideoAgent:${jobId}] ▶ Stage 2/7 — Transcribe`);
  await notify('transcribing');
  const { transcript, segments, words } = await transcribeVideo({
    videoPath: file.path, tempDir: TEMP_DIR,
    userId, language: intent.captionLang, jobId,
  });

  // ── STAGE 3: Silence detection ───────────────────────────────────────
  logger.info(`[VideoAgent:${jobId}] ▶ Stage 3/7 — Silence detection`);
  await notify('detecting');
  const { silences, loudness } = intent.removeSilence
    ? await detectSilences(file.path, mode, jobId)
    : { silences: [], loudness: [] };

  logger.info(`[VideoAgent:${jobId}] ${silences.length} silence intervals detected`);

  // ── STAGE 4: Content analysis ────────────────────────────────────────
  logger.info(`[VideoAgent:${jobId}] ▶ Stage 4/7 — Content analysis`);
  await notify('analyzing');
  const { scoredSegments, bestWindow, topClips, fillerCount, selectionReason } = await analyzeContent({
    userId, segments, loudness, mode, transcript, userRequest: message, jobId,
  });

  // ── STAGE 5: Cut planning ────────────────────────────────────────────
  logger.info(`[VideoAgent:${jobId}] ▶ Stage 5/7 — Cut planning`);
  await notify('planning');
  const editPlan = planCuts({
    jobId, mode, probe, scoredSegments, bestWindow,
    silences: intent.removeSilence ? silences : [],
    intent,
  });

  logger.info(`[VideoAgent:${jobId}] Plan: ${editPlan.keepSegments.length} segments, est. ${editPlan.estimatedDuration.toFixed(1)}s`);

  // ── STAGE 6: Captions ─────────────────────────────────────────────────
  logger.info(`[VideoAgent:${jobId}] ▶ Stage 6/7 — Captions`);
  await notify('captions');
  const srtPath = path.join(OUTPUT_DIR, `${baseName}_captions_${jobId.slice(0,8)}.srt`);
  const assPath = path.join(TEMP_DIR,   `${jobId}_captions.ass`);

  let captions = [];
  if (!intent.noAudio) {
    captions = await generateCaptions({
      userId, segments, wordSegments: words, transcript,
      mode, intent, keepSegments: editPlan.keepSegments, jobId,
    });
    await writeSRT(srtPath, captions);
    await writeASS(assPath, captions, intent.style);
  } else {
    await writeASS(assPath, [], intent.style);
    await writeSRT(srtPath, []);
  }

  // ── STAGE 7: Render ──────────────────────────────────────────────────
  // FIX #4: wrap render in try/finally so assPath is always cleaned up,
  // even if FFmpeg throws (e.g. codec error, disk full, no audio stream).
  logger.info(`[VideoAgent:${jobId}] ▶ Stage 7/7 — Render`);
  logger.info(`[VideoAgent:${jobId}] ffmpeg iniciado input=${file.path}`);
  await notify('rendering');
  const outputPath = path.join(OUTPUT_DIR, `${baseName}_edited_${jobId.slice(0,8)}.mp4`);

  try {
    await renderVideo({
      inputPath:      file.path,
      outputPath,
      assPath,
      keepSegments:   editPlan.keepSegments,
      probe,
      mode,
      platform:       intent.platform,
      normalizeAudio: true,
      jobId,
      onProgress: (pct) => logger.debug(`[VideoAgent:${jobId}] Render ${pct}%`),
    });
  } finally {
    // ── Cleanup temp ASS — always, success or failure ─────────────────
    await fs.unlink(assPath).catch(() => {});
  }

  const [outStat, outProbe] = await Promise.all([
    fs.stat(outputPath),
    probeVideo(outputPath),
  ]);

  return {
    status:       'done',
    jobId,
    filename:     file.originalname,
    outputFile:   `${baseName}_edited_${jobId.slice(0,8)}.mp4`,
    captionsFile: `${baseName}_captions_${jobId.slice(0,8)}.srt`,
    downloadUrl:  `${BACKEND_URL()}/video/download/${jobId.slice(0,8)}/${baseName}_edited_${jobId.slice(0,8)}.mp4`,
    captionsUrl:  `${BACKEND_URL()}/video/download/${jobId.slice(0,8)}/${baseName}_captions_${jobId.slice(0,8)}.srt`,
    stats: {
      originalDuration: probe.duration,
      editedDuration:   outProbe.duration,
      savedSeconds:     Math.max(0, Math.round(probe.duration - outProbe.duration)),
      silencesRemoved:  editPlan.silencesRemoved,
      fillerRemoved:    fillerCount,
      cutsApplied:      editPlan.keepSegments.length,
      captionBlocks:    captions.length,
      outputSizeMB:     (outStat.size / 1024 / 1024).toFixed(1),
      mode,
      platform:         intent.platform || 'auto',
      captionStyle:     intent.style,
      highlights:       editPlan.highlights || [],
      chapters:         editPlan.chapters   || [],
      suggestedTitle:   editPlan.suggestedTitle || '',
      topClips:         (topClips || []).slice(0, 3).map(c => ({
        rank:           c.rank,
        start:          c.adjustedStart ?? c.start,
        end:            c.adjustedEnd   ?? c.end,
        score:          c.compositeScore ?? c.score,
        hookScore:      c.hookScore,
        impactScore:    c.impactScore,
        valueScore:     c.valueScore,
        clarityScore:   c.clarityScore,
        curiosityScore: c.curiosityScore,
        tone:           c.tone,
        explanation:    c.explanation,
        hookText:       c.hookText,
        startIdeal:     c.startIdeal,
        hasCleanEnd:    c.hasCleanEnd,
      })),
      selectionReason:  selectionReason || '',
    },
    transcript: transcript.slice(0, 1000),
  };
}

// ── Conversational fallback ────────────────────────────────────────────────
async function _conversational({ userId, message, context }) {
  const SYSTEM = `Você é o VideoMaker Agent do BotSquad — editor de vídeo AI profissional.

Pipeline completo:
• Transcrição Whisper com timestamps por palavra
• Detecção automática de silêncios e pausas via FFmpeg
• Análise semântica: pontuação de hook, retenção, vícios de linguagem
• Planejamento inteligente de cortes (short: melhor janela 30–90s; long: limpeza completa)
• Legendas virais sincronizadas por palavra com estilos: default, fire, neon, gospel, highcontrast
• Normalização de áudio (loudnorm) + presets por plataforma: TikTok, Reels, Shorts, YouTube

Para editar, envie um vídeo (MP4, MOV, AVI, MKV, WEBM) com sua mensagem.
Exemplos: "editar para reels estilo fire", "cortar para shorts sem legendas", "editar youtube completo"

Responda em português de forma direta.`;

  const content = await chat(
    [{ role: 'system', content: SYSTEM }, ...context.slice(-6), { role: 'user', content: message }],
    { userId, max_tokens: 1200 },
  );
  return { type: 'text', content };
}

// ── Summary builder ───────────────────────────────────────────────────────
function _buildSummary(ok, failed, intent) {
  if (!ok.length && failed.length) {
    return `❌ Erro ao processar ${failed.length} vídeo(s):\n${failed.map(f => `• **${f.filename}**: ${f.error}`).join('\n')}`;
  }

  const lines = [];
  for (const r of ok) {
    const { stats: s } = r;
    const reduction = s.originalDuration > 0
      ? Math.round((1 - s.editedDuration / s.originalDuration) * 100)
      : 0;

    lines.push(
      `🎬 **${r.filename}** editado com sucesso!`,
      ``,
      `📊 **Pipeline completo:**`,
      `• Duração: ${s.originalDuration.toFixed(1)}s → **${s.editedDuration.toFixed(1)}s** (${reduction}% menor)`,
      `• Silêncios removidos: **${s.silencesRemoved}** · Vícios: **${s.fillerRemoved}**`,
      `• Cortes aplicados: **${s.cutsApplied}** · Legendas: **${s.captionBlocks} blocos**`,
      `• Plataforma: ${_platformEmoji(s.platform, s.mode)} · Estilo: ${s.captionStyle}`,
      `• Tamanho final: ${s.outputSizeMB}MB`,
    );

    if (s.chapters?.length > 1) {
      lines.push(``, `📑 **Capítulos gerados:**`);
      s.chapters.forEach(c => lines.push(`• ${_formatTime(c.time)} — ${c.title}`));
    }

    if (s.highlights?.length) {
      lines.push(``, `⭐ **Melhores momentos:**`);
      s.highlights.slice(0,3).forEach(h =>
        lines.push(`• ${_formatTime(h.start)}–${_formatTime(h.end)} (score: ${h.score?.toFixed?.(1) ?? h.score})`)
      );
    }

    lines.push(
      ``,
      `📥 **Downloads:**`,
      `• 🎬 [Vídeo editado com legendas](${r.downloadUrl})`,
      `• 📝 [Legendas SRT](${r.captionsUrl})`,
    );

    if (r.transcript?.length > 10) {
      lines.push(``, `📋 _${r.transcript.slice(0, 280)}..._`);
    }
  }

  if (failed.length) {
    lines.push(``, `⚠️ ${failed.length} com erro: ${failed.map(f => f.filename).join(', ')}`);
  }

  lines.push(
    ``,
    `💡 **Comandos disponíveis:**`,
    `"editar para reels" · "editar para youtube" · "estilo fire/neon/gospel/highcontrast" · "sem legendas"`,
  );

  return lines.join('\n');
}

function _formatTime(secs) {
  if (!secs && secs !== 0) return '?';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function _platformEmoji(platform, mode) {
  const map = { tiktok: '🎵 TikTok', reels: '📸 Reels', shorts: '▶️ Shorts', youtube: '🖥️ YouTube', hd: '🎬 HD' };
  return map[platform] || (mode === 'short' ? '📱 Short Form' : '🖥️ Long Form');
}

export default videoAgent;

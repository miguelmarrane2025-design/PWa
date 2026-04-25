// routes/video.js — v21
// Uses jobQueue for resilient async processing.
// Jobs survive server restarts via Postgres.

import { Router }         from 'express';
import multer             from 'multer';
import path               from 'path';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline as pipelineCallback } from 'stream';
import { promisify } from 'util';
import { requireAuth }    from '../middleware/auth.js';
import videoAgent         from '../agents/videoAgent.js';
import { query }          from '../db/index.js';
import { config }         from '../config/index.js';
import { logger }         from '../lib/logger.js';
import { jobQueue }       from '../lib/job-queue.js';
import { v4 as uuidv4 }  from 'uuid';
import { processVideoJob as runVideoPipeline } from '../video/videoPipeline.js';

const router  = Router();
const OUT_DIR = config.storage.output || '/app/storage/outputs';
const pipeline = promisify(pipelineCallback);
const VIDEO_UPLOAD_ROOT = path.join(config.storage.upload, 'videos');
const VIDEO_ORIGINAL_DIR = path.join(VIDEO_UPLOAD_ROOT, 'original');
const VIDEO_CHUNKS_DIR = path.join(VIDEO_UPLOAD_ROOT, 'chunks');
const VIDEO_META_DIR = path.join(config.storage.jobs || path.join(path.dirname(config.storage.upload), 'jobs'), 'videos');
const CHUNK_SIZE = 10 * 1024 * 1024;

const upload = multer({
  dest: config.storage.temp,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(file.originalname ?? '');
    cb(ok ? null : Object.assign(new Error('Apenas vídeos são aceitos'), { status: 400 }), ok);
  },
});

const videoUpload = multer({
  dest: config.storage.temp,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(file.originalname ?? '');
    cb(ok ? null : Object.assign(new Error('Apenas vídeos são aceitos'), { status: 400 }), ok);
  },
});

const chunkUpload = multer({
  dest: config.storage.temp,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ── POST /video/upload and /api/video/upload ─────────────────────────────
router.post('/upload', requireAuth, videoUpload.single('file'), async (req, res) => {
  await ensureVideoStorage();
  if (!req.file) return res.status(400).json({ error: 'Envie um arquivo de vídeo.' });

  const videoId = uuidv4();
  const finalPath = path.join(VIDEO_ORIGINAL_DIR, `${videoId}${extFromName(req.file.originalname)}`);
  await fs.rename(req.file.path, finalPath);
  const stat = await fs.stat(finalPath);
  const meta = {
    videoId,
    userId: req.user.id,
    filePath: finalPath,
    size: stat.size,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    source: 'upload',
    createdAt: new Date().toISOString(),
  };
  await saveVideoMeta(meta);
  logger.info(`[VideoUpload] upload recebido videoId=${videoId} path=${finalPath} size=${stat.size}`);
  res.status(201).json({
    ok: true,
    videoId,
    filePath: toPublicVideoPath(finalPath),
    size: stat.size,
    originalName: req.file.originalname,
  });
});

// ── Chunk upload for long videos ──────────────────────────────────────────
router.post('/upload/init', requireAuth, async (req, res) => {
  await ensureVideoStorage();
  const { fileName, fileSize, mimeType } = req.body || {};
  if (!fileName || !fileSize) return res.status(400).json({ error: 'fileName e fileSize são obrigatórios.' });
  const uploadId = uuidv4();
  const dir = path.join(VIDEO_CHUNKS_DIR, uploadId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({
    uploadId,
    userId: req.user.id,
    fileName,
    fileSize,
    mimeType,
    createdAt: new Date().toISOString(),
  }, null, 2));
  logger.info(`[VideoUpload] chunk init uploadId=${uploadId} file=${fileName} size=${fileSize}`);
  res.status(201).json({ ok: true, uploadId, chunkSize: CHUNK_SIZE });
});

router.post('/upload/chunk', requireAuth, chunkUpload.single('chunk'), async (req, res) => {
  await ensureVideoStorage();
  const { uploadId, chunkIndex, totalChunks } = req.body || {};
  if (!uploadId || chunkIndex == null || !req.file) {
    return res.status(400).json({ error: 'uploadId, chunkIndex e chunk são obrigatórios.' });
  }
  const dir = path.join(VIDEO_CHUNKS_DIR, path.basename(uploadId));
  const meta = await fs.readFile(path.join(dir, 'meta.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (!meta || meta.userId !== req.user.id) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(404).json({ error: 'Upload não encontrado.' });
  }
  const index = Number.parseInt(chunkIndex, 10);
  const chunkPath = path.join(dir, `chunk_${String(index).padStart(6, '0')}.part`);
  await fs.rename(req.file.path, chunkPath);
  logger.info(`[VideoUpload] chunk recebido uploadId=${uploadId} index=${index}/${totalChunks}`);
  res.json({ ok: true, uploadId, chunkIndex: index });
});

router.post('/upload/complete', requireAuth, async (req, res) => {
  await ensureVideoStorage();
  const { uploadId, fileName, totalChunks } = req.body || {};
  if (!uploadId || !fileName || !totalChunks) {
    return res.status(400).json({ error: 'uploadId, fileName e totalChunks são obrigatórios.' });
  }
  const dir = path.join(VIDEO_CHUNKS_DIR, path.basename(uploadId));
  const meta = await fs.readFile(path.join(dir, 'meta.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (!meta || meta.userId !== req.user.id) return res.status(404).json({ error: 'Upload não encontrado.' });

  const videoId = uuidv4();
  const finalPath = path.join(VIDEO_ORIGINAL_DIR, `${videoId}${extFromName(fileName)}`);
  const out = createWriteStream(finalPath);
  try {
    for (let i = 0; i < Number.parseInt(totalChunks, 10); i += 1) {
      const chunkPath = path.join(dir, `chunk_${String(i).padStart(6, '0')}.part`);
      await fs.access(chunkPath).catch(() => { throw new Error(`Chunk ausente: ${i}`); });
      await pipeline(Readable.from(await fs.readFile(chunkPath)), out, { end: false });
    }
  } finally {
    out.end();
  }
  await new Promise(resolve => out.on('finish', resolve));
  const stat = await fs.stat(finalPath);
  const videoMeta = {
    videoId,
    userId: req.user.id,
    filePath: finalPath,
    size: stat.size,
    originalName: fileName,
    mimeType: meta.mimeType,
    source: 'chunk_upload',
    createdAt: new Date().toISOString(),
  };
  await saveVideoMeta(videoMeta);
  await fs.rm(dir, { recursive: true, force: true });
  logger.info(`[VideoUpload] chunks completos videoId=${videoId} path=${finalPath} size=${stat.size}`);
  res.json({ ok: true, videoId, filePath: toPublicVideoPath(finalPath) });
});

// ── Import video by URL ───────────────────────────────────────────────────
router.post('/import-url', requireAuth, async (req, res) => {
  await ensureVideoStorage();
  const { url, source = 'direct' } = req.body || {};
  if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL inválida.' });
  const videoId = uuidv4();
  const finalPath = path.join(VIDEO_ORIGINAL_DIR, `${videoId}${extFromName(url)}`);
  try {
    if (source === 'google_drive') {
      await downloadFromGoogleDrive(url, finalPath);
    } else {
      await downloadDirect(url, finalPath);
    }
    const stat = await fs.stat(finalPath);
    await saveVideoMeta({
      videoId,
      userId: req.user.id,
      filePath: finalPath,
      size: stat.size,
      originalName: path.basename(new URL(url).pathname) || `${videoId}.mp4`,
      source,
      createdAt: new Date().toISOString(),
    });
    logger.info(`[VideoImport] url importado videoId=${videoId} source=${source} path=${finalPath}`);
    res.status(201).json({ ok: true, videoId, filePath: toPublicVideoPath(finalPath) });
  } catch (err) {
    await fs.unlink(finalPath).catch(() => {});
    res.status(400).json({ error: `Não foi possível baixar esse link. Use um link público/direto. ${err.message}` });
  }
});

router.post('/import-server-file', requireAuth, async (req, res) => {
  await ensureVideoStorage();
  const requested = path.resolve(String(req.body?.path || ''));
  const allowedRoot = path.resolve(config.storage.upload);
  if (!safeInside(requested, allowedRoot)) {
    return res.status(400).json({ error: 'Arquivo fora da pasta storage/uploads não é permitido.' });
  }
  const stat = await fs.stat(requested).catch(() => null);
  if (!stat?.isFile()) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  if (!/\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(requested)) {
    return res.status(400).json({ error: 'Formato de vídeo inválido.' });
  }
  const videoId = uuidv4();
  await saveVideoMeta({
    videoId,
    userId: req.user.id,
    filePath: requested,
    size: stat.size,
    originalName: path.basename(requested),
    source: 'server_file',
    createdAt: new Date().toISOString(),
  });
  res.status(201).json({ ok: true, videoId, filePath: toPublicVideoPath(requested) });
});

// ── New /api/video/jobs flow: process an already uploaded video ───────────
router.post('/jobs', requireAuth, async (req, res) => {
  const { videoId, cutType = 'auto', platform = 'auto', captionStyle = 'classic', instruction = '' } = req.body || {};
  if (!videoId) return res.status(400).json({ error: 'videoId obrigatório.' });
  const video = await loadVideoMeta(videoId).catch(() => null);
  if (!video || video.userId !== req.user.id) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  await fs.access(video.filePath).catch(() => { throw new Error('Arquivo de vídeo não existe no servidor.'); });

  const jobId = uuidv4();
  const message = normalizeVideoRequest(instruction || 'Identificar melhores momentos');
  await query(
    `INSERT INTO video_jobs (id, user_id, status, stage, message, input_path, input_paths, stats)
     VALUES ($1, $2, 'pending', 'queued', $3, $4, $5, $6)`,
    [jobId, req.user.id, message, video.filePath, JSON.stringify([video.filePath]), JSON.stringify({
      progress: 0,
      message: 'Na fila',
      videoId,
      cutType,
      platform,
      captionStyle,
      outputs: [],
    })],
  );
  logger.info(`[VideoRoute] job criado id=${jobId} videoId=${videoId} path=${video.filePath}`);
  res.status(202).json({ ok: true, jobId, status: 'queued' });

  jobQueue.enqueue(jobId, () => processUploadedVideoJob({
    jobId,
    userId: req.user.id,
    videoId,
    inputPath: video.filePath,
    cutType,
    platform,
    captionStyle,
    instruction: message,
  }));
});

async function processUploadedVideoJob({ jobId, userId, videoId, inputPath, cutType, platform, captionStyle, instruction }) {
  const setProgress = async ({ progress, message }) => {
    await query(
      `UPDATE video_jobs
       SET status='processing', stage=$1,
           stats = COALESCE(stats, '{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE id=$3 AND user_id=$4`,
      [stageFromMessage(message), JSON.stringify({ progress, message }), jobId, userId],
    ).catch(() => {});
    logger.info(`[VideoJob:${jobId}] ${progress}% ${message}`);
  };

  try {
    const result = await runVideoPipeline({
      jobId,
      videoId,
      inputPath,
      cutType,
      platform,
      captionStyle,
      instruction,
      onProgress: setProgress,
    });
    const outputs = result.outputs.map(o => ({
      ...o,
      downloadUrl: `/video/download/${jobId}/${o.file}`,
    }));
    await query(
      `UPDATE video_jobs
       SET status='done', stage='done', output_path=$1,
           stats = COALESCE(stats, '{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE id=$3 AND user_id=$4`,
      [outputs[0]?.path || null, JSON.stringify({
        progress: 100,
        message: 'Finalizado',
        outputs,
        topClips: result.cuts,
        probe: result.probe,
      }), jobId, userId],
    );
  } catch (err) {
    logger.error(`[VideoJob:${jobId}] failed: ${err.message}`);
    await query(
      `UPDATE video_jobs SET status='error', stage='error', error=$1,
       stats = COALESCE(stats, '{}'::jsonb) || $2::jsonb,
       updated_at=NOW() WHERE id=$3 AND user_id=$4`,
      [err.message.slice(0, 500), JSON.stringify({ progress: 100, message: 'Erro' }), jobId, userId],
    ).catch(() => {});
  }
}

function stageFromMessage(message = '') {
  if (/fila/i.test(message)) return 'queued';
  if (/metadados|ffprobe|validando/i.test(message)) return 'analyzing';
  if (/audio/i.test(message)) return 'extracting_audio';
  if (/pausas|sil/i.test(message)) return 'detecting';
  if (/momentos/i.test(message)) return 'planning';
  if (/render/i.test(message)) return 'rendering';
  if (/final/i.test(message)) return 'done';
  return 'processing';
}

async function downloadFromGoogleDrive(url, outputPath) {
  const id = String(url).match(/\/d\/([^/]+)/)?.[1] || String(url).match(/[?&]id=([^&]+)/)?.[1];
  if (!id) throw new Error('Link do Google Drive sem ID de arquivo.');
  return downloadDirect(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, outputPath);
}

async function downloadDirect(url, outputPath) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (/text\/html/i.test(contentType)) throw new Error('O link retornou HTML, não um arquivo de vídeo direto.');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
}

async function ensureVideoStorage() {
  await Promise.all([
    fs.mkdir(VIDEO_ORIGINAL_DIR, { recursive: true }),
    fs.mkdir(VIDEO_CHUNKS_DIR, { recursive: true }),
    fs.mkdir(VIDEO_META_DIR, { recursive: true }),
    fs.mkdir(path.join(config.storage.output, 'videos'), { recursive: true }),
    fs.mkdir(path.join(config.storage.temp, 'video'), { recursive: true }),
  ]);
}

function extFromName(fileName = '') {
  const ext = path.extname(fileName).toLowerCase();
  return ext && /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/.test(ext) ? ext : '.mp4';
}

async function saveVideoMeta(video) {
  await ensureVideoStorage();
  await fs.writeFile(path.join(VIDEO_META_DIR, `${video.videoId}.json`), JSON.stringify(video, null, 2));
}

async function loadVideoMeta(videoId) {
  const raw = await fs.readFile(path.join(VIDEO_META_DIR, `${videoId}.json`), 'utf8');
  return JSON.parse(raw);
}

function toPublicVideoPath(filePath) {
  const rel = path.relative(process.cwd(), filePath);
  return rel.startsWith('..') ? filePath : rel;
}

function safeInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function mapJobStatus(status) {
  return status === 'pending' ? 'queued' : status;
}

// ── Shared job processor (used by route + crash recovery) ─────────────────
export async function processVideoJob(jobId, userId, message, files) {
  const inputPaths = Array.isArray(files)
    ? files.map(f => (typeof f === 'string' ? f : f.path)).filter(Boolean)
    : [];

  const updateStage = async (stage) => {
    await query(
      `UPDATE video_jobs SET stage=$1, updated_at=NOW() WHERE id=$2`,
      [stage, jobId],
    ).catch(() => {});
    logger.info(`[VideoJob:${jobId}] stage=${stage}`);
  };

  try {
    logger.info(`[VideoJob:${jobId}] upload recebido para processamento paths=${inputPaths.join(',')}`);
    for (const inputPath of inputPaths) {
      try {
        await fs.access(inputPath);
        logger.info(`[VideoJob:${jobId}] caminho do arquivo salvo: ${inputPath}`);
      } catch {
        throw new Error(`Arquivo de vídeo não existe no storage temporário: ${inputPath}`);
      }
    }

    // Rebuild file objects for videoAgent (needs .path + .originalname)
    const fileObjs = inputPaths.map((p, i) => ({
      path:         p,
      originalname: path.basename(p),
    }));

    const result = await videoAgent({
      userId,
      message,
      context: [],
      files:   fileObjs,
      onStageChange: updateStage,
    });

    const ok           = (result.results || []).filter(r => r.status === 'done');
    const stats        = ok[0]?.stats ?? {};
    const outputPath   = ok[0] ? path.join(OUT_DIR, ok[0].outputFile)   : null;
    const captionsPath = ok[0] ? path.join(OUT_DIR, ok[0].captionsFile) : null;

    await query(
      `UPDATE video_jobs
       SET status='done', stage='done', output_path=$1, captions_path=$2,
           stats=$3, updated_at=NOW()
       WHERE id=$4`,
      [outputPath, captionsPath, JSON.stringify(stats), jobId],
    ).catch(() => {});

  } catch (err) {
    logger.error(`[VideoJob:${jobId}] failed: ${err.message}`);
    await query(
      `UPDATE video_jobs SET status='error', stage='error', error=$1, updated_at=NOW() WHERE id=$2`,
      [err.message.slice(0, 500), jobId],
    ).catch(() => {});
  } finally {
    // Clean up temp files (already done inside videoAgent but guard here too)
    for (const p of inputPaths) await fs.unlink(p).catch(() => {});
  }
}

// ── POST /video/edit ──────────────────────────────────────────────────────
router.post('/edit', requireAuth, upload.array('files', 3), async (req, res) => {
  const message = normalizeVideoRequest(req.body.message || 'editar vídeo automaticamente');
  const files   = req.files ?? [];

  if (!files.length) {
    logger.warn(`[VideoRoute] upload sem arquivo user=${req.user.id}`);
    return res.status(400).json({ error: 'Envie pelo menos um vídeo para editar.' });
  }

  logger.info(`[VideoRoute] upload recebido user=${req.user.id} files=${files.map(f => `${f.originalname}:${f.path}`).join(',')}`);

  // Rate limit: max 3 concurrent active jobs per user
  const { rows: activeJobs } = await query(
    `SELECT COUNT(*) FROM video_jobs
     WHERE user_id=$1 AND status='processing'`,
    [req.user.id],
  ).catch(() => ({ rows: [{ count: '0' }] }));

  if (parseInt(activeJobs[0].count) >= 3) {
    await Promise.allSettled(files.map(f => fs.unlink(f.path).catch(() => {})));
    return res.status(429).json({
      error: 'Você já tem 3 vídeos em processamento. Aguarde terminar antes de enviar mais.',
    });
  }

  const jobId      = uuidv4();
  const inputPaths = files.map(f => f.path);

  await query(
    `INSERT INTO video_jobs (id, user_id, status, stage, message, input_paths)
     VALUES ($1, $2, 'processing', 'queued', $3, $4)`,
    [jobId, req.user.id, message, JSON.stringify(inputPaths)],
  ).catch(err => logger.warn(`[VideoRoute] DB insert failed: ${err.message}`));

  logger.info(`[VideoRoute] job criado id=${jobId} user=${req.user.id} input_paths=${inputPaths.join(',')}`);

  res.status(202).json({ jobId, status: 'processing', stage: 'queued' });

  // Enqueue via resilient job queue
  jobQueue.enqueue(jobId, () =>
    processVideoJob(jobId, req.user.id, message, files),
  );
});

function normalizeVideoRequest(message) {
  const text = String(message || '').trim();
  if (/cenas?\s+quentes?|melhores?\s+momentos?|maior\s+impacto|reten[cç][aã]o|cortes?\s+fortes?/i.test(text)) {
    return `${text}. Mapear pedido "cenas quentes" para melhores momentos, trechos de maior impacto, cenas com mais potencial de retenção e cortes fortes.`;
  }
  return text;
}

// ── GET /video/jobs/:id ───────────────────────────────────────────────────
router.get('/jobs/:id', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, status, stage, error, stats, output_path, captions_path, created_at, updated_at
     FROM video_jobs WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Job não encontrado' });

  const job = rows[0];
  const backendBase = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;
  const stats = job.stats || {};
  const outputs = Array.isArray(stats.outputs)
    ? stats.outputs.map(o => ({
      ...o,
      downloadUrl: o.downloadUrl?.startsWith('http')
        ? o.downloadUrl
        : `${backendBase}${o.downloadUrl || `/video/download/${job.id}/${o.file}`}`,
    }))
    : [];

  res.json({
    ok:          true,
    jobId:       job.id,
    status:      mapJobStatus(job.status),
    stage:       job.stage,
    progress:    stats.progress ?? (job.status === 'done' ? 100 : 0),
    message:     stats.message || job.stage,
    outputs,
    error:       job.error,
    stats:       { ...stats, outputs },
    downloadUrl: job.output_path
      ? `${backendBase}/video/download/${job.id}/${path.basename(job.output_path)}`
      : null,
    captionsUrl: job.captions_path
      ? `${backendBase}/video/download/${job.id}/${path.basename(job.captions_path)}`
      : null,
    createdAt:  job.created_at,
    updatedAt:  job.updated_at,
  });
});

// ── GET /video/jobs ───────────────────────────────────────────────────────
router.get('/jobs', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, status, stage, error, stats, created_at, updated_at
     FROM video_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [req.user.id],
  );
  res.json(rows.map(row => ({
    ...row,
    status: mapJobStatus(row.status),
    progress: row.stats?.progress ?? (row.status === 'done' ? 100 : 0),
    message: row.stats?.message || row.stage,
  })));
});

// ── GET /video/download/:jobId/:filename ──────────────────────────────────
router.get('/download/:jobId/:filename', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT output_path, captions_path FROM video_jobs WHERE id=$1 AND user_id=$2`,
    [req.params.jobId, req.user.id],
  ).catch(() => ({ rows: [] }));

  const safe     = path.basename(req.params.filename).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  let filePath = path.join(OUT_DIR, safe);

  if (rows.length) {
    const allowedPaths = [rows[0].output_path, rows[0].captions_path]
      .filter(Boolean);
    const nestedPath = path.join(config.storage.output, 'videos', req.params.jobId, safe);
    if (allowedPaths.some(p => path.basename(p) === safe)) {
      filePath = allowedPaths.find(p => path.basename(p) === safe);
    } else {
      filePath = nestedPath;
    }
    const allowed = [...allowedPaths.map(p => path.basename(p)), safe];
    if (allowed.length && !allowed.includes(safe)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
  }

  try {
    await fs.access(filePath);
    const stat = await fs.stat(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', safe.endsWith('.srt') ? 'text/plain' : 'video/mp4');
    const { createReadStream } = await import('fs');
    createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).json({ error: 'Arquivo não encontrado ou expirado.' });
  }
});

// ── POST /video/chat ──────────────────────────────────────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  const { message, context = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });
  const result = await videoAgent({ userId: req.user.id, message, context, files: [] });
  res.json(result);
});

// ── GET /video/health ─────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const { stdout } = await promisify(exec)('ffmpeg -version');
    res.json({
      ffmpeg: true, version: stdout.split('\n')[0], status: 'ok',
      activeJobs: jobQueue.activeCount,
    });
  } catch {
    res.json({ ffmpeg: false, status: 'degraded', activeJobs: jobQueue.activeCount });
  }
});

export default router;

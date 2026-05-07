// routes/video.js — v21
// Uses jobQueue for resilient async processing.
// Jobs survive server restarts via Postgres.

import { Router }         from 'express';
import multer             from 'multer';
import path               from 'path';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import archiver           from 'archiver';
import { requireAuth }    from '../middleware/auth.js';
import jwt               from 'jsonwebtoken';
import videoAgent         from '../agents/videoAgent.js';
import { query }          from '../db/index.js';
import { config }         from '../config/index.js';
import { logger }         from '../lib/logger.js';
import { jobQueue }       from '../lib/job-queue.js';
import { v4 as uuidv4 }  from 'uuid';

// ── v27: Video pipeline imports ───────────────────────────────────────────────
import { detectVideoSource, normalizeUrl, getManualUploadMessage } from '../video/sourceDetector.js';
import { downloadVideoFile } from '../video/downloadVideoFile.js';
import { processVideoJob as runPipeline, createJob, getJob } from '../video/videoPipeline.js';
import { runVideoCleanup }   from '../video/videoCleanupJob.js';
// Video Squad v29
import { runVideoSquad, createVideoSquadJob, getVideoSquadJob } from '../squads/video/videoSquad.js';
import { resolveVideoSource } from '../video/videoSourceManager.js'; // v28
import { registerUploadedVideo, resolveVideoInput } from '../video/videoIngestService.js';
import { runVideoAnalysis, getAnalysisById } from '../video/videoAnalysisService.js';
import { generateSupervisedEditPlan } from '../video/videoEditingSupervisor.js';
import { renderEditPlanJob, getRenderJob, getRenderResult } from '../video/videoRenderService.js';
import { createReferenceLearningJob, getReferenceLearningAnalysis, getReferenceLearningJob, savePresetFromReference } from '../video/referenceVideoLearningService.js';
import { getReferenceById } from '../squads/video/edit-plans/editPlanStorage.js';
import { listPresetLibrary } from '../video/editPresetLibraryService.js';
import { sendClipToTelegram, sendTelegramDocument, sendTelegramMessage } from '../services/telegram/telegramSendService.js';
import { validateMp4OrThrow, MIN_VALID_MP4_BYTES, deleteInvalidOutput } from '../services/video/videoValidationService.js';
import { getEditPreset, listEditPresetCategories, listEditPresets } from '../squads/video/editing/editPresets.js';
import { getToolsHealth } from '../services/system/toolsHealthService.js';
import { getVideoProfessionalToolchainStatus } from '../services/video/toolchain/videoToolchainService.js';
import { listProEditingPresets, getProEditingPreset } from '../services/video/presets/proEditingPresets.js';
import { listEditStyleRecipes, createEditStyleRecipe, applyEditStyleRecipe } from '../services/video/presets/editStyleRecipes.js';
import { runDynamicEditResearchAgent, saveResearchPreset, applyResearchPreset } from '../agents/video/dynamicEditResearchAgent.js';
import { listProColorPresets } from '../services/video/color/colorPresetService.js';
import { listProAudioPresets } from '../services/video/audio/proAudioChainService.js';
import { runProAnalysis } from '../services/video/pipeline/proAnalysisService.js';
import { scoreHighlights } from '../services/video/pipeline/highlightScorerService.js';
import { buildProfessionalEditPlan } from '../services/video/pipeline/editPlanService.js';
import { reviewProfessionalEditPlan } from '../services/video/pipeline/editSupervisorService.js';
import { renderProfessionalEditPlan } from '../services/video/pipeline/proRenderService.js';
import { validateProfessionalOutput } from '../services/video/pipeline/outputValidationService.js';
import {
  listEditPlans,
  createEditPlan,
  updateEditPlan,
  deleteEditPlan,
  duplicateEditPlan,
  getEditPlanById,
  listPlanReferences,
  listReferences,
  createReference,
  updateReference,
  deleteReference,
  uploadReferenceVideo,
  analyzeReferenceStyle,
  analyzeReferenceFrames,
  getReferenceFrameCuts,
  getReferenceStyleAnalysis,
  getReferenceAnalysis,
  linkReferenceToPlan,
  buildSmartCutStyleContext,
} from '../squads/video/edit-plans/editPlanStorage.js';


const router  = Router();
const OUT_DIR = config.storage.output || path.resolve(process.cwd(), '../storage/outputs');
const VALID_EXPORTS_DIR = path.join(OUT_DIR, 'valid-exports');
const TELEGRAM_MODES = new Set(['video', 'document', 'both']);
const PROCESSING_MODES = new Set(['raw_review', 'finalize_approved', 'opus_auto']);
const CLIP_COUNT_MODES = new Set(['auto', 'fixed']);
const CLIP_DURATION_MODES = new Set(['auto', 'fixed']);

async function resolveProfessionalSource(body = {}, req = {}) {
  const sourceVideo = String(body.sourceVideo || body.filePath || '').trim();
  const videoId = String(body.videoId || '').trim() || null;
  if (sourceVideo || videoId) {
    const resolved = await resolveVideoInput({
      videoId,
      filePath: sourceVideo || null,
      userId: req.user?.id || null,
    });
    return {
      sourceVideo: resolved.filePath,
      videoId: resolved.videoId,
    };
  }
  throw Object.assign(new Error('Informe sourceVideo, filePath ou videoId para o pipeline profissional.'), { status: 400 });
}

function legacyToolsPayloadFromToolchain(toolchain = {}) {
  const groups = toolchain.groups || {};
  const makeLegacyStatus = (tool, fallbackVersion = null) => {
    const available = Boolean(tool?.available);
    return {
      available,
      status: available ? 'available' : 'missing',
      version: tool?.version || tool?.path || fallbackVersion || null,
      error: available ? null : (tool?.error || null),
    };
  };
  return {
    ffmpeg: makeLegacyStatus(groups.baseVideo?.ffmpeg),
    ffprobe: makeLegacyStatus(groups.baseVideo?.ffprobe),
    remotion: makeLegacyStatus(groups.motionGraphics?.remotion, 'local_compositions'),
    natron: makeLegacyStatus(groups.composition?.natron, 'NatronRenderer detectado'),
    opencv: makeLegacyStatus(groups.analysis?.opencv),
    pyscenedetect: makeLegacyStatus(groups.analysis?.pyscenedetect),
    whisper: makeLegacyStatus(groups.analysis?.whisper),
    tesseract: makeLegacyStatus(groups.analysis?.tesseract),
  };
}

function normalizeTelegramMode(mode) {
  const selected = String(mode || process.env.TELEGRAM_SEND_MODE || 'document').toLowerCase();
  return TELEGRAM_MODES.has(selected) ? selected : 'document';
}

function normalizeProcessingMode(mode) {
  const selected = String(mode || 'raw_review').toLowerCase();
  return PROCESSING_MODES.has(selected) ? selected : 'raw_review';
}

function resolveEffectiveProcessingMode(rawMode, { sourceJobId = null } = {}) {
  const normalized = normalizeProcessingMode(rawMode);
  // "Finalizar aprovado" só faz sentido para um corte já aprovado.
  // Se o app mandar vídeo bruto nesse modo, seguimos para o fluxo que realmente corta.
  if (normalized === 'finalize_approved' && !sourceJobId) return 'opus_auto';
  return normalized;
}

function hasExplicitCaptionStyle(style) {
  return Boolean(style) && !['none', 'auto'].includes(String(style).toLowerCase());
}

function normalizeCaptionMode(mode) {
  const valid = new Set(['none', 'clean', 'phrase_dynamic', 'word_highlight', 'karaoke', 'capcut_bold', 'tiktok_highlight', 'worship_clean']);
  const selected = String(mode || 'none').toLowerCase();
  return valid.has(selected) ? selected : 'none';
}

function normalizeCaptionPosition(position) {
  const valid = new Set(['lower_third', 'mid_low', 'top_safe', 'auto_face_aware']);
  const selected = String(position || 'auto_face_aware').toLowerCase();
  return valid.has(selected) ? selected : 'auto_face_aware';
}

function resolveCaptionMode(processingMode, captionsEnabled, captionMode, captionStyle) {
  const normalizedMode = normalizeCaptionMode(captionMode);
  if (!captionsEnabled && normalizedMode === 'none' && !hasExplicitCaptionStyle(captionStyle)) return 'none';
  if (processingMode === 'raw_review') return captionsEnabled ? (normalizedMode === 'none' ? 'clean' : normalizedMode) : 'none';
  if (processingMode === 'finalize_approved') return normalizedMode === 'none' ? 'phrase_dynamic' : normalizedMode;
  return normalizedMode;
}

async function resolveFinalizeApprovedSourcePath(sourceJobId, sourceFileName) {
  const safeJob = path.basename(String(sourceJobId || ''));
  const safeFile = path.basename(String(sourceFileName || ''));
  if (!safeJob || !safeFile) return null;

  const candidates = [
    path.resolve(path.join(VIDEO_OUTPUT, safeJob, safeFile)),
    path.resolve(path.join(process.cwd(), 'storage/outputs/videos', safeJob, safeFile)),
    path.resolve(path.join(process.cwd(), 'backend/storage/outputs/videos', safeJob, safeFile)),
  ];

  for (const candidate of candidates) {
    const exists = await fs.access(candidate).then(() => true).catch(() => false);
    if (exists) return candidate;
  }
  return null;
}

function normalizeClipCountMode(mode) {
  const selected = String(mode || 'auto').toLowerCase();
  return CLIP_COUNT_MODES.has(selected) ? selected : 'auto';
}

function normalizeClipDurationMode(mode) {
  const selected = String(mode || 'auto').toLowerCase();
  return CLIP_DURATION_MODES.has(selected) ? selected : 'fixed';
}

function normalizeClipDurationSeconds(value) {
  if (value == null || value === '') return 'auto';
  if (String(value).toLowerCase() === 'auto') return 'auto';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'auto';
  return Math.min(600, Math.max(5, Math.round(numeric)));
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function hasOwn(obj = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

// Safe numeric parse: prevents NaN when caller sends a non-numeric string like "abc"
// Also handles null/undefined/"" explicitly — Number(null)=0, so must guard before calling Number()
function safeInt(value, fallback, min = 1, max = 999) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeNum(value, fallback, min = 0, max = 999999) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeStyleIdValue(value = '') {
  return String(value || 'cinematic-blur')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function buildEditStylePayload(body = {}) {
  const editStyleId = normalizeStyleIdValue(body.editStyleId || body.editStyle || 'cinematic-blur') || 'cinematic-blur';
  return {
    editStyle: editStyleId,
    editStyleId,
    editStyleName: String(body.editStyleName || 'Cinematic Blur'),
    editStyleCategory: String(body.editStyleCategory || 'Clean / Profissional'),
    editStyleEffects: Array.isArray(body.editStyleEffects) ? body.editStyleEffects : [],
    captionBehavior: String(body.captionBehavior || 'default'),
    motionBehavior: String(body.motionBehavior || 'balanced'),
    cropBehavior: String(body.cropBehavior || 'center_subject'),
    styleAiInstructions: String(body.styleAiInstructions || ''),
  };
}

function hasManualCountInput(body = {}) {
  return hasOwn(body, 'clipCountMode')
    || hasOwn(body, 'clipCount')
    || hasOwn(body, 'count')
    || hasOwn(body, 'requestedClipCount')
    || hasOwn(body, 'maxClips')
    || hasOwn(body, 'numberOfClips')
    || hasOwn(body, 'numClips')
    || hasOwn(body, 'targetClips');
}

function hasManualDurationInput(body = {}) {
  return hasOwn(body, 'clipDurationMode')
    || hasOwn(body, 'clipDurationSeconds')
    || hasOwn(body, 'targetClipDuration')
    || hasOwn(body, 'minClipDuration')
    || hasOwn(body, 'maxClipDuration')
    || hasOwn(body, 'requestedClipDurationSeconds')
    || hasOwn(body, 'targetDuration');
}

function isAllowedReferenceUrl(url = '') {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^https?:\/\/.+\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(value)) return true;
  if (/^https?:\/\/(www\.)?drive\.google\.com\//i.test(value)) return true;
  if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(value)) return true;
  return false;
}

function getClipDurationBounds(seconds) {
  const presets = {
    15: { min: 10, max: 20 },
    30: { min: 25, max: 35 },
    40: { min: 35, max: 50 },
    60: { min: 50, max: 75 },
    90: { min: 75, max: 110 },
    120: { min: 100, max: 145 },
    180: { min: 150, max: 210 },
    300: { min: 240, max: 360 },
  };
  const preset = presets[seconds] || {
    min: Math.max(5, Math.round(seconds * 0.82)),
    max: Math.min(600, Math.round(seconds * 1.22)),
  };
  return { min: preset.min, target: seconds, max: preset.max };
}

function resolveClipDurationOptions(processingMode, body = {}) {
  if (processingMode === 'finalize_approved') {
    return {
      clipDurationSeconds: null,
      clipDurationMode: null,
      targetClipDuration: null,
      minClipDuration: null,
      maxClipDuration: null,
    };
  }

  const normalizedSeconds = normalizeClipDurationSeconds(body.clipDurationSeconds);
  const clipDurationMode = normalizedSeconds === 'auto' ? 'auto' : normalizeClipDurationMode(body.clipDurationMode || 'fixed');
  if (clipDurationMode === 'auto') {
    return {
      clipDurationSeconds: 'auto',
      clipDurationMode: 'auto',
      targetClipDuration: null,
      minClipDuration: null,
      maxClipDuration: null,
    };
  }

  const legacyTarget = normalizeClipDurationSeconds(body.targetClipDuration);
  const targetSeconds = normalizedSeconds === 'auto' ? (legacyTarget === 'auto' ? 60 : legacyTarget) : normalizedSeconds;
  const bounds = getClipDurationBounds(targetSeconds);
  return {
    clipDurationSeconds: targetSeconds,
    clipDurationMode: 'fixed',
    targetClipDuration: targetSeconds,
    minClipDuration: safeNum(body.minClipDuration, 0, 0, 600) || bounds.min,
    maxClipDuration: safeNum(body.maxClipDuration, 0, 0, 600) || bounds.max,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function deleteAfterTelegramEnabled() {
  return String(process.env.VIDEO_DELETE_AFTER_TELEGRAM || '').toLowerCase() === 'true';
}

async function deleteAfterTelegram({ filePath, size, jobId, kind = 'clip' }) {
  if (!deleteAfterTelegramEnabled()) return false;
  try {
    await fs.unlink(filePath).catch((err) => {
      if (err?.code !== 'ENOENT') throw err;
    });
    logger.info(`[VideoTelegram] telegramSent=true filePath=${filePath} size=${size || 0} deletedAfterTelegram=true job=${jobId || ''} kind=${kind}`);
    return true;
  } catch (err) {
    logger.warn(`[VideoTelegram] telegramSent=true filePath=${filePath} size=${size || 0} deletedAfterTelegram=false job=${jobId || ''} kind=${kind} error=${err.message}`);
    return false;
  }
}

async function deleteInvalidSmallFile(filePath, jobId) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size >= MIN_VALID_MP4_BYTES) return false;
  await fs.unlink(filePath).catch(() => {});
  logger.info(`[VideoTelegram] invalidSmallFileDeleted filePath=${filePath} size=${stat.size} job=${jobId || ''}`);
  return true;
}

async function probeServedMp4(filePath) {
  return validateMp4OrThrow(filePath);
}

async function assertVideoSquadJobAccess(jobId, userId) {
  const safeJob = path.basename(String(jobId || ''));
  if (!safeJob) throw Object.assign(new Error('jobId obrigatório'), { status: 400 });

  const liveJob = getVideoSquadJob(safeJob);
  if (liveJob?.userId && liveJob.userId !== userId) {
    throw Object.assign(new Error('Acesso negado'), { status: 403 });
  }

  const metaFile = path.join(VIDEO_OUTPUT, safeJob, 'job.json');
  const persisted = await fs.readFile(metaFile, 'utf-8').then(d => JSON.parse(d)).catch(() => null);
  if (persisted?.userId && persisted.userId !== userId) {
    throw Object.assign(new Error('Acesso negado'), { status: 403 });
  }

  return { safeJob, liveJob, persisted };
}

// Descarta variantes (render, _clean_clean, _telegram) mantendo apenas o arquivo canônico por clip.
// Lógica: ordena por comprimento de nome; um arquivo é variante se o stem de um arquivo menor
// for prefixo do seu stem (ex: _final_clean.mp4 é prefixo de _final_clean_render.mp4).
function deduplicateClips(files) {
  const byLength = [...files].sort((a, b) => a.fileName.length - b.fileName.length);
  const kept = [];
  for (const file of byLength) {
    const stem = file.fileName.replace(/\.mp4$/i, '');
    const isVariant = kept.some(k => {
      const kStem = k.fileName.replace(/\.mp4$/i, '');
      return stem === kStem || stem.startsWith(kStem + '_');
    });
    if (!isVariant) kept.push(file);
  }
  return kept;
}

function getPublicBaseUrl() {
  const url = process.env.BACKEND_PUBLIC_URL || process.env.APP_PUBLIC_URL || process.env.PUBLIC_API_URL || '';
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) return url.replace(/\/$/, '');
  logger.warn('VIDEO_TELEGRAM_PUBLIC_URL_MISSING BACKEND_PUBLIC_URL não configurado — link de fallback não disponível');
  return null;
}

async function listValidJobMp4s(jobId) {
  const safeJob = path.basename(String(jobId || ''));
  const resolvedBase = path.resolve(VIDEO_OUTPUT);
  const jobDir = path.resolve(path.join(VIDEO_OUTPUT, safeJob));
  if (!jobDir.startsWith(resolvedBase + path.sep)) return [];

  const entries = await fs.readdir(jobDir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/\.mp4$/i.test(entry.name)) continue;
    const fileName = path.basename(entry.name);
    // Ignorar artefatos de otimização para Telegram — nunca listar como candidatos primários
    if (fileName.endsWith('_telegram.mp4')) continue;
    const filePath = path.join(jobDir, fileName);
    try {
      const validation = await probeServedMp4(filePath);
      files.push({
        fileName,
        filePath,
        size: validation.size,
        duration: Math.round(validation.duration),
        width: validation.width,
        height: validation.height,
        videoCodec: validation.videoCodec,
      });
    } catch (err) {
      logger.warn(`[VideoTelegram] skip invalid job=${safeJob} file=${fileName} error=${err.message}`);
    }
  }

  const sorted = files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return deduplicateClips(sorted);
}

function buildExportId(jobId = '') {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const suffix = jobId ? `-${path.basename(jobId).slice(0, 24)}` : '';
  return `${stamp}${suffix}`;
}

async function listCandidateMp4s(jobId = null) {
  const base = path.resolve(VIDEO_OUTPUT);
  const candidates = [];

  if (jobId) {
    const safeJob = path.basename(jobId);
    const jobDir = path.resolve(path.join(VIDEO_OUTPUT, safeJob));
    if (!jobDir.startsWith(base + path.sep)) return [];
    const entries = await fs.readdir(jobDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile() && /\.mp4$/i.test(entry.name)) {
        const filePath = path.join(jobDir, entry.name);
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat) candidates.push({ filePath, stat, jobId: safeJob });
      }
    }
    return candidates.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  const jobDirs = await fs.readdir(VIDEO_OUTPUT, { withFileTypes: true }).catch(() => []);
  for (const dir of jobDirs) {
    if (!dir.isDirectory() || dir.name === 'valid-exports') continue;
    const jobDir = path.join(VIDEO_OUTPUT, dir.name);
    const entries = await fs.readdir(jobDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !/\.mp4$/i.test(entry.name)) continue;
      const filePath = path.join(jobDir, entry.name);
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat) candidates.push({ filePath, stat, jobId: dir.name });
    }
  }

  return candidates
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, 20);
}

async function createValidExportZip(exportDir, files) {
  const zipPath = path.join(exportDir, 'clips-validos.zip');
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const file of files) {
      archive.file(path.join(exportDir, file.fileName), { name: file.fileName });
    }
    archive.finalize();
  });
  return zipPath;
}

const upload = multer({
  dest: config.storage.temp,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(file.originalname ?? '');
    cb(ok ? null : Object.assign(new Error('Apenas vídeos são aceitos'), { status: 400 }), ok);
  },
});
const referenceUpload = multer({
  dest: config.storage.temp,
  limits: { fileSize: Number(process.env.VIDEO_REFERENCE_MAX_BYTES || 2 * 1024 * 1024 * 1024) },
  fileFilter: (req, file, cb) => {
    const originalName = String(file.originalname || '');
    const extensionOk = /\.(mp4|mov|mkv|webm)$/i.test(originalName);
    const mimeOk = [
      'video/mp4',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
    ].includes(String(file.mimetype || '').toLowerCase());
    const ok = extensionOk || mimeOk;
    cb(ok ? null : Object.assign(new Error('Formato não suportado. Use MP4, MOV, MKV ou WEBM.'), { status: 400 }), ok);
  },
});

function resolvePublicBase(req) {
  const configured = getPublicBaseUrl();
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
}

function mapReferenceVideo(reference, req) {
  const uploadsRoot = path.resolve(config.storage.upload || path.resolve(process.cwd(), 'storage/uploads'));
  const filePath = reference?.filePath || reference?.originalVideoPath || '';
  const normalizedFile = filePath ? path.resolve(filePath) : '';
  let url = null;
  if (normalizedFile && (normalizedFile === uploadsRoot || normalizedFile.startsWith(`${uploadsRoot}${path.sep}`))) {
    const relative = path.relative(uploadsRoot, normalizedFile).split(path.sep).join('/');
    url = `/uploads/${relative}`;
  }
  if (!url && reference?.sourceUrl && /^https?:\/\//i.test(reference.sourceUrl)) {
    url = reference.sourceUrl;
  }

  const base = resolvePublicBase(req);
  const publicUrl = url && /^https?:\/\//i.test(url) ? url : (url ? `${base}${url}` : null);

  return {
    id: reference?.id || null,
    name: reference?.name || reference?.originalName || 'Referência',
    originalName: reference?.originalName || reference?.sourceVideoFileName || '',
    filename: normalizedFile ? path.basename(normalizedFile) : '',
    mimeType: reference?.mimeType || '',
    size: Number(reference?.size || 0),
    sourceType: reference?.sourceType || 'upload',
    status: reference?.status || 'uploaded',
    tags: Array.isArray(reference?.tags) ? reference.tags : [],
    createdAt: reference?.createdAt || null,
    url,
    publicUrl,
  };
}

function withReferenceMedia(reference, req) {
  const media = mapReferenceVideo(reference, req);
  return {
    ...(reference || {}),
    url: media.url || reference?.url || null,
    publicUrl: media.publicUrl || reference?.publicUrl || null,
    fileUrl: media.publicUrl || media.url || reference?.fileUrl || null,
  };
}

function pickUploadedReferenceVideo(req) {
  if (req.file) return req.file;
  const candidates = ['video', 'file', 'referenceVideo'];
  for (const fieldName of candidates) {
    const candidate = req.files?.[fieldName]?.[0];
    if (candidate) return candidate;
  }
  return null;
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
  const message = req.body.message || 'editar vídeo automaticamente';
  const files   = req.files ?? [];

  if (!files.length) {
    return res.status(400).json({ error: 'Envie pelo menos um vídeo para editar.' });
  }

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

  res.status(202).json({ jobId, status: 'processing', stage: 'queued' });

  // Enqueue via resilient job queue
  jobQueue.enqueue(jobId, () =>
    processVideoJob(jobId, req.user.id, message, files),
  );
});

// ── GET /video/jobs/:id ───────────────────────────────────────────────────
router.get('/jobs/:id', requireAuth, async (req, res) => {
  const renderJob = getRenderJob(req.params.id);
  if (renderJob) return res.json({ success: true, ...renderJob });

  const pipelineJob = getJob(req.params.id);
  if (pipelineJob) return res.json({ success: true, ...pipelineJob });

  const squadJob = getVideoSquadJob(req.params.id);
  if (squadJob) return res.json({ success: true, ...squadJob });

  const referenceJob = getReferenceLearningJob(req.params.id);
  if (referenceJob) return res.json({ success: true, job: referenceJob });

  const { rows } = await query(
    `SELECT id, status, stage, error, stats, output_path, captions_path, created_at, updated_at
     FROM video_jobs WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Job não encontrado' });

  const job = rows[0];

  res.json({
    jobId:       job.id,
    status:      job.status,
    stage:       job.stage,
    error:       job.error,
    stats:       job.stats,
    downloadUrl: job.output_path
      ? `/outputs/${path.basename(job.output_path)}`
      : null,
    captionsUrl: job.captions_path
      ? `/outputs/${path.basename(job.captions_path)}`
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
  res.json(rows);
});

// ── GET /video/download/:jobId/:filename ──────────────────────────────────
router.get('/download/:jobId/:filename', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT output_path, captions_path FROM video_jobs WHERE id=$1 AND user_id=$2`,
    [req.params.jobId, req.user.id],
  ).catch(() => ({ rows: [] }));

  const safe     = path.basename(req.params.filename).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const filePath = path.join(OUT_DIR, safe);

  if (rows.length) {
    const allowed = [rows[0].output_path, rows[0].captions_path]
      .filter(Boolean).map(p => path.basename(p));
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
      ok: true,
      service: 'video',
      ffmpeg: true,
      ffmpegVersion: stdout.split('\n')[0],
      activeJobs: jobQueue.activeCount ?? 0,
    });
  } catch {
    res.json({ ok: false, service: 'video', ffmpeg: false, activeJobs: jobQueue.activeCount ?? 0 });
  }
});

router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const {
      videoId = null,
      filePath = null,
      mode = 'auto',
      goal = 'viral_short',
      platform = 'auto',
      referenceStyleId = null,
      clipCount = null,
      targetDuration = null,
    } = req.body || {};

    const safeFilePath = filePath ? assertSafeVideoPath(filePath) : null;
    const analysis = await runVideoAnalysis({
      videoId,
      filePath: safeFilePath,
      mode,
      goal,
      platform,
      referenceStyleId,
      clipCount,
      targetDuration,
      userId: req.user.id,
    });

    res.json(analysis);
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message,
      analysis: null,
    });
  }
});

router.post('/edit-plan/generate', requireAuth, async (req, res) => {
  try {
    const {
      videoId,
      analysisId,
      presetId = null,
      requestedClipCount = 3,
      targetDuration = 45,
      format = '9:16',
      mode = 'auto_premium',
      goal = 'auto',
    } = req.body || {};

    const result = await generateSupervisedEditPlan({
      userId: req.user.id,
      videoId,
      analysisId,
      presetId,
      requestedClipCount: safeInt(requestedClipCount, 3, 1, 12),
      targetDuration: safeNum(targetDuration, 45, 15, 180),
      format,
      mode,
      goal,
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

router.post('/render', requireAuth, async (req, res) => {
  try {
    const { editPlanId } = req.body || {};
    const result = await renderEditPlanJob({ editPlanId, userId: req.user.id });
    res.status(202).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

router.get('/jobs/:jobId', requireAuth, async (req, res) => {
  return res.redirect(307, `/api/video/jobs/${encodeURIComponent(req.params.jobId)}`);
});

router.get('/results/:jobId', requireAuth, async (req, res) => {
  const result = await getRenderResult(req.params.jobId);
  if (!result) return res.status(404).json({ success: false, error: 'Resultado não encontrado' });
  res.json(result);
});

router.get('/tools/status', async (req, res) => {
  const health = await getToolsHealth();
  const pro = await getVideoProfessionalToolchainStatus();
  res.json({
    success: true,
    tools: legacyToolsPayloadFromToolchain(pro),
    total: health.total,
    installed: health.installed,
    toolchain: pro.groups,
    pipelineReadiness: pro.pipelineReadiness,
    fallbacks: pro.fallbacks,
  });
});

router.get('/pro-toolchain/status', async (req, res) => {
  const toolchain = await getVideoProfessionalToolchainStatus();
  res.json({
    ok: true,
    toolchain: toolchain.groups,
    toolMap: toolchain.toolMap,
    pipelineReadiness: toolchain.pipelineReadiness,
    fallbacks: toolchain.fallbacks,
    missingCritical: toolchain.missingCritical,
    missingOptional: toolchain.missingOptional,
  });
});

router.get('/pro/presets', async (req, res) => {
  res.json({ ok: true, presets: listProEditingPresets() });
});

router.get('/pro/color-presets', async (req, res) => {
  res.json({ ok: true, presets: listProColorPresets() });
});

router.get('/pro/audio-presets', async (req, res) => {
  res.json({ ok: true, presets: listProAudioPresets() });
});

router.post('/pro/analyze', async (req, res) => {
  try {
    const body = req.body || {};
    const { sourceVideo, videoId } = await resolveProfessionalSource(body, req);
    const recipeApplication = await applyEditStyleRecipe({
      userId: req.user?.id || null,
      recipeId: body.editStyleRecipeId || body.recipeId || null,
      recipeData: body.recipe || null,
    });
    const preset = getProEditingPreset(body.presetId || recipeApplication?.presetId || 'viral_shorts_aggressive');
    const analysis = await runProAnalysis({
      sourceVideo,
      targetDuration: safeNum(body.targetDuration ?? recipeApplication?.targetDuration, 30, 5, 600),
      preset,
    });
    res.json({ ok: true, videoId, sourceVideo, analysis, recipe: recipeApplication?.recipe || null, recipeApplication });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// normalizeHighlights: handles both legacy array and new { clips, ... } format
function normalizeHighlights(raw) {
  if (!raw) return { clips: [], meta: {} };
  if (Array.isArray(raw)) return { clips: raw, meta: {} };
  return { clips: Array.isArray(raw.clips) ? raw.clips : [], meta: raw };
}

router.post('/pro/highlights', async (req, res) => {
  try {
    const body = req.body || {};
    const { sourceVideo, videoId } = await resolveProfessionalSource(body, req);
    const recipeApplication = await applyEditStyleRecipe({
      userId: req.user?.id || null,
      recipeId: body.editStyleRecipeId || body.recipeId || null,
      recipeData: body.recipe || null,
    });
    const preset = getProEditingPreset(body.presetId || recipeApplication?.presetId || 'viral_shorts_aggressive');
    const toolchain = await getVideoProfessionalToolchainStatus();
    const clipCount = safeInt(body.clipCount ?? body.count ?? recipeApplication?.clipCount, 5, 1, 20);
    const targetDuration = safeNum(body.targetDuration ?? recipeApplication?.targetDuration, 30, 5, 600);
    const analysis = body.analysis || await runProAnalysis({
      sourceVideo,
      targetDuration,
      preset,
    });
    const highlightsRaw = scoreHighlights(analysis, {
      targetDuration,
      clipCount,
      durationMode: body.durationMode || 'normal',
      preset,
      toolchain,
      objective: body.objective || recipeApplication?.recipe?.objective || preset?.objective || null,
      hookFirstEnabled: body.hookFirstEnabled ?? true,
      openingStrengthPriority: body.openingStrengthPriority || 'high',
      avoidDeadAirStart: body.avoidDeadAirStart ?? true,
      preferSpeechStart: body.preferSpeechStart ?? true,
      openingPreRollMs: body.openingPreRollMs ?? 300,
    });
    const { clips, meta } = normalizeHighlights(highlightsRaw);
    res.json({ ok: true, videoId, sourceVideo, highlights: clips, highlightsMeta: meta, analysis, recipe: recipeApplication?.recipe || null, recipeApplication });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

router.post('/pro/edit-plan', async (req, res) => {
  try {
    const body = req.body || {};
    const { sourceVideo, videoId } = await resolveProfessionalSource(body, req);
    const recipeApplication = await applyEditStyleRecipe({
      userId: req.user?.id || null,
      recipeId: body.editStyleRecipeId || body.recipeId || null,
      recipeData: body.recipe || null,
    });
    const preset = getProEditingPreset(body.presetId || recipeApplication?.presetId || 'viral_shorts_aggressive');
    const toolchain = await getVideoProfessionalToolchainStatus();
    const _editPlanTargetDur = safeNum(body.targetDuration ?? recipeApplication?.targetDuration, 30, 5, 600);
    const analysis = body.analysis || await runProAnalysis({
      sourceVideo,
      targetDuration: _editPlanTargetDur,
      preset,
    });
    const targetDuration = _editPlanTargetDur;
    const clipCount = safeInt(body.clipCount ?? body.count ?? recipeApplication?.clipCount, 5, 1, 20);
    const rawHighlights = body.highlights || scoreHighlights(analysis, {
      targetDuration,
      clipCount,
      durationMode: body.durationMode || 'normal',
      preset,
      toolchain,
      objective: body.objective || recipeApplication?.recipe?.objective || preset?.objective || null,
      hookFirstEnabled: body.hookFirstEnabled ?? true,
      openingStrengthPriority: body.openingStrengthPriority || 'high',
      avoidDeadAirStart: body.avoidDeadAirStart ?? true,
      preferSpeechStart: body.preferSpeechStart ?? true,
      openingPreRollMs: body.openingPreRollMs ?? 300,
    });
    const { clips: highlights, meta: highlightsMeta } = normalizeHighlights(rawHighlights);
    const jobId = body.jobId || `pro_${uuidv4()}`;
    const built = await buildProfessionalEditPlan({
      jobId,
      sourceVideo,
      highlights,
      presetId: preset.id,
      format: body.format || '9:16',
      requestedColorPreset: body.colorPresetId || null,
      requestedAudioPreset: body.audioPresetId || null,
      requestedClipCount: safeInt(body.clipCount ?? body.count ?? recipeApplication?.clipCount, 5, 1, 20),
      requestedTargetDuration: _editPlanTargetDur,
      editStyleRecipe: recipeApplication?.recipe || null,
      dynamicEditEnabled: body.dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
      pauseCutEnabled: body.pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
      hookFirstEnabled: body.hookFirstEnabled ?? true,
      openingStrengthPriority: body.openingStrengthPriority || 'high',
      avoidDeadAirStart: body.avoidDeadAirStart ?? true,
      preferSpeechStart: body.preferSpeechStart ?? true,
      openingPreRollMs: body.openingPreRollMs ?? 300,
      styleRules: body.styleRules || recipeApplication?.styleRules || null,
      silenceThresholdDb: body.silenceThresholdDb ?? null,
      minSilenceMs: body.minSilenceMs ?? null,
      keepBreathMs: body.keepBreathMs ?? null,
      maxPauseRemoveMs: body.maxPauseRemoveMs ?? null,
    });
    res.json({ ok: true, jobId, videoId, sourceVideo, editPlan: built.plan, jsonPath: built.jsonPath, otioPath: built.otioPath, highlights, highlightsMeta, analysis, recipe: recipeApplication?.recipe || null, recipeApplication });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

router.post('/pro/supervisor/review', async (req, res) => {
  try {
    const toolchain = await getVideoProfessionalToolchainStatus();
    const review = reviewProfessionalEditPlan({
      plan: req.body?.editPlan || req.body?.plan,
      highlights: req.body?.highlights || [],
      toolchain,
    });
    res.json({ ok: true, review });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

router.post('/pro/render', async (req, res) => {
  try {
    const body = req.body || {};
    const { sourceVideo } = await resolveProfessionalSource(body, req);
    const recipeApplication = await applyEditStyleRecipe({
      userId: req.user?.id || null,
      recipeId: body.editStyleRecipeId || body.recipeId || null,
      recipeData: body.recipe || null,
    });
    let editPlan = body.editPlan || body.plan || null;
    let highlights = body.highlights || [];
    let analysis = body.analysis || null;
    if (!editPlan) {
      const preset = getProEditingPreset(body.presetId || recipeApplication?.presetId || 'viral_shorts_aggressive');
      const toolchain = await getVideoProfessionalToolchainStatus();
      const targetDur = safeNum(body.targetDuration ?? recipeApplication?.targetDuration, 30, 5, 600);
      analysis = analysis || await runProAnalysis({ sourceVideo, targetDuration: targetDur, preset });
      if (!highlights.length) {
        const rescored = scoreHighlights(analysis, {
          targetDuration: targetDur,
          clipCount: safeInt(body.clipCount ?? recipeApplication?.clipCount, 5, 1, 20),
          durationMode: body.durationMode || 'normal',
          preset,
          toolchain,
          objective: body.objective || recipeApplication?.recipe?.objective || preset?.objective || null,
          hookFirstEnabled: body.hookFirstEnabled ?? true,
          openingStrengthPriority: body.openingStrengthPriority || 'high',
          avoidDeadAirStart: body.avoidDeadAirStart ?? true,
          preferSpeechStart: body.preferSpeechStart ?? true,
          openingPreRollMs: body.openingPreRollMs ?? 300,
        });
        const norm = normalizeHighlights(rescored);
        highlights = norm.clips;
      }
      const built = await buildProfessionalEditPlan({
        jobId: body.jobId || `pro_${uuidv4()}`,
        sourceVideo,
        highlights,
        presetId: preset.id,
        format: body.format || '9:16',
        requestedClipCount: safeInt(body.clipCount ?? recipeApplication?.clipCount, 5, 1, 20),
        requestedTargetDuration: targetDur,
        editStyleRecipe: recipeApplication?.recipe || null,
        dynamicEditEnabled: body.dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
        pauseCutEnabled: body.pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
        hookFirstEnabled: body.hookFirstEnabled ?? true,
        openingStrengthPriority: body.openingStrengthPriority || 'high',
        avoidDeadAirStart: body.avoidDeadAirStart ?? true,
        preferSpeechStart: body.preferSpeechStart ?? true,
        openingPreRollMs: body.openingPreRollMs ?? 300,
        styleRules: body.styleRules || recipeApplication?.styleRules || null,
        silenceThresholdDb: body.silenceThresholdDb ?? null,
        minSilenceMs: body.minSilenceMs ?? null,
        keepBreathMs: body.keepBreathMs ?? null,
        maxPauseRemoveMs: body.maxPauseRemoveMs ?? null,
      });
      editPlan = built.plan;
    }
    const render = await renderProfessionalEditPlan({
      jobId: editPlan.jobId || body.jobId || `pro_${uuidv4()}`,
      sourceVideo,
      plan: editPlan,
      analysis,
      format: body.format || editPlan.exports?.[0]?.format || '9:16',
      metadataEnabled: body.metadataEnabled,
      stripSourceMetadata: body.stripSourceMetadata,
      watermarkEnabled: body.watermarkEnabled,
      watermarkText: body.watermarkText,
      authorName: body.authorName,
      editedBy: body.editedBy,
      dynamicEditEnabled: body.dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
      pauseCutEnabled: body.pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
      silenceThresholdDb: body.silenceThresholdDb ?? null,
      minSilenceMs: body.minSilenceMs ?? null,
      keepBreathMs: body.keepBreathMs ?? null,
      maxPauseRemoveMs: body.maxPauseRemoveMs ?? null,
      styleRules: body.styleRules || recipeApplication?.styleRules || null,
    });
    res.json({
      ok: true,
      ...render,
      render,
      primaryOutput: render.primaryOutput,
      outputs: render.outputs,
      editPlan,
      recipe: recipeApplication?.recipe || null,
      recipeApplication,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

router.post('/pro/validate-output', async (req, res) => {
  try {
    const outputPath = String(req.body?.outputPath || '').trim();
    if (!outputPath) {
      return res.status(400).json({ ok: false, error: 'outputPath e obrigatorio.' });
    }
    const validation = await validateProfessionalOutput(outputPath);
    res.json({ ok: true, validation });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// Edit Plans + Editing References (persistent library)
// ============================================================

router.get('/edit-plans', requireAuth, async (req, res) => {
  try {
    const plans = await listEditPlans({ userId: req.user.id });
    res.json({ ok: true, plans });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/edit-plans', requireAuth, async (req, res) => {
  try {
    const plan = await createEditPlan({ userId: req.user.id, data: req.body || {} });
    res.status(201).json({ ok: true, plan });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/edit-plans/:id', requireAuth, async (req, res) => {
  try {
    const plan = await updateEditPlan(req.params.id, { userId: req.user.id, data: req.body || {} });
    if (!plan) return res.status(404).json({ ok: false, error: 'Plano não encontrado' });
    res.json({ ok: true, plan });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/edit-plans/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await deleteEditPlan(req.params.id, { userId: req.user.id });
    if (!deleted) return res.status(404).json({ ok: false, error: 'Plano não encontrado' });
    res.json({ ok: true, deleted: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/edit-plans/:id/duplicate', requireAuth, async (req, res) => {
  try {
    const duplicated = await duplicateEditPlan(req.params.id, { userId: req.user.id });
    if (!duplicated) return res.status(404).json({ ok: false, error: 'Plano não encontrado' });
    res.status(201).json({ ok: true, plan: duplicated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/edit-plans/:id/references', requireAuth, async (req, res) => {
  try {
    const plan = await getEditPlanById(req.params.id, { userId: req.user.id });
    if (!plan) return res.status(404).json({ ok: false, error: 'Plano não encontrado' });
    const references = await listPlanReferences(req.params.id, { userId: req.user.id });
    res.json({ ok: true, plan, references });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/edit-plans/:id/references', requireAuth, referenceUpload.single('file'), async (req, res) => {
  try {
    const plan = await getEditPlanById(req.params.id, { userId: req.user.id });
    if (!plan) {
      if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ ok: false, error: 'Plano não encontrado' });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'Arquivo de vídeo é obrigatório' });

    const reference = await createReference({
      userId: req.user.id,
      data: {
        ...req.body,
        planId: plan.id,
      },
    });
    const uploaded = await uploadReferenceVideo(reference.id, { userId: req.user.id, file: req.file });
    await linkReferenceToPlan(plan.id, reference.id, { userId: req.user.id });
    res.status(201).json({ ok: true, reference: uploaded });
  } catch (err) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/references', requireAuth, async (req, res) => {
  try {
    const references = await listReferences({ userId: req.user.id, planId: req.query?.planId || null });
    res.json({ ok: true, references });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/references', requireAuth, async (req, res) => {
  try {
    const reference = await createReference({ userId: req.user.id, data: req.body || {} });
    res.status(201).json({ ok: true, reference });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/references/:id', requireAuth, async (req, res) => {
  try {
    const reference = await updateReference(req.params.id, { userId: req.user.id, data: req.body || {} });
    if (!reference) return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    res.json({ ok: true, reference });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/references/:id', requireAuth, async (req, res) => {
  try {
    const all = await listReferences({ userId: req.user.id });
    const reference = all.find(item => item.id === req.params.id);
    if (!reference) return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    res.json({ ok: true, reference });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/references/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await deleteReference(req.params.id, { userId: req.user.id });
    if (!deleted) return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    res.json({ ok: true, deleted: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/references/:id/upload', requireAuth, referenceUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Arquivo obrigatório' });
    const reference = await uploadReferenceVideo(req.params.id, { userId: req.user.id, file: req.file });
    if (!reference) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    }
    res.json({ ok: true, reference });
  } catch (err) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/references/:id/analyze-style', requireAuth, async (req, res) => {
  try {
    const analyzed = await analyzeReferenceStyle(req.params.id, { userId: req.user.id });
    if (!analyzed) return res.status(404).json({ ok: false, error: 'Referência não encontrada ou sem vídeo' });
    res.json({ ok: true, ...analyzed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/references/:id/analyze-frames', requireAuth, async (req, res) => {
  try {
    const frameCuts = await analyzeReferenceFrames(req.params.id, { userId: req.user.id });
    if (!frameCuts) return res.status(404).json({ ok: false, error: 'Referência não encontrada ou sem vídeo' });
    res.json({ ok: true, frameCuts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/references/:id/frame-cuts', requireAuth, async (req, res) => {
  try {
    const frameCuts = await getReferenceFrameCuts(req.params.id, { userId: req.user.id });
    if (!frameCuts) return res.status(404).json({ ok: false, error: 'Referência não encontrada ou sem análise' });
    res.json({ ok: true, frameCuts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/references/:id/analysis', requireAuth, async (req, res) => {
  try {
    const analysis = await getReferenceAnalysis(req.params.id, { userId: req.user.id });
    if (!analysis) return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    res.json({ ok: true, ...analysis });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Aliases exigidos: editing-references
router.post('/editing-references/upload', requireAuth, referenceUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Arquivo obrigatório' });
    const reference = await createReference({
      userId: req.user.id,
      data: {
        ...req.body,
        sourceType: 'upload',
      },
    });
    const uploaded = await uploadReferenceVideo(reference.id, { userId: req.user.id, file: req.file });
    const video = mapReferenceVideo(uploaded, req);
    res.status(201).json({ ok: true, reference: withReferenceMedia(uploaded, req), video });
  } catch (err) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/editing-references/link', requireAuth, async (req, res) => {
  try {
    const sourceUrl = String(req.body?.url || req.body?.sourceUrl || '').trim();
    if (!isAllowedReferenceUrl(sourceUrl)) {
      return res.status(400).json({
        ok: false,
        error: 'Não consegui acessar esse link. Envie um arquivo direto ou use um link público/autorizado.',
      });
    }
    const reference = await createReference({
      userId: req.user.id,
      data: {
        ...req.body,
        sourceType: 'link',
        sourceUrl,
        status: 'saved',
      },
    });
    res.status(201).json({ ok: true, reference });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/editing-references', requireAuth, async (req, res) => {
  try {
    const references = await listReferences({ userId: req.user.id });
    const items = references.map(reference => mapReferenceVideo(reference, req));
    res.json({ ok: true, references: references.map(reference => withReferenceMedia(reference, req)), items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/editing-references/:id', requireAuth, async (req, res) => {
  try {
    const all = await listReferences({ userId: req.user.id });
    const reference = all.find(item => item.id === req.params.id);
    if (!reference) return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    res.json({ ok: true, reference: withReferenceMedia(reference, req), video: mapReferenceVideo(reference, req) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/editing-references/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await deleteReference(req.params.id, { userId: req.user.id });
    if (!deleted) return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    res.json({ ok: true, deleted: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/editing-references/:id/analyze', requireAuth, async (req, res) => {
  try {
    const analyzed = await analyzeReferenceStyle(req.params.id, { userId: req.user.id });
    if (!analyzed) {
      return res.status(400).json({
        ok: false,
        error: 'Não consegui analisar essa referência. Envie arquivo direto ou link público/autorizado.',
      });
    }
    res.json({ ok: true, ...analyzed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/editing-references/:id/analysis', requireAuth, async (req, res) => {
  try {
    const analysis = await getReferenceAnalysis(req.params.id, { userId: req.user.id });
    if (!analysis) return res.status(404).json({ ok: false, error: 'Referência não encontrada' });
    res.json({ ok: true, ...analysis });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// Upload/list aliases for reference videos used by Video Squad
// ============================================================
router.post('/reference-videos', requireAuth, referenceUpload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'referenceVideo', maxCount: 1 },
]), async (req, res) => {
  const uploadedFile = pickUploadedReferenceVideo(req);
  try {
    if (!uploadedFile) {
      return res.status(400).json({ ok: false, error: 'Arquivo de vídeo é obrigatório (campos aceitos: video, file, referenceVideo).' });
    }

    const reference = await createReference({
      userId: req.user.id,
      data: {
        ...req.body,
        sourceType: 'upload',
        sourceKind: 'file_upload',
        status: 'uploaded',
      },
    });
    const uploaded = await uploadReferenceVideo(reference.id, { userId: req.user.id, file: uploadedFile });
    const video = mapReferenceVideo(uploaded, req);
    const stat = uploaded?.filePath ? await fs.stat(uploaded.filePath).catch(() => null) : null;
    if (stat?.size && !video.size) video.size = stat.size;
    res.status(201).json({ ok: true, video, reference: withReferenceMedia(uploaded, req) });
  } catch (err) {
    if (uploadedFile?.path) await fs.unlink(uploadedFile.path).catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/reference-videos', requireAuth, async (req, res) => {
  try {
    const references = await listReferences({ userId: req.user.id });
    const items = references.map(reference => mapReferenceVideo(reference, req));
    res.json({ ok: true, items, references: references.map(reference => withReferenceMedia(reference, req)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/references/upload', requireAuth, referenceUpload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'referenceVideo', maxCount: 1 },
]), async (req, res) => {
  const uploadedFile = pickUploadedReferenceVideo(req);
  try {
    logger.info('[ReferenceUpload] received file');
    if (!uploadedFile) {
      return res.status(400).json({ success: false, error: 'Arquivo de vídeo é obrigatório.' });
    }
    const reference = await createReference({
      userId: req.user.id,
      data: {
        ...req.body,
        name: req.body?.name || uploadedFile.originalname || `reference_${Date.now()}`,
        sourceType: 'upload',
        sourceKind: 'file_upload',
        status: 'uploaded',
      },
    });
    const uploaded = await uploadReferenceVideo(reference.id, { userId: req.user.id, file: uploadedFile });
    logger.info(`[ReferenceUpload] saved referenceId=${uploaded.id}`);
    res.status(201).json({
      success: true,
      reference: {
        id: uploaded.id,
        filename: uploaded.originalName || uploaded.sourceVideoFileName || uploaded.name,
        path: uploaded.originalVideoPath || uploaded.filePath,
        status: uploaded.status || 'uploaded',
      },
    });
  } catch (err) {
    if (uploadedFile?.path) await fs.unlink(uploadedFile.path).catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/references/analyze', requireAuth, async (req, res) => {
  try {
    const {
      referenceId,
      mode = 'editing_tutorial',
      extractMultipleStyles = true,
      segmentLengthSeconds = 60,
      maxSegments = 30,
    } = req.body || {};
    const result = await createReferenceLearningJob({
      referenceId,
      userId: req.user.id,
      mode,
      extractMultipleStyles,
      segmentLengthSeconds,
      maxSegments,
    });
    res.status(202).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

router.get('/references/jobs/:jobId', requireAuth, async (req, res) => {
  const job = getReferenceLearningJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado' });
  res.json({ success: true, job });
});

router.get('/references/:id/analysis', requireAuth, async (req, res) => {
  try {
    const tutorialAnalysis = await getReferenceLearningAnalysis(req.params.id, { userId: req.user.id });
    if (tutorialAnalysis) return res.json(tutorialAnalysis);
    const analysis = await getReferenceAnalysis(req.params.id, { userId: req.user.id });
    if (!analysis) return res.status(404).json({ success: false, error: 'Referência não encontrada' });
    res.json({ success: true, referenceAnalysis: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/edit-presets/save-from-reference', requireAuth, async (req, res) => {
  try {
    const { referenceId, techniqueId, presetName } = req.body || {};
    const preset = await savePresetFromReference({
      referenceId,
      techniqueId,
      presetName,
      userId: req.user.id,
    });
    res.status(201).json({ success: true, preset });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

router.post('/analyze-style', requireAuth, async (req, res) => {
  try {
    const {
      videoId = null,
      videoUrl = '',
      mode = 'editing_reference',
    } = req.body || {};

    if (videoId) {
      const analyzed = await analyzeReferenceStyle(videoId, { userId: req.user.id });
      if (!analyzed) {
        return res.status(404).json({ ok: false, error: 'Referência não encontrada ou sem vídeo para análise.' });
      }
      return res.json({
        ok: true,
        status: 'analyzed',
        message: 'Análise de estilo concluída.',
        mode,
        styleProfile: {
          pace: analyzed?.styleAnalysis?.paceLabel || analyzed?.styleAnalysis?.rhythm || 'dynamic',
          cuts: analyzed?.styleAnalysis?.averageSceneDurationSeconds ? `avg_${analyzed.styleAnalysis.averageSceneDurationSeconds}s` : 'detected',
          captions: analyzed?.styleAnalysis?.captionType || 'to_be_detected',
          zoom: analyzed?.styleAnalysis?.useZoom ? 'detected' : 'none',
          transitions: analyzed?.styleAnalysis?.transitionType || 'to_be_detected',
        },
        styleAnalysis: analyzed?.styleAnalysis || null,
        frameCuts: analyzed?.frameCuts || null,
      });
    }

    if (videoUrl && /^https?:\/\//i.test(String(videoUrl))) {
      return res.json({
        ok: true,
        status: 'queued_or_mocked',
        message: 'Vídeo recebido como referência de edição.',
        mode,
        styleProfile: {
          pace: 'dynamic',
          cuts: 'to_be_detected',
          captions: 'to_be_detected',
          zoom: 'to_be_detected',
          transitions: 'to_be_detected',
        },
      });
    }

    return res.status(400).json({ ok: false, error: 'Informe videoId ou videoUrl para análise.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Aliases exigidos: editing-library
router.get('/editing-library', (req, res) => {
  res.json({
    ok: true,
    service: 'video-editing-library',
    routes: [
      '/api/video/editing-library/plans',
      '/api/video/editing-library/references',
      '/api/video/reference-videos',
      '/api/video/analyze-style',
    ],
  });
});
async function sendEditPresetsResponse(res, requestedPresetId = null) {
  const { nativePresets, learnedPresets, presets } = await listPresetLibrary();
  const categories = listEditPresetCategories();
  const presetApplied = requestedPresetId ? getEditPreset(requestedPresetId) : null;
  res.json({
    ok: true,
    success: true,
    categories,
    count: presets.length,
    nativeCount: nativePresets.length,
    learnedCount: learnedPresets.length,
    learnedPresets,
    presets,
    presetApplied,
  });
}

async function sendEditRecipesResponse(req, res, requestedRecipeId = null) {
  const recipes = await listEditStyleRecipes({ userId: req.user?.id || null });
  const applied = requestedRecipeId
    ? await applyEditStyleRecipe({ userId: req.user?.id || null, recipeId: requestedRecipeId })
    : null;
  res.json({
    ok: true,
    success: true,
    count: recipes.length,
    recipes,
    recipeApplied: applied?.recipe || null,
    recipeApplication: applied || null,
  });
}

router.get('/editing-presets', (req, res) => sendEditPresetsResponse(res, req.query?.presetId || null));
router.post('/edit-presets', requireAuth, (req, res) => sendEditPresetsResponse(res, req.body?.presetId || null));
router.post('/editing-presets', requireAuth, (req, res) => sendEditPresetsResponse(res, req.body?.presetId || null));
router.get('/edit-recipes', requireAuth, (req, res) => sendEditRecipesResponse(req, res, req.query?.recipeId || null));
router.post('/edit-recipes', requireAuth, async (req, res) => {
  try {
    const recipe = await createEditStyleRecipe({ userId: req.user.id, data: req.body || {} });
    const application = await applyEditStyleRecipe({ userId: req.user.id, recipeId: recipe.id });
    res.status(201).json({ ok: true, recipe, recipeApplication: application });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.post('/edit-recipes/apply', requireAuth, async (req, res) => {
  try {
    const application = await applyEditStyleRecipe({
      userId: req.user.id,
      recipeId: req.body?.recipeId || req.body?.editStyleRecipeId || null,
      recipeData: req.body?.recipe || null,
    });
    if (!application?.recipe) {
      return res.status(404).json({ ok: false, error: 'Recipe não encontrado' });
    }
    res.json({ ok: true, ...application });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.post('/research/dynamic-cuts', async (req, res) => {
  try {
    const result = await runDynamicEditResearchAgent({
      query: req.body?.query || '',
      platform: req.body?.platform || 'reels',
      niche: req.body?.niche || 'educational',
      contentType: req.body?.contentType || 'talking_head',
      rhythm: req.body?.rhythm || req.body?.pace || 'rápido',
      language: req.body?.language || 'pt-BR',
      userId: req.user?.id || null,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});
router.post('/research/save-preset', async (req, res) => {
  try {
    const result = await saveResearchPreset({
      researchId: req.body?.researchId || '',
      preset: req.body?.preset || null,
      userId: req.user?.id || null,
    });
    res.json({
      ok: true,
      presetId: result.presetId,
      saved: true,
      preset: result.preset,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});
router.post('/research/apply-preset', async (req, res) => {
  try {
    const result = await applyResearchPreset({
      presetId: req.body?.presetId || '',
      target: req.body?.target || 'smartcut',
      userId: req.user?.id || null,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});
router.get('/editing-library/plans', requireAuth, async (req, res) => {
  const plans = await listEditPlans({ userId: req.user.id });
  res.json({ ok: true, plans });
});
router.post('/editing-library/plans', requireAuth, async (req, res) => {
  const plan = await createEditPlan({ userId: req.user.id, data: req.body || {} });
  res.status(201).json({ ok: true, plan });
});
router.put('/editing-library/plans/:id', requireAuth, async (req, res) => {
  const plan = await updateEditPlan(req.params.id, { userId: req.user.id, data: req.body || {} });
  if (!plan) return res.status(404).json({ ok: false, error: 'Plano não encontrado' });
  res.json({ ok: true, plan });
});
router.delete('/editing-library/plans/:id', requireAuth, async (req, res) => {
  const deleted = await deleteEditPlan(req.params.id, { userId: req.user.id });
  if (!deleted) return res.status(404).json({ ok: false, error: 'Plano não encontrado' });
  res.json({ ok: true, deleted: true });
});
router.post('/editing-library/references/upload', requireAuth, referenceUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Arquivo obrigatório' });
    const reference = await createReference({
      userId: req.user.id,
      data: { ...req.body, sourceType: 'upload' },
    });
    const uploaded = await uploadReferenceVideo(reference.id, { userId: req.user.id, file: req.file });
    const video = mapReferenceVideo(uploaded, req);
    res.status(201).json({ ok: true, reference: withReferenceMedia(uploaded, req), video });
  } catch (err) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.get('/editing-library/references', requireAuth, async (req, res) => {
  const references = await listReferences({ userId: req.user.id });
  const items = references.map(reference => mapReferenceVideo(reference, req));
  res.json({ ok: true, references: references.map(reference => withReferenceMedia(reference, req)), items });
});
router.post('/editing-library/references/:id/analyze', requireAuth, async (req, res) => {
  const analyzed = await analyzeReferenceStyle(req.params.id, { userId: req.user.id });
  if (!analyzed) return res.status(400).json({ ok: false, error: 'Referência inválida para análise' });
  res.json({ ok: true, ...analyzed });
});
router.post('/editing-library/supervisor/suggest', requireAuth, async (req, res) => {
  try {
    const {
      editingPlanId = null,
      referenceVideoIds = [],
      platform = 'tiktok',
      objective = 'viral',
    } = req.body || {};
    const styleContext = await buildSmartCutStyleContext({
      userId: req.user.id,
      editPlanId: editingPlanId,
      referenceVideoIds,
      useReferenceStyle: true,
      useFrameCutAnalysis: true,
      explicitPlatform: platform,
    });
    res.json({
      ok: true,
      suggestion: {
        editingPlanId: styleContext.applied.editPlanId,
        editingPlanName: styleContext.applied.editingPlanName,
        referenceVideoIds: styleContext.applied.referenceVideoIds || [],
        platform,
        objective,
        overrides: styleContext.overrides,
        supervisorEnabled: true,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.post('/editing-library/supervisor/validate', requireAuth, async (req, res) => {
  try {
    const {
      editingPlanId = null,
      referenceVideoIds = [],
      platform = 'tiktok',
      outputs = [],
      probe = {},
    } = req.body || {};
    const styleContext = await buildSmartCutStyleContext({
      userId: req.user.id,
      editPlanId: editingPlanId,
      referenceVideoIds,
      useReferenceStyle: true,
      useFrameCutAnalysis: true,
      explicitPlatform: platform,
    });
    const review = {
      approved: true,
      score: 80,
      issues: [],
      improvements: [],
      finalRecommendation: `Aprovado para ${String(platform).toUpperCase()}`,
      context: {
        editingPlanId: styleContext.applied.editPlanId,
        referenceVideoIds: styleContext.applied.referenceVideoIds || [],
        outputsCount: Array.isArray(outputs) ? outputs.length : 0,
        probe,
      },
    };
    res.json({ ok: true, review });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint explícito de SmartCut com plano/referência
router.post('/smartcut', requireAuth, async (req, res) => {
  try {
    const {
      filePath,
      videoId,
      editPlanId = null,
      editingPlanId = null,
      referenceId = null,
      referenceVideoIds = [],
      useReferenceStyle = false,
      useFrameCutAnalysis = false,
      supervisorEnabled = true,
      platform = 'tiktok',
      targetDuration = 45,
      maxClips = 8,
      clipCount,
      count,
      requestedClipCount,
      clipDurationSeconds,
      clipDurationMode,
      targetClipDuration,
      minClipDuration,
      maxClipDuration,
      requestedClipDurationSeconds,
      objective = 'viral',
      format = '9:16',
      instruction = '',
      minScore,
      editStyle = 'cinematic_blur',
      editStyleId = null,
      editStyleName = null,
      editStyleCategory = null,
      editStyleEffects = [],
      captionBehavior = null,
      motionBehavior = null,
      cropBehavior = null,
      styleAiInstructions = '',
      captionStyle = 'none',
      processingMode = 'opus_auto',
      editStyleRecipeId = null,
      editStyleRecipeName = null,
      selectedPresetId = null,
      presetId = null,
      dynamicEditEnabled = null,
      pauseCutEnabled = null,
      styleRules = null,
    } = req.body || {};

    if (!filePath) return res.status(400).json({ ok: false, error: 'filePath obrigatório' });

    const resolvedEditPlanId = editingPlanId || editPlanId || null;
    const resolvedReferenceVideoIds = Array.isArray(referenceVideoIds) && referenceVideoIds.length
      ? referenceVideoIds
      : (referenceId ? [referenceId] : []);
    const resolvedReferenceId = referenceId || resolvedReferenceVideoIds[0] || null;

    const styleContext = await buildSmartCutStyleContext({
      userId: req.user.id,
      editPlanId: resolvedEditPlanId,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      explicitPlatform: platform,
    });
    const recipeApplication = await applyEditStyleRecipe({
      userId: req.user.id,
      recipeId: editStyleRecipeId,
      recipeData: editStyleRecipeId ? null : (styleRules ? { ...(req.body || {}), id: editStyleRecipeId || undefined } : null),
    });
    const activeRecipe = recipeApplication?.recipe || null;

    const normalizedProcessingMode = resolveEffectiveProcessingMode(processingMode);
    const stylePayload = buildEditStylePayload({
      ...(req.body || {}),
      editStyle: editStyleId || editStyle,
      editStyleName,
      editStyleCategory,
      editStyleEffects,
      captionBehavior,
      motionBehavior,
      cropBehavior,
      styleAiInstructions,
    });
    const manualCountProvided = hasManualCountInput(req.body || {});
    const manualDurationProvided = hasManualDurationInput(req.body || {});
    const styleOverrides = styleContext.overrides || {};
    const rawClipCount = requestedClipCount ?? clipCount ?? count ?? req.body?.maxClips ?? maxClips;
    const resolvedCount = manualCountProvided
      ? safeInt(rawClipCount, 8, 1, 100)
      : safeInt(recipeApplication?.clipCount ?? styleOverrides.count ?? rawClipCount, 8, 1, 100);
    const rawDuration = requestedClipDurationSeconds ?? clipDurationSeconds ?? targetClipDuration ?? req.body?.targetDuration ?? targetDuration;
    const resolvedTargetDuration = manualDurationProvided
      ? safeNum(rawDuration, 45, 5, 600)
      : safeNum(recipeApplication?.targetDuration ?? styleOverrides.targetClipDuration ?? styleOverrides.clipDurationSeconds ?? rawDuration, 45, 5, 600);

    const resolvedMinClipDurationSmartcut = manualDurationProvided
      ? (safeNum(minClipDuration, 0, 0, 600) || Math.max(8, Math.round(resolvedTargetDuration * 0.75)))
      : (safeNum(styleOverrides.minClipDuration, 0, 0, 600) || Math.max(8, Math.round(resolvedTargetDuration * 0.75)));
    const resolvedMaxClipDurationSmartcut = manualDurationProvided
      ? (safeNum(maxClipDuration, 0, 0, 600) || Math.round(resolvedTargetDuration * 1.25))
      : (safeNum(styleOverrides.maxClipDuration, 0, 0, 600) || Math.round(resolvedTargetDuration * 1.25));
    const jobOptions = {
      platform: styleOverrides.platform || platform,
      objective: recipeApplication?.objective || objective,
      contentType: 'auto',
      cutType: 'short_form',
      format,
      instruction,
      processingMode: normalizedProcessingMode,
      clipCountMode: manualCountProvided ? 'fixed' : (styleOverrides.clipCountMode || 'fixed'),
      count: resolvedCount,
      requestedClipCount: resolvedCount,
      clipDurationMode: manualDurationProvided ? 'fixed' : (styleOverrides.clipDurationMode || 'fixed'),
      clipDurationSeconds: resolvedTargetDuration,
      targetClipDuration: resolvedTargetDuration,
      requestedClipDurationSeconds: resolvedTargetDuration,
      minClipDuration: resolvedMinClipDurationSmartcut,
      maxClipDuration: resolvedMaxClipDurationSmartcut,
      minScore: Number(minScore || process.env.VIDEO_DEFAULT_MIN_SCORE || 70),
      captionsEnabled: true,
      captionStyle: recipeApplication?.captionStyle || styleOverrides.captionStyle || captionStyle,
      captionMode: 'clean',
      editPace: recipeApplication?.editPace || styleOverrides.editPace || 'medium',
      ...stylePayload,
      editStyle: recipeApplication?.editStyleId || styleOverrides.editStyle || stylePayload.editStyle,
      editStyleRecipeId: activeRecipe?.id || editStyleRecipeId || null,
      editStyleRecipeName: activeRecipe?.name || editStyleRecipeName || null,
      selectedPresetId: activeRecipe?.selectedPresetId || selectedPresetId || presetId || null,
      presetId: recipeApplication?.presetId || selectedPresetId || presetId || null,
      dynamicEditEnabled: dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
      pauseCutEnabled: pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
      styleRules: activeRecipe?.styleRules || styleRules || null,
      metadataCleanup: true,
      autoSendTelegram: false,
      editPlanId: resolvedEditPlanId,
      editingPlanId: resolvedEditPlanId,
      editingPlanName: styleContext.applied?.editingPlanName || null,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      supervisorEnabled: normalizeBoolean(supervisorEnabled, true),
      styleContext,
      smartcutInput: {
        videoId: videoId || null,
        editPlanId: resolvedEditPlanId,
        editingPlanId: resolvedEditPlanId,
        editingPlanName: styleContext.applied?.editingPlanName || null,
        referenceId: resolvedReferenceId,
        referenceVideoIds: resolvedReferenceVideoIds,
        useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
        useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
        supervisorEnabled: normalizeBoolean(supervisorEnabled, true),
        editStyleRecipeId: activeRecipe?.id || editStyleRecipeId || null,
        editStyleRecipeName: activeRecipe?.name || editStyleRecipeName || null,
        selectedPresetId: activeRecipe?.selectedPresetId || selectedPresetId || presetId || null,
        dynamicEditEnabled: dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
        pauseCutEnabled: pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
        styleRules: activeRecipe?.styleRules || styleRules || null,
        editStyleId: stylePayload.editStyleId,
        editStyleName: stylePayload.editStyleName,
        editStyleCategory: stylePayload.editStyleCategory,
        editStyleEffects: stylePayload.editStyleEffects,
        captionBehavior: stylePayload.captionBehavior,
        motionBehavior: stylePayload.motionBehavior,
        cropBehavior: stylePayload.cropBehavior,
        styleAiInstructions: stylePayload.styleAiInstructions,
        requestedClipCount: resolvedCount,
        requestedClipDurationSec: resolvedTargetDuration,
        additionalInstructions: instruction,
      },
    };

    const jobId = createVideoSquadJob(req.user.id, jobOptions);
    setImmediate(async () => {
      await runVideoSquad({
        jobId,
        inputPath: filePath,
        userId: req.user.id,
        options: jobOptions,
      }).catch(e => logger.error('[SmartCutRoute] ' + e.message));
    });
    res.status(202).json({
      ok: true,
      jobId,
      status: 'queued',
      applied: styleContext.applied,
      overrides: styleContext.overrides,
      payload: {
        editingPlanId: resolvedEditPlanId,
        editingPlanName: styleContext.applied?.editingPlanName || null,
        referenceVideoIds: resolvedReferenceVideoIds,
        supervisorEnabled: normalizeBoolean(supervisorEnabled, true),
      },
    });
  } catch (err) {
    logger.error('[SmartCutRoute] ' + err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// v27: CHUNK UPLOAD + IMPORT URL + PIPELINE ROUTES
// ============================================================


const VIDEO_ORIGINAL = process.env.VIDEO_ORIGINAL_DIR || 'storage/uploads/videos/original';
const VIDEO_CHUNKS   = process.env.VIDEO_CHUNKS_DIR   || 'storage/uploads/videos/chunks';
const VIDEO_OUTPUT   = process.env.VIDEO_OUTPUT_DIR   || path.resolve(process.cwd(), '../storage/outputs/videos');
const simpleVideoUpload = multer({
  dest: VIDEO_ORIGINAL,
  limits: { fileSize: Number(process.env.VIDEO_MAX_UPLOAD_BYTES || 2 * 1024 * 1024 * 1024) },
});

function assertSafeVideoPath(filePath) {
  const resolvedUpload = path.resolve(config.storage.upload);
  const resolvedVideoOriginal = path.resolve(VIDEO_ORIGINAL);
  const resolvedPath = path.resolve(String(filePath || ''));
  const allowedRoots = [resolvedUpload, resolvedVideoOriginal];
  const insideAllowedRoot = allowedRoots.some(root => resolvedPath === root || resolvedPath.startsWith(root + path.sep));
  if (!insideAllowedRoot) {
    throw Object.assign(new Error('Arquivo fora dos diretórios permitidos'), { status: 403 });
  }
  return resolvedPath;
}

// ── Simple multipart upload ───────────────────────────────
router.post('/upload', requireAuth, simpleVideoUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file obrigatório' });
  logger.info('[VideoUpload] received file');

  const ALLOWED_EXTS = /\.(mp4|mov|mkv|webm|m4v|avi)$/i;
  const originalName = req.file.originalname || 'video.mp4';
  if (!ALLOWED_EXTS.test(originalName)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'Extensão de arquivo não permitida' });
  }

  const ext = originalName.match(/\.(mp4|mov|mkv|webm|avi|m4v)$/i)?.[1] || 'mp4';
  const videoId = uuidv4();
  const destPath = path.join(VIDEO_ORIGINAL, `${videoId}.${ext}`);
  await fs.mkdir(VIDEO_ORIGINAL, { recursive: true });
  await fs.rename(req.file.path, destPath);
  await registerUploadedVideo({
    videoId,
    userId: req.user.id,
    filePath: destPath,
    originalName,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    source: 'upload',
  }).catch(() => {});

  res.json({
    ok: true,
    videoId,
    filePath: destPath,
    fileName: originalName,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

// ── Chunk upload init ──────────────────────────────────────
router.post('/upload/init', requireAuth, async (req, res) => {
  const { fileName, fileSize, mimeType } = req.body;
  if (!fileName || !fileSize) return res.status(400).json({ error: 'fileName e fileSize obrigatórios' });
  const sizeNum = Number(fileSize);
  const maxUploadBytes = Number(process.env.VIDEO_MAX_UPLOAD_BYTES || 2 * 1024 * 1024 * 1024);
  if (!Number.isFinite(sizeNum) || sizeNum <= 0) return res.status(400).json({ error: 'fileSize inválido' });
  if (sizeNum > maxUploadBytes) {
    return res.status(413).json({ error: `Arquivo excede o limite configurado de ${Math.round(maxUploadBytes / 1024 / 1024)}MB` });
  }

  const uploadId = uuidv4();
  const chunkDir = path.join(VIDEO_CHUNKS, uploadId);
  await fs.mkdir(chunkDir, { recursive: true });

  // Save meta
  await fs.writeFile(path.join(chunkDir, 'meta.json'), JSON.stringify({ fileName, fileSize: sizeNum, mimeType, uploadId, userId: req.user.id, createdAt: Date.now() }));

  const chunkSize = 10 * 1024 * 1024; // 10 MB
  res.json({ ok: true, uploadId, chunkSize, totalChunks: Math.ceil(sizeNum / chunkSize), maxUploadBytes });
});

// ── Chunk upload chunk ─────────────────────────────────────
const chunkUpload = multer({ dest: VIDEO_CHUNKS, limits: { fileSize: 30 * 1024 * 1024 } });
router.post('/upload/chunk', requireAuth, chunkUpload.single('chunk'), async (req, res) => {
  const { uploadId, chunkIndex, totalChunks } = req.body;
  if (!uploadId || chunkIndex === undefined || !req.file) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'uploadId, chunkIndex e chunk file obrigatórios' });
  }

  // Sanitize inputs — prevent path traversal
  const safeUploadId = path.basename(uploadId);
  const idxNum       = parseInt(chunkIndex, 10);
  const totalNum     = parseInt(totalChunks, 10);

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(safeUploadId)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'uploadId inválido' });
  }
  if (!Number.isInteger(idxNum) || idxNum < 0) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'chunkIndex inválido' });
  }
  if (!Number.isInteger(totalNum) || totalNum < 1) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'totalChunks inválido — deve ser inteiro > 0' });
  }
  if (idxNum >= totalNum) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'chunkIndex maior que totalChunks' });
  }

  // Verify chunkDir is inside VIDEO_CHUNKS (path traversal guard)
  const resolvedChunksBase = path.resolve(VIDEO_CHUNKS);
  const chunkDir  = path.join(VIDEO_CHUNKS, safeUploadId);
  const resolvedChunkDir = path.resolve(chunkDir);
  if (!resolvedChunkDir.startsWith(resolvedChunksBase + path.sep)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Verify meta.json exists and belongs to this user
  const metaPath = path.join(chunkDir, 'meta.json');
  const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
  if (!metaExists) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(404).json({ error: 'Upload não iniciado ou expirado' });
  }
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8').catch(() => '{}'));
  if (meta.userId && meta.userId !== req.user.id) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(403).json({ error: 'Upload não pertence a este usuário' });
  }

  const chunkPath = path.join(chunkDir, `chunk_${String(idxNum).padStart(6, '0')}.part`);
  await fs.rename(req.file.path, chunkPath);

  res.json({ ok: true, uploadId: safeUploadId, chunkIndex: idxNum, totalChunks: totalNum });
});

// ── Chunk upload complete ──────────────────────────────────
router.post('/upload/complete', requireAuth, async (req, res) => {
  const { uploadId, totalChunks } = req.body;
  if (!uploadId || !totalChunks) return res.status(400).json({ error: 'uploadId e totalChunks obrigatórios' });
  logger.info('[VideoUpload] received file');

  // Sanitize uploadId
  const safeUploadId = path.basename(uploadId);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(safeUploadId)) {
    return res.status(400).json({ error: 'uploadId inválido' });
  }

  const totalNum = parseInt(totalChunks, 10);
  if (!Number.isInteger(totalNum) || totalNum < 1 || totalNum > 1000) {
    return res.status(400).json({ error: 'totalChunks inválido' });
  }

  // Path traversal guard
  const resolvedChunksBase = path.resolve(VIDEO_CHUNKS);
  const chunkDir = path.join(VIDEO_CHUNKS, safeUploadId);
  if (!path.resolve(chunkDir).startsWith(resolvedChunksBase + path.sep)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // meta.json MUST exist — reject if missing
  const metaPath2 = path.join(chunkDir, 'meta.json');
  const metaExists2 = await fs.access(metaPath2).then(() => true).catch(() => false);
  if (!metaExists2) {
    return res.status(400).json({ error: 'Upload não iniciado ou expirado — meta.json ausente' });
  }
  const metaRaw  = await fs.readFile(metaPath2, 'utf-8').catch(() => '{}');
  const meta     = JSON.parse(metaRaw);

  // Ownership check
  if (meta.userId && meta.userId !== req.user.id) {
    return res.status(403).json({ error: 'Upload não pertence a este usuário' });
  }

  // Validate fileName extension
  const ALLOWED_EXTS = /\.(mp4|mov|mkv|webm|m4v|avi)$/i;
  if (meta.fileName && !ALLOWED_EXTS.test(meta.fileName)) {
    return res.status(400).json({ error: 'Extensão de arquivo não permitida' });
  }

  const ext = (meta.fileName || 'video.mp4').match(/\.(mp4|mov|mkv|webm|avi|m4v)$/i)?.[1] || 'mp4';
  const videoId  = uuidv4();
  const destPath = path.join(VIDEO_ORIGINAL, `${videoId}.${ext}`);
  await fs.mkdir(VIDEO_ORIGINAL, { recursive: true });

  // Concatenate chunks using streams (avoids loading all into memory)
  const { createWriteStream, createReadStream } = await import('fs');
  const ws = createWriteStream(destPath);
  for (let i = 0; i < totalNum; i++) {
    const cp = path.join(chunkDir, `chunk_${String(i).padStart(6, '0')}.part`);
    await new Promise((resolve, reject) => {
      const rs = createReadStream(cp);
      rs.on('error', reject);
      rs.on('end', resolve);
      rs.pipe(ws, { end: false });
    });
  }
  await new Promise((res, rej) => { ws.end(); ws.on('finish', res); ws.on('error', rej); });

  // Clean chunks
  await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});
  await registerUploadedVideo({
    videoId,
    userId: req.user.id,
    filePath: destPath,
    originalName: meta.fileName,
    mimeType: meta.mimeType,
    sizeBytes: meta.fileSize,
    source: 'chunk_upload',
  }).catch(() => {});

  res.json({ ok: true, videoId, filePath: destPath, fileName: meta.fileName });
});

// ── Import from URL ────────────────────────────────────────
router.post('/import-url', requireAuth, async (req, res) => {
  const {
    url, sourceUrl, sourceType, driveFileId,
    confirmedAuthorized = false,
    cutType = 'short_form', platform = 'instagram', objective = 'viral', instruction = '',
    contentType = 'auto',
    format = '9:16',
    processingMode,
    clipCountMode,
    clipDurationSeconds,
    clipDurationMode,
    targetClipDuration,
    minClipDuration,
    maxClipDuration,
    count = 5,
    clipCount,
    sourceJobId,
    sourceFileName,
    finalizeKeepSingleOutput = true,
    dynamicCutsMode = 'light',
    minScore,
    captionsEnabled,
    captionStyle = 'none',
    captionMode = 'none',
    captionPosition = 'auto_face_aware',
    captionMaxWordsPerBlock,
    captionMaxLines,
    captionMaxCharsPerLine,
    captionMinBlockDuration,
    captionMaxBlockDuration,
    dynamicCutsEnabled,
    editPace,
    editMode = 'best_moments',
    videoContentType = contentType,
    destination = 'shorts_vertical',
    pauseCutMode = 'normal',
    mistakeCutMode = 'soft',
    editStyle = 'cinematic_blur',
    editStyleId = null,
    editStyleName = null,
    editStyleCategory = null,
    editStyleEffects = [],
    captionBehavior = null,
    motionBehavior = null,
    cropBehavior = null,
    styleAiInstructions = '',
    editStyleRecipeId = null,
    editStyleRecipeName = null,
    selectedPresetId = null,
    presetId = null,
    dynamicEditEnabled = null,
    pauseCutEnabled = null,
    styleRules = null,
    metadataCleanup,
    metadataOptions,
    autoSendTelegram = false,
    telegramAutoSend,
    deleteAfterTelegram,
    telegramMode,
    editPlanId = null,
    editingPlanId = null,
    referenceId = null,
    referenceVideoIds = [],
    useReferenceStyle = false,
    useFrameCutAnalysis = false,
    supervisorEnabled = true,
  } = req.body;

  const effectiveUrl        = sourceUrl || url;
  const effectiveSourceType = sourceType || detectVideoSource(effectiveUrl || '');

  if (!effectiveUrl && !driveFileId) {
    return res.status(400).json({ error: 'url/sourceUrl ou driveFileId obrigatório' });
  }

  // v28: use videoSourceManager to handle all source types
  try {
    const resolved = await resolveVideoSource({
      sourceType:          effectiveSourceType,
      filePath:            null,
      sourceUrl:           effectiveUrl,
      driveFileId,
      userId:              req.user.id,
      confirmedAuthorized,
    });

    if (!resolved.ok) {
      const isYoutubeAuthRequired = resolved.code === 'YOUTUBE_AUTH_REQUIRED';
      return res.status(422).json({
        error: resolved.error || resolved.message || 'Falha ao importar vídeo',
        code: resolved.code,
        message: resolved.message,
        fallbackOptions: resolved.fallbackOptions,
        ...(isYoutubeAuthRequired ? {} : { details: resolved.details }),
      });
    }

    const normalizedProcessingMode = resolveEffectiveProcessingMode(processingMode, { sourceJobId });
    const normalizedClipCountMode = normalizeClipCountMode(clipCountMode);
    const selectedCount = normalizedProcessingMode === 'finalize_approved' ? null : (clipCount ?? count);
    const resolvedEditPlanId = editingPlanId || editPlanId || null;
    const resolvedReferenceVideoIds = Array.isArray(referenceVideoIds) && referenceVideoIds.length
      ? referenceVideoIds
      : (referenceId ? [referenceId] : []);
    const resolvedReferenceId = referenceId || resolvedReferenceVideoIds[0] || null;
    const styleContext = await buildSmartCutStyleContext({
      userId: req.user.id,
      editPlanId: resolvedEditPlanId,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      explicitPlatform: platform || 'auto',
    });
    const recipeApplication = await applyEditStyleRecipe({
      userId: req.user.id,
      recipeId: editStyleRecipeId,
      recipeData: editStyleRecipeId ? null : (styleRules ? { ...(req.body || {}), id: editStyleRecipeId || undefined } : null),
    });
    const activeRecipe = recipeApplication?.recipe || null;
    const styleOverrides = styleContext?.overrides || {};
    const stylePayload = buildEditStylePayload({
      ...(req.body || {}),
      editStyle: editStyleId || editStyle,
      editStyleName,
      editStyleCategory,
      editStyleEffects,
      captionBehavior,
      motionBehavior,
      cropBehavior,
      styleAiInstructions,
    });
    const resolvedPlatform = styleOverrides.platform || platform || 'auto';
    const resolvedEditStyle = styleOverrides.editStyle || stylePayload.editStyle;
    const resolvedEditPace = styleOverrides.editPace || editPace;
    const resolvedCaptionStyle = styleOverrides.captionStyle || captionStyle;
    const manualCountProvided = hasManualCountInput(req.body || {});
    const manualDurationProvided = hasManualDurationInput(req.body || {});
    const resolvedCount = manualCountProvided ? selectedCount : (recipeApplication?.clipCount ?? styleOverrides.count ?? selectedCount);
    const resolvedClipDurationMode = manualDurationProvided ? clipDurationMode : (styleOverrides.clipDurationMode || clipDurationMode);
    const resolvedClipDurationSeconds = manualDurationProvided ? clipDurationSeconds : (styleOverrides.clipDurationSeconds ?? clipDurationSeconds);
    const resolvedTargetClipDuration = manualDurationProvided ? targetClipDuration : (recipeApplication?.targetDuration ?? styleOverrides.targetClipDuration ?? targetClipDuration);
    const resolvedMinClipDuration = manualDurationProvided ? minClipDuration : (styleOverrides.minClipDuration ?? minClipDuration);
    const resolvedMaxClipDuration = manualDurationProvided ? maxClipDuration : (styleOverrides.maxClipDuration ?? maxClipDuration);
    const clipDurationOptions = resolveClipDurationOptions(normalizedProcessingMode, {
      clipDurationMode: resolvedClipDurationMode,
      clipDurationSeconds: resolvedClipDurationSeconds,
      targetClipDuration: resolvedTargetClipDuration,
      minClipDuration: resolvedMinClipDuration,
      maxClipDuration: resolvedMaxClipDuration,
    });
    const shouldSendTelegram = Boolean(telegramAutoSend ?? autoSendTelegram);
    const requestedCaptions = captionsEnabled === true || hasExplicitCaptionStyle(resolvedCaptionStyle) || normalizeCaptionMode(captionMode) !== 'none';
    const effectiveCaptionMode = resolveCaptionMode(normalizedProcessingMode, requestedCaptions, captionMode, resolvedCaptionStyle);
    const effectiveCaptionsEnabled = effectiveCaptionMode !== 'none';
    const effectiveMetadataCleanup = metadataCleanup ?? (normalizedProcessingMode !== 'raw_review');
    const jobOptions = {
      platform: resolvedPlatform,
      contentType,
      sourceType: resolved.sourceType || effectiveSourceType,
      sourceUrl: effectiveUrl || null,
      objective: recipeApplication?.objective || objective,
      count: normalizedProcessingMode === 'finalize_approved' ? 1 : (normalizedClipCountMode === 'auto' ? null : Math.min(parseInt(resolvedCount) || 5, 100)),
      clipCountMode: normalizedProcessingMode === 'finalize_approved' ? 'fixed' : normalizedClipCountMode,
      ...clipDurationOptions,
      processingMode: normalizedProcessingMode,
      sourceJobId,
      sourceFileName,
      finalizeKeepSingleOutput: Boolean(finalizeKeepSingleOutput),
      dynamicCutsMode,
      minScore: Number(minScore || process.env.VIDEO_DEFAULT_MIN_SCORE || 70),
      cutType,
      format,
      instruction,
      captionStyle: recipeApplication?.captionStyle || resolvedCaptionStyle,
      captionMode: effectiveCaptionMode,
      captionPosition: normalizeCaptionPosition(captionPosition),
      captionsEnabled: Boolean(effectiveCaptionsEnabled),
      captionMaxWordsPerBlock,
      captionMaxLines,
      captionMaxCharsPerLine,
      captionMinBlockDuration,
      captionMaxBlockDuration,
      dynamicCutsEnabled: Boolean(dynamicCutsEnabled ?? normalizedProcessingMode !== 'raw_review'),
      dynamicEditEnabled: dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
      pauseCutEnabled: pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
      editPace: recipeApplication?.editPace || resolvedEditPace || 'medium',
      editMode,
      videoContentType,
      destination,
      pauseCutMode,
      mistakeCutMode,
      ...stylePayload,
      editStyle: recipeApplication?.editStyleId || resolvedEditStyle,
      editStyleRecipeId: activeRecipe?.id || editStyleRecipeId || null,
      editStyleRecipeName: activeRecipe?.name || editStyleRecipeName || null,
      selectedPresetId: activeRecipe?.selectedPresetId || selectedPresetId || presetId || null,
      presetId: recipeApplication?.presetId || selectedPresetId || presetId || null,
      styleRules: activeRecipe?.styleRules || styleRules || null,
      metadataCleanup: Boolean(effectiveMetadataCleanup),
      metadataOptions,
      autoSendTelegram: shouldSendTelegram,
      telegramAutoSend: shouldSendTelegram,
      deleteAfterTelegram: deleteAfterTelegram !== undefined ? Boolean(deleteAfterTelegram) : undefined,
      telegramMode: normalizeTelegramMode(telegramMode),
      editPlanId: resolvedEditPlanId,
      editingPlanId: resolvedEditPlanId,
      editingPlanName: styleContext?.applied?.editingPlanName || null,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      supervisorEnabled: normalizeBoolean(supervisorEnabled, true),
      styleContext,
    };

    // URL imports use the Video Squad pipeline by default. The legacy pipeline remains available at /pipeline/jobs.
    const jobId   = createVideoSquadJob(req.user.id, jobOptions);
    const videoId = uuidv4();

    setImmediate(async () => {
      await runVideoSquad({
        jobId,
        inputPath: resolved.filePath,
        userId: req.user.id,
        options: jobOptions,
      }).catch(e => logger.error('[ImportUrl VideoSquad] ' + e.message));
    });

    res.json({ ok: true, jobId, videoId, sourceType: resolved.sourceType, processingMode: normalizedProcessingMode, status: 'queued' });
  } catch (err) {
    logger.error('[ImportUrl] ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Import already uploaded server file ───────────────────
router.post('/import-server-file', requireAuth, async (req, res) => {
  try {
    const {
      filePath,
      path: inputPath,
      fileName,
      cutType = 'short_form',
      platform = 'instagram',
      objective = 'viral',
      instruction = '',
      contentType = 'auto',
      format = '9:16',
      processingMode,
      sourceJobId,
      count = 5,
      clipCount,
      captionsEnabled,
      captionStyle = 'none',
      captionMode = 'none',
      autoSendTelegram = false,
      telegramAutoSend,
      telegramMode,
      editPlanId = null,
      editingPlanId = null,
      referenceId = null,
      referenceVideoIds = [],
      useReferenceStyle = false,
      useFrameCutAnalysis = false,
      supervisorEnabled = true,
      editPace = 'medium',
      editStyle = 'cinematic_blur',
    } = req.body;

    const resolvedPath = assertSafeVideoPath(filePath || inputPath);
    const exists = await fs.access(resolvedPath).then(() => true).catch(() => false);
    if (!exists) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const normalizedProcessingMode = resolveEffectiveProcessingMode(processingMode, { sourceJobId });
    const shouldSendTelegram = Boolean(telegramAutoSend ?? autoSendTelegram);
    const resolvedEditPlanId = editingPlanId || editPlanId || null;
    const resolvedReferenceVideoIds = Array.isArray(referenceVideoIds) && referenceVideoIds.length
      ? referenceVideoIds
      : (referenceId ? [referenceId] : []);
    const resolvedReferenceId = referenceId || resolvedReferenceVideoIds[0] || null;
    const styleContext = await buildSmartCutStyleContext({
      userId: req.user.id,
      editPlanId: resolvedEditPlanId,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      explicitPlatform: platform || 'auto',
    });
    const styleOverrides = styleContext?.overrides || {};
    const resolvedCaptionStyle = styleOverrides.captionStyle || captionStyle;
    const requestedCaptions = captionsEnabled === true || hasExplicitCaptionStyle(resolvedCaptionStyle) || normalizeCaptionMode(captionMode) !== 'none';
    const effectiveCaptionMode = resolveCaptionMode(normalizedProcessingMode, requestedCaptions, captionMode, resolvedCaptionStyle);
    const jobOptions = {
      platform: styleOverrides.platform || platform || 'auto',
      contentType,
      sourceType: 'server_file',
      objective,
      count: styleOverrides.count ?? (clipCount ?? count),
      processingMode: normalizedProcessingMode,
      cutType,
      format,
      instruction,
      captionStyle: resolvedCaptionStyle,
      captionMode: effectiveCaptionMode,
      captionsEnabled: effectiveCaptionMode !== 'none',
      editPace: styleOverrides.editPace || editPace || 'medium',
      editStyle: styleOverrides.editStyle || editStyle,
      autoSendTelegram: shouldSendTelegram,
      telegramAutoSend: shouldSendTelegram,
      telegramMode: normalizeTelegramMode(telegramMode),
      editPlanId: resolvedEditPlanId,
      editingPlanId: resolvedEditPlanId,
      editingPlanName: styleContext?.applied?.editingPlanName || null,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      supervisorEnabled: normalizeBoolean(supervisorEnabled, true),
      styleContext,
    };

    const jobId = createVideoSquadJob(req.user.id, jobOptions);
    const videoId = uuidv4();

    setImmediate(async () => {
      await runVideoSquad({
        jobId,
        inputPath: resolvedPath,
        userId: req.user.id,
        options: jobOptions,
      }).catch(e => logger.error('[ImportServerFile VideoSquad] ' + e.message));
    });

    res.json({
      ok: true,
      jobId,
      videoId,
      filePath: resolvedPath,
      fileName: fileName || path.basename(resolvedPath),
      sourceType: 'server_file',
      processingMode: normalizedProcessingMode,
      status: 'queued',
    });
  } catch (err) {
    logger.error('[ImportServerFile] ' + err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Create pipeline job ────────────────────────────────────
router.post('/pipeline/jobs', requireAuth, async (req, res) => {
  const {
    videoId, filePath,
    cutType = 'short_form', platform = 'instagram', instruction = '',
    metadataOptions = null,
    autoSendTelegram = false,
    telegramMode,
  } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath obrigatório' });

  const jobId = createJob(req.user.id);

  setImmediate(async () => {
    await runPipeline({
      jobId, videoId: videoId || uuidv4(), inputPath: filePath,
      cutType, platform, instruction, metadataOptions,
      autoSendTelegram: Boolean(autoSendTelegram),
      telegramMode: normalizeTelegramMode(telegramMode),
    }).catch(e => logger.error('[PipelineJob] ' + e.message));
  });

  res.json({ ok: true, jobId, status: 'queued' });
});

// ── Get pipeline job status ────────────────────────────────
router.get('/pipeline/jobs/:jobId', requireAuth, async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  res.json({ ok: true, ...job });
});

// ── Signed download token ─────────────────────────────────
// GET /video/download-token?jobId=...&file=... → { token, url }
// Token is valid for 1 hour. Frontend uses this for <a href> downloads.
router.get('/download-token', requireAuth, async (req, res) => {
  const { jobId, file } = req.query;
  if (!jobId || !file) return res.status(400).json({ error: 'jobId e file obrigatórios' });

  const safeFile = path.basename(file);    // strip path traversal
  const safeJob  = path.basename(jobId);   // strip path traversal

  // Ownership check — try in-memory job store first
  const liveJob = getVideoSquadJob(safeJob);
  if (liveJob) {
    if (liveJob.userId !== req.user.id) {
      return res.status(403).json({ error: 'Job não pertence a este usuário' });
    }
  } else {
    // Job expired from Map — try reading persisted metadata
    const metaFile = path.join(VIDEO_OUTPUT, safeJob, 'job.json');
    const persisted = await fs.readFile(metaFile, 'utf-8').then(d => JSON.parse(d)).catch(() => null);
    if (persisted) {
      if (persisted.userId !== req.user.id) {
        return res.status(403).json({ error: 'Job não pertence a este usuário' });
      }
    }
    // If no metadata at all, we still allow by verifying file exists (legacy pipeline jobs)
    // to avoid breaking older jobs that never had job.json
  }

  // Verify the requested file actually exists in the job directory
  const resolvedBase = path.resolve(VIDEO_OUTPUT);
  const resolvedFile = path.resolve(path.join(VIDEO_OUTPUT, safeJob, safeFile));
  if (!resolvedFile.startsWith(resolvedBase + path.sep)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const exists = await fs.access(resolvedFile).then(() => true).catch(() => false);
  if (!exists) return res.status(404).json({ error: 'Arquivo não encontrado' });

  if (/\.mp4$/i.test(safeFile)) {
    try {
      const validation = await probeServedMp4(resolvedFile);
      logger.info(`[VideoDownload] outputPath=${resolvedFile} size=${validation.size} ffprobe=${JSON.stringify({ duration: validation.duration, size: validation.size })}`);
    } catch (err) {
      logger.warn(`[VideoDownload] blocked invalid mp4 outputPath=${resolvedFile} error=${err.message}`);
      return res.status(422).json({ ok: false, error: err.message });
    }
  }

  const payload = { uid: req.user.id, jobId: safeJob, file: safeFile };
  const token   = jwt.sign(payload, process.env.JWT_SECRET || 'botsquad-secret', { expiresIn: '1h' });
  const url     = `/outputs/videos/${safeJob}/${safeFile}?token=${token}`;
  res.json({ ok: true, token, url });
});

// ── Serve clips (cookie auth OR signed query token) ─────────────────────────
router.use('/clips', (req, res, next) => {
  const qToken = req.query?.token;
  if (qToken) {
    try {
      const payload = jwt.verify(qToken, process.env.JWT_SECRET || 'botsquad-secret');

      // Extract jobId and file from URL path: /jobId/filename
      const parts    = req.path.replace(/^\//, '').split('/');
      const urlJobId = parts[0];
      const urlFile  = parts[parts.length - 1];

      // Strict match: token must be for this exact job+file
      if (payload.jobId !== urlJobId || payload.file !== urlFile) {
        return res.status(403).json({ error: 'Token inválido para este arquivo' });
      }
      return next();
    } catch { /* fall through to requireAuth */ }
  }
  requireAuth(req, res, next);
}, (req, res, next) => {
  // Path traversal guard
  const resolvedBase = path.resolve(VIDEO_OUTPUT);
  const resolvedFile = path.resolve(path.join(VIDEO_OUTPUT, req.path));
  if (!resolvedFile.startsWith(resolvedBase + path.sep)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  res.sendFile(resolvedFile, (err) => { if (err && !res.headersSent) next(); });
});

// ── Cleanup job ────────────────────────────────────────────
router.post('/pipeline/jobs/:jobId/cleanup', requireAuth, async (req, res) => {
  const result = await runVideoCleanup();
  res.json({ ok: true, ...result });
});

// ── Video Squad routes (v29) ──────────────────────────────
// POST /video/squad/jobs
router.post('/squad/jobs', requireAuth, async (req, res) => {
  try {
    const {
      filePath,
      sourceJobId,
      sourceFileName,
      platform      = 'tiktok',
      contentType   = 'auto',
      objective     = 'viral',
      count         = 5,
      clipCount,
      requestedClipCount,
      cutType       = 'short_form',
      format        = '9:16',
      instruction   = '',
      captionStyle  = 'none',
      captionMode   = 'none',
      captionPosition = 'auto_face_aware',
      captionsEnabled,
      captionMaxWordsPerBlock,
      captionMaxLines,
      captionMaxCharsPerLine,
      captionMinBlockDuration,
      captionMaxBlockDuration,
      processingMode,
      clipCountMode,
      clipDurationSeconds,
      requestedClipDurationSeconds,
      clipDurationMode,
      targetClipDuration,
      minClipDuration,
      maxClipDuration,
      finalizeKeepSingleOutput = true,
      dynamicCutsMode = 'light',
      minScore,
      dynamicCutsEnabled,
      editPace,
      editMode = 'best_moments',
      videoContentType = contentType,
      destination = 'shorts_vertical',
      pauseCutMode = 'normal',
      mistakeCutMode = 'soft',
      editStyle = 'cinematic_blur',
      editStyleId = null,
      editStyleName = null,
      editStyleCategory = null,
      editStyleEffects = [],
      captionBehavior = null,
      motionBehavior = null,
      cropBehavior = null,
      styleAiInstructions = '',
      editStyleRecipeId = null,
      editStyleRecipeName = null,
      selectedPresetId = null,
      presetId = null,
      dynamicEditEnabled = null,
      pauseCutEnabled = null,
      styleRules = null,
      metadataCleanup,
      metadataOptions,
      autoSendTelegram = false,
      telegramAutoSend,
      deleteAfterTelegram,
      telegramMode,
      editPlanId = null,
      editingPlanId = null,
      referenceId = null,
      referenceVideoIds = [],
      useReferenceStyle = false,
      useFrameCutAnalysis = false,
      supervisorEnabled = true,
    } = req.body;

    const normalizedProcessingMode = resolveEffectiveProcessingMode(processingMode, { sourceJobId });
    let resolvedInput = filePath ? path.resolve(filePath) : null;

    if (!resolvedInput && normalizedProcessingMode === 'finalize_approved') {
      resolvedInput = await resolveFinalizeApprovedSourcePath(sourceJobId, sourceFileName);
    }

    if (!resolvedInput) return res.status(400).json({ ok: false, error: 'filePath ou sourceJobId/sourceFileName obrigatório' });

    // ── Security: validate filePath is inside allowed storage directories ────
    const allowedBases = [
      path.resolve(config?.storage?.upload   || 'storage/uploads'),
      path.resolve(config?.storage?.temp     || 'storage/temp'),
      path.resolve(process.env.UPLOAD_DIR    || 'storage/uploads'),
      path.resolve(process.env.TEMP_DIR      || 'storage/temp'),
      path.resolve(process.env.VIDEO_ORIGINAL_DIR || 'storage/uploads/videos/original'),
      path.resolve(VIDEO_OUTPUT),
    ].filter(Boolean);

    const isAllowed = allowedBases.some(base => resolvedInput.startsWith(base + path.sep) || resolvedInput === base);
    if (!isAllowed) {
      logger.warn(`[VideoSquadRoute] rejected filePath outside storage: ${resolvedInput} userId=${req.user.id}`);
      return res.status(400).json({ ok: false, error: 'Caminho de arquivo inválido' });
    }

    // File must exist
    const fileExists = await fs.access(resolvedInput).then(() => true).catch(() => false);
    if (!fileExists) {
      return res.status(400).json({ ok: false, error: 'Arquivo não encontrado no servidor' });
    }

    const normalizedClipCountMode = normalizeClipCountMode(clipCountMode);
    const shouldSendTelegram = Boolean(telegramAutoSend ?? autoSendTelegram);
    const resolvedEditPlanId = editingPlanId || editPlanId || null;
    const resolvedReferenceVideoIds = Array.isArray(referenceVideoIds) && referenceVideoIds.length
      ? referenceVideoIds
      : (referenceId ? [referenceId] : []);
    const resolvedReferenceId = referenceId || resolvedReferenceVideoIds[0] || null;
    const styleContext = await buildSmartCutStyleContext({
      userId: req.user.id,
      editPlanId: resolvedEditPlanId,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      explicitPlatform: platform,
    });
    const recipeApplication = await applyEditStyleRecipe({
      userId: req.user.id,
      recipeId: editStyleRecipeId,
      recipeData: editStyleRecipeId ? null : (styleRules ? { ...(req.body || {}) } : null),
    });
    const activeRecipe = recipeApplication?.recipe || null;
    const styleOverrides = styleContext?.overrides || {};
    const stylePayload = buildEditStylePayload({
      ...(req.body || {}),
      editStyle: editStyleId || editStyle,
      editStyleName,
      editStyleCategory,
      editStyleEffects,
      captionBehavior,
      motionBehavior,
      cropBehavior,
      styleAiInstructions,
    });
    const resolvedPlatform = styleOverrides.platform || platform;
    const resolvedEditStyle = styleOverrides.editStyle || stylePayload.editStyle;
    const resolvedEditPace = styleOverrides.editPace || editPace;
    const resolvedCaptionStyle = styleOverrides.captionStyle || captionStyle;
    const manualCountProvided = hasManualCountInput(req.body || {});
    const manualDurationProvided = hasManualDurationInput(req.body || {});
    const requestedCountInput = requestedClipCount ?? clipCount ?? count;
    const resolvedCount = manualCountProvided ? requestedCountInput : (recipeApplication?.clipCount ?? styleOverrides.count ?? requestedCountInput);
    const resolvedClipDurationMode = manualDurationProvided ? clipDurationMode : (styleOverrides.clipDurationMode || clipDurationMode);
    const resolvedClipDurationSeconds = manualDurationProvided
      ? (requestedClipDurationSeconds ?? clipDurationSeconds)
      : (styleOverrides.clipDurationSeconds ?? requestedClipDurationSeconds ?? clipDurationSeconds);
    const resolvedTargetClipDuration = manualDurationProvided ? targetClipDuration : (recipeApplication?.targetDuration ?? styleOverrides.targetClipDuration ?? targetClipDuration);
    const resolvedMinClipDuration = manualDurationProvided ? minClipDuration : (styleOverrides.minClipDuration ?? minClipDuration);
    const resolvedMaxClipDuration = manualDurationProvided ? maxClipDuration : (styleOverrides.maxClipDuration ?? maxClipDuration);
    const selectedCount = normalizedProcessingMode === 'finalize_approved' ? null : (requestedClipCount ?? clipCount ?? count);
    const clipDurationOptions = resolveClipDurationOptions(normalizedProcessingMode, {
      clipDurationMode: resolvedClipDurationMode,
      clipDurationSeconds: resolvedClipDurationSeconds,
      targetClipDuration: resolvedTargetClipDuration,
      minClipDuration: resolvedMinClipDuration,
      maxClipDuration: resolvedMaxClipDuration,
    });
    const requestedCaptions = captionsEnabled === true || hasExplicitCaptionStyle(resolvedCaptionStyle) || normalizeCaptionMode(captionMode) !== 'none';
    const effectiveCaptionMode = resolveCaptionMode(normalizedProcessingMode, requestedCaptions, captionMode, resolvedCaptionStyle);
    const effectiveCaptionsEnabled = effectiveCaptionMode !== 'none';
    const effectiveMetadataCleanup = metadataCleanup ?? (normalizedProcessingMode !== 'raw_review');

    const finalCount = normalizedProcessingMode === 'finalize_approved' ? 1 : (normalizedClipCountMode === 'auto' ? null : Math.min(parseInt(resolvedCount ?? selectedCount) || 5, 100));
    const jobId = createVideoSquadJob(req.user.id, {
      platform: resolvedPlatform, contentType, objective: recipeApplication?.objective || objective,
      count: finalCount,
      requestedClipCount: finalCount,
      clipCountMode: normalizedProcessingMode === 'finalize_approved' ? 'fixed' : normalizedClipCountMode,
      ...clipDurationOptions,
      processingMode: normalizedProcessingMode,
      sourceJobId,
      sourceFileName,
      finalizeKeepSingleOutput: Boolean(finalizeKeepSingleOutput),
      dynamicCutsMode,
      minScore: Number(minScore || process.env.VIDEO_DEFAULT_MIN_SCORE || 70),
      cutType, format, instruction,
      captionStyle: recipeApplication?.captionStyle || resolvedCaptionStyle,
      captionMode: effectiveCaptionMode,
      captionPosition: normalizeCaptionPosition(captionPosition),
      captionsEnabled: Boolean(effectiveCaptionsEnabled),
      captionMaxWordsPerBlock,
      captionMaxLines,
      captionMaxCharsPerLine,
      captionMinBlockDuration,
      captionMaxBlockDuration,
      dynamicCutsEnabled: Boolean(dynamicCutsEnabled ?? normalizedProcessingMode !== 'raw_review'),
      dynamicEditEnabled: dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
      pauseCutEnabled: pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
      editPace: recipeApplication?.editPace || resolvedEditPace || 'medium',
      editMode,
      videoContentType,
      destination,
      pauseCutMode,
      mistakeCutMode,
      ...stylePayload,
      editStyle: recipeApplication?.editStyleId || resolvedEditStyle,
      editStyleRecipeId: activeRecipe?.id || editStyleRecipeId || null,
      editStyleRecipeName: activeRecipe?.name || editStyleRecipeName || null,
      selectedPresetId: activeRecipe?.selectedPresetId || selectedPresetId || presetId || null,
      presetId: recipeApplication?.presetId || selectedPresetId || presetId || null,
      styleRules: activeRecipe?.styleRules || styleRules || null,
      metadataCleanup: Boolean(effectiveMetadataCleanup),
      metadataOptions,
      autoSendTelegram: shouldSendTelegram,
      telegramAutoSend: shouldSendTelegram,
      deleteAfterTelegram: deleteAfterTelegram !== undefined ? Boolean(deleteAfterTelegram) : undefined,
      telegramMode: normalizeTelegramMode(telegramMode),
      editPlanId: resolvedEditPlanId,
      editingPlanId: resolvedEditPlanId,
      editingPlanName: styleContext?.applied?.editingPlanName || null,
      referenceId: resolvedReferenceId,
      referenceVideoIds: resolvedReferenceVideoIds,
      useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
      useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
      supervisorEnabled: normalizeBoolean(supervisorEnabled, true),
      styleContext,
    });

    logger.info(`[VideoSquadRoute] created job=${jobId} userId=${req.user.id} platform=${platform} objective=${objective} mode=${normalizedProcessingMode}`);

    setImmediate(async () => {
      try {
        await runVideoSquad({
          jobId,
          inputPath: resolvedInput,
          userId: req.user.id,
          options: {
            platform: resolvedPlatform, contentType, objective: recipeApplication?.objective || objective,
            count: finalCount,
            requestedClipCount: finalCount,
            cutType, format,
            clipCountMode: normalizedProcessingMode === 'finalize_approved' ? 'fixed' : normalizedClipCountMode,
            ...clipDurationOptions,
            processingMode: normalizedProcessingMode,
            sourceJobId,
            sourceFileName,
            finalizeKeepSingleOutput: Boolean(finalizeKeepSingleOutput),
            dynamicCutsMode,
            minScore: Number(minScore || process.env.VIDEO_DEFAULT_MIN_SCORE || 70),
            instruction, captionStyle: recipeApplication?.captionStyle || resolvedCaptionStyle,
            captionMode: effectiveCaptionMode,
            captionPosition: normalizeCaptionPosition(captionPosition),
            captionsEnabled: Boolean(effectiveCaptionsEnabled),
            captionMaxWordsPerBlock,
            captionMaxLines,
            captionMaxCharsPerLine,
            captionMinBlockDuration,
            captionMaxBlockDuration,
            dynamicCutsEnabled: Boolean(dynamicCutsEnabled ?? normalizedProcessingMode !== 'raw_review'),
            dynamicEditEnabled: dynamicEditEnabled ?? recipeApplication?.dynamicEditEnabled,
            pauseCutEnabled: pauseCutEnabled ?? recipeApplication?.pauseCutEnabled,
            editPace: recipeApplication?.editPace || resolvedEditPace || 'medium',
            editMode,
            videoContentType,
            destination,
            pauseCutMode,
            mistakeCutMode,
            ...stylePayload,
            editStyle: recipeApplication?.editStyleId || resolvedEditStyle,
            editStyleRecipeId: activeRecipe?.id || editStyleRecipeId || null,
            editStyleRecipeName: activeRecipe?.name || editStyleRecipeName || null,
            selectedPresetId: activeRecipe?.selectedPresetId || selectedPresetId || presetId || null,
            presetId: recipeApplication?.presetId || selectedPresetId || presetId || null,
            styleRules: activeRecipe?.styleRules || styleRules || null,
            metadataCleanup: Boolean(effectiveMetadataCleanup),
            metadataOptions,
            autoSendTelegram: shouldSendTelegram,
            telegramAutoSend: shouldSendTelegram,
            deleteAfterTelegram: deleteAfterTelegram !== undefined ? Boolean(deleteAfterTelegram) : undefined,
            telegramMode: normalizeTelegramMode(telegramMode),
            editPlanId: resolvedEditPlanId,
            editingPlanId: resolvedEditPlanId,
            editingPlanName: styleContext?.applied?.editingPlanName || null,
            referenceId: resolvedReferenceId,
            referenceVideoIds: resolvedReferenceVideoIds,
            useReferenceStyle: normalizeBoolean(useReferenceStyle ?? supervisorEnabled),
            useFrameCutAnalysis: normalizeBoolean(useFrameCutAnalysis ?? supervisorEnabled),
            supervisorEnabled: normalizeBoolean(supervisorEnabled, true),
            styleContext,
          },
        });
      } catch (err) {
        logger.error(`[VideoSquadRoute] job=${jobId} error: ${err.message}`);
      }
    });

    res.json({ ok: true, jobId, status: 'queued' });
  } catch (err) {
    logger.error('[VideoSquadRoute] POST /squad/jobs: ' + err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /video/squad/export-valid
router.post('/squad/export-valid', requireAuth, async (req, res) => {
  try {
    const requestedJobId = req.body?.jobId ? path.basename(String(req.body.jobId)) : null;
    const candidates = await listCandidateMp4s(requestedJobId);
    const exportId = buildExportId(requestedJobId || '');
    const exportDir = path.join(VALID_EXPORTS_DIR, exportId);
    const files = [];
    const usedNames = new Set();

    await fs.mkdir(exportDir, { recursive: true });

    for (const candidate of candidates) {
      let validation;
      try {
        validation = await probeServedMp4(candidate.filePath);
      } catch (err) {
        logger.warn(`[VideoExportValid] skip invalid outputPath=${candidate.filePath} error=${err.message}`);
        continue;
      }

      let fileName = path.basename(candidate.filePath);
      if (usedNames.has(fileName)) {
        fileName = `${candidate.jobId.slice(0, 12)}-${fileName}`;
      }
      usedNames.add(fileName);

      const destPath = path.join(exportDir, fileName);
      await fs.copyFile(candidate.filePath, destPath);

      let copiedValidation;
      try {
        copiedValidation = await probeServedMp4(destPath);
      } catch (err) {
        await fs.rm(destPath, { force: true }).catch(() => {});
        logger.warn(`[VideoExportValid] copied file failed validation outputPath=${destPath} error=${err.message}`);
        continue;
      }

      logger.info(`[VideoExportValid] outputPath=${destPath} size=${copiedValidation.size} ffprobe=${JSON.stringify({ duration: copiedValidation.duration, size: copiedValidation.size })}`);

      files.push({
        fileName,
        size: copiedValidation.size,
        duration: Math.round(copiedValidation.duration),
        originalPath: candidate.filePath,
        url: `/outputs/valid-exports/${exportId}/${fileName}`,
      });
    }

    if (!files.length) {
      await fs.rm(exportDir, { recursive: true, force: true }).catch(() => {});
      return res.json({ success: false, error: 'Nenhum vídeo válido encontrado para exportar.' });
    }

    await createValidExportZip(exportDir, files);
    const zipPath = path.join(exportDir, 'clips-validos.zip');
    const zipStat = await fs.stat(zipPath);
    logger.info(`[VideoExportValid] zip outputPath=${zipPath} size=${zipStat.size}`);

    const manifest = {
      success: true,
      exportId,
      jobId: requestedJobId,
      count: files.length,
      createdAt: new Date().toISOString(),
      zipUrl: `/outputs/valid-exports/${exportId}/clips-validos.zip`,
      manifestUrl: `/outputs/valid-exports/${exportId}/manifest.json`,
      files,
    };
    await fs.writeFile(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    res.json({
      success: true,
      exportId,
      count: files.length,
      zipUrl: manifest.zipUrl,
      files: files.map(({ fileName, size, duration, url }) => ({ fileName, size, duration, url })),
      manifestUrl: manifest.manifestUrl,
    });
  } catch (err) {
    logger.error(`[VideoExportValid] failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /video/squad/send-telegram
router.post('/squad/send-telegram', requireAuth, async (req, res) => {
  const jobId = req.body?.jobId;
  const mode = normalizeTelegramMode(req.body?.mode);
  const requestedFile = req.body?.fileName ? path.basename(String(req.body.fileName)) : null;

  try {
    const { safeJob } = await assertVideoSquadJobAccess(jobId, req.user.id);
    let validFiles = await listValidJobMp4s(safeJob);
    if (requestedFile) {
      validFiles = validFiles.filter(file => file.fileName === requestedFile);
    }

    if (!validFiles.length) {
      let deletedAfterTelegram = false;
      if (requestedFile) {
        deletedAfterTelegram = await deleteInvalidSmallFile(path.join(VIDEO_OUTPUT, safeJob, requestedFile), safeJob);
      }
      return res.json({
        success: false,
        error: requestedFile ? 'Arquivo inválido ou menor que 100 KB' : 'Nenhum vídeo válido encontrado para enviar ao Telegram.',
        files: requestedFile ? [{
          fileName: requestedFile,
          telegramSent: false,
          telegramError: 'Arquivo inválido ou menor que 100 KB',
          deletedAfterTelegram,
        }] : [],
      });
    }

    const files = [];
    let sent = 0;
    let failed = 0;

    for (const file of validFiles) {
      logger.info(`VIDEO_TELEGRAM_SEND_START jobId=${safeJob} clipId=${file.fileName} file=${file.filePath}`);
      const result = await sendClipToTelegram({
        filePath: file.filePath,
        fileName: file.fileName,
        caption: file.fileName,
        mode,
      });

      if (result.telegramSkipped || result.skipped) {
        failed++;
        files.push({
          fileName: file.fileName,
          telegramSent: false,
          telegramSkipped: true,
          telegramReason: 'Telegram não configurado',
          telegramStatus: 'skipped_not_configured',
          telegramError: result.telegramError || result.message || 'Telegram não configurado',
          size: file.size,
        });
        continue;
      }

      if (result.ok) {
        sent++;
        logger.info(`VIDEO_TELEGRAM_SEND_SUCCESS jobId=${safeJob} clipId=${file.fileName}`);
        const deletedAfterTelegram = await deleteAfterTelegram({
          filePath: file.filePath,
          size: file.size,
          jobId: safeJob,
          kind: 'clip',
        });
        files.push({
          fileName: file.fileName,
          telegramSent: true,
          telegramStatus: 'sent',
          telegramError: null,
          telegramMode: result.mode || mode,
          size: file.size,
          deletedAfterTelegram,
        });
      } else {
        const errorMessage = result.telegramError || result.error || 'Erro ao enviar para Telegram';
        const publicBase = getPublicBaseUrl();
        if (publicBase) {
          const clipToken = jwt.sign(
            { uid: req.user.id, jobId: safeJob, file: file.fileName },
            process.env.JWT_SECRET || 'botsquad-secret',
            { expiresIn: '2h' },
          );
          const downloadUrl = `${publicBase}/outputs/videos/${safeJob}/${file.fileName}?token=${clipToken}`;
          try {
            await sendTelegramMessage(`Vídeo gerado ✅\n📥 Baixe aqui: ${downloadUrl}\n⚠️ Motivo do envio direto ter falhado: ${errorMessage}`);
            sent++;
            logger.info(`VIDEO_TELEGRAM_LINK_FALLBACK_SENT jobId=${safeJob} clipId=${file.fileName} url=${downloadUrl}`);
            files.push({
              fileName: file.fileName,
              telegramSent: false,
              telegramStatus: 'sent_link_fallback',
              telegramError: errorMessage,
              telegramMode: 'message',
              telegramPublicUrl: downloadUrl,
              size: file.size,
              deletedAfterTelegram: false,
            });
          } catch (fallbackErr) {
            failed++;
            const telegramStatus = result.telegramStatus || 'failed_api_error';
            logger.warn(`VIDEO_TELEGRAM_SEND_FAILED jobId=${safeJob} clipId=${file.fileName} reason=${telegramStatus} error=${errorMessage}; fallback=${fallbackErr.message}`);
            files.push({
              fileName: file.fileName,
              telegramSent: false,
              telegramStatus,
              telegramError: `${errorMessage}; fallback: ${fallbackErr.message}`,
              telegramPublicUrl: null,
              size: file.size,
              deletedAfterTelegram: false,
            });
          }
        } else {
          // BACKEND_PUBLIC_URL não configurado — não gerar link localhost
          failed++;
          logger.warn(`VIDEO_TELEGRAM_SEND_FAILED jobId=${safeJob} clipId=${file.fileName} reason=failed_no_public_url error=${errorMessage}`);
          files.push({
            fileName: file.fileName,
            telegramSent: false,
            telegramStatus: 'failed_no_public_url',
            telegramError: `${errorMessage} — BACKEND_PUBLIC_URL não configurado para gerar link público`,
            telegramPublicUrl: null,
            size: file.size,
            deletedAfterTelegram: false,
          });
        }
      }
      if ((sent + failed) % 5 === 0 && (sent + failed) < validFiles.length) {
        await sleep(1200);
      }
    }

    res.json({
      success: sent > 0,
      jobId: safeJob,
      sent,
      failed,
      mode,
      files,
    });
  } catch (err) {
    logger.error(`[VideoTelegram] send failed job=${jobId || ''} error=${err.message}`);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /video/squad/send-telegram-zip
router.post('/squad/send-telegram-zip', requireAuth, async (req, res) => {
  const jobId = req.body?.jobId;

  try {
    const { safeJob } = await assertVideoSquadJobAccess(jobId, req.user.id);
    const validFiles = await listValidJobMp4s(safeJob);

    if (!validFiles.length) {
      return res.json({
        success: false,
        error: 'Nenhum vídeo válido encontrado para enviar ao Telegram.',
      });
    }

    const exportId = buildExportId(`${safeJob}-telegram`);
    const exportDir = path.join(VALID_EXPORTS_DIR, exportId);
    await fs.mkdir(exportDir, { recursive: true });

    const zipFiles = [];
    for (const file of validFiles) {
      const destPath = path.join(exportDir, file.fileName);
      await fs.copyFile(file.filePath, destPath);
      const copiedValidation = await probeServedMp4(destPath);
      zipFiles.push({ fileName: file.fileName, size: copiedValidation.size });
    }

    const zipPath = await createValidExportZip(exportDir, zipFiles);
    const zipStat = await fs.stat(zipPath);
    const result = await sendTelegramDocument({
      filePath: zipPath,
      fileName: 'clips-validos.zip',
      caption: `Clips válidos do job ${safeJob}`,
    });

    if (result.skipped) {
      return res.json({
        success: false,
        zipSent: false,
        telegramSkipped: true,
        telegramReason: 'Telegram não configurado',
        zipFile: 'clips-validos.zip',
      });
    }

    let deletedAfterTelegram = false;
    if (result.ok) {
      deletedAfterTelegram = await deleteAfterTelegram({
        filePath: zipPath,
        size: zipStat.size,
        jobId: safeJob,
        kind: 'zip',
      });
      if (deletedAfterTelegram) {
        await fs.rm(exportDir, { recursive: true, force: true }).catch((err) => {
          logger.warn(`[VideoTelegram] temp export cleanup failed job=${safeJob} dir=${exportDir} error=${err.message}`);
        });
      }
    }

    res.json({
      success: Boolean(result.ok),
      zipSent: Boolean(result.ok),
      zipFile: 'clips-validos.zip',
      size: zipStat.size,
      files: zipFiles.length,
      deletedAfterTelegram,
      error: result.ok ? undefined : 'Falha ao enviar ZIP para Telegram',
    });
  } catch (err) {
    logger.error(`[VideoTelegram] zip send failed job=${jobId || ''} error=${err.message}`);
    res.status(err.status || 500).json({ success: false, zipSent: false, error: err.message });
  }
});

// GET /video/squad/jobs/:jobId
router.get('/squad/jobs/:jobId', requireAuth, async (req, res) => {
  const job = getVideoSquadJob(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job não encontrado' });
  // Security: only the owner can see their job
  if (job.userId && job.userId !== req.user.id) {
    return res.status(403).json({ ok: false, error: 'Acesso negado' });
  }
  if (job.status === 'done') {
    const validOutputs = [];
    for (const output of job.outputs || []) {
      const fileName = path.basename(output.fileName || '');
      if (!fileName || !/\.mp4$/i.test(fileName)) continue;
      const outputPath = path.resolve(path.join(VIDEO_OUTPUT, job.jobId, fileName));
      try {
        const validation = await probeServedMp4(outputPath);
        logger.info(`[VideoSquadRoute] outputPath=${outputPath} size=${validation.size} ffprobe=${JSON.stringify({ duration: validation.duration, size: validation.size })}`);
        const duration = Number(output.durationSeconds ?? output.duration ?? validation.duration);
        validOutputs.push({
          ...output,
          id: output.id || String(output.index || output.fileName),
          fileSize: validation.size,
          duration: Number.isFinite(duration) ? Math.round(duration) : null,
          durationSeconds: Number.isFinite(duration) ? Math.round(duration) : null,
          finalDuration: Number.isFinite(duration) ? Math.round(duration) : null,
          originalDuration: Number.isFinite(Number(output.originalDuration)) ? Number(output.originalDuration) : (Number.isFinite(Number(job.probe?.duration)) ? Number(job.probe.duration) : null),
          metadataRemoved: Boolean(output.metadataRemoved ?? output.metadata?.metadataRemoved ?? output.metadata?.sanitized),
          telegramStatus: output.telegramStatus || (output.telegramSent ? 'sent' : output.telegramSkipped ? 'skipped_not_configured' : output.telegramError ? 'failed_api_error' : 'pending'),
          telegramError: output.telegramError || null,
          valid: true,
        });
      } catch (err) {
        logger.warn(`[VideoSquadRoute] dropping invalid clip job=${job.jobId} file=${fileName}: ${err.message}`);
        await deleteInvalidOutput(outputPath, err.message);
      }
    }

    if (!validOutputs.length) {
      return res.json({
        ...job,
        status: 'error',
        success: false,
        progress: 0,
        message: 'Nenhum corte válido foi gerado.',
        error: 'Nenhum corte válido foi gerado.',
        outputs: [],
        zipUrl: null,
      });
    }

    return res.json({ ...job, success: true, outputs: validOutputs });
  }

  res.json(job);
});

// ── Import Leve (sem SmartCut) ──────────────────────────────

router.post('/import-light', requireAuth, async (req, res) => {
  try {
    const { url, sourceUrl, driveFileId, purpose = 'source_or_reference' } = req.body || {};
    const effectiveUrl = String(sourceUrl || url || '').trim();

    if (!effectiveUrl && !driveFileId) {
      return res.status(400).json({ ok: false, error: 'Informe url ou driveFileId.' });
    }

    const sourceType = detectVideoSource(effectiveUrl || '');

    if (sourceType === 'youtube') {
      return res.status(422).json({
        ok: false,
        sourceType: 'youtube',
        reason: 'YouTube direto pode exigir autorização/cookies e não será usado como bypass.',
        fallback: 'Envie o arquivo por upload ou Google Drive autorizado.',
      });
    }

    const videoId = uuidv4();
    const resolved = await resolveVideoSource({
      sourceType,
      filePath: null,
      sourceUrl: effectiveUrl,
      driveFileId,
      userId: req.user.id,
      confirmedAuthorized: false,
    });

    if (!resolved.ok) {
      return res.status(422).json({ ok: false, error: resolved.error || resolved.message, code: resolved.code });
    }

    const probe = await validateMp4OrThrow(resolved.filePath);

    await registerUploadedVideo({
      id: videoId,
      userId: req.user.id,
      filePath: resolved.filePath,
      sourceType,
      sourceUrl: effectiveUrl,
      purpose,
    }).catch(() => {});

    return res.json({
      ok: true,
      videoId,
      videoPath: resolved.filePath,
      sourceType: resolved.sourceType || sourceType,
      probe: {
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        hasAudio: Boolean(probe.ffprobe?.streams?.some(s => s.codec_type === 'audio')),
        size: probe.size,
      },
    });
  } catch (err) {
    logger.error('[ImportLight] ' + err.message);
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ── Motor Pro — Analisar Referência e Gerar Style Profile ───

const REFERENCES_BASE = path.resolve(process.cwd(), 'storage/outputs/videos/references');

function deriveStyleProfile(analysis, category = 'general') {
  const scenes = analysis?.analysis?.scenes || [];
  const peaks = analysis?.analysis?.peaks || [];
  const speechSegs = analysis?.analysis?.speechSegments || [];
  const duration = analysis?.probe?.duration || 1;

  const avgShot = scenes.length > 1
    ? scenes.slice(0, -1).reduce((s, sc, i) => s + (scenes[i + 1].start - sc.start), 0) / (scenes.length - 1)
    : duration;

  const cutPace = avgShot < 2 ? 'fast' : avgShot < 5 ? 'medium' : 'slow';
  const motionScores = (analysis?.analysis?.motionTimeline || []).map(m => m.score || 0);
  const avgMotion = motionScores.length ? motionScores.reduce((a, b) => a + b, 0) / motionScores.length : 0;
  const motionIntensity = avgMotion > 60 ? 'high' : avgMotion > 30 ? 'medium' : 'low';
  const hasSpeech = speechSegs.length > 0;
  const presetMap = {
    sports: 'sports_highlight_pro',
    podcast: 'podcast_clean_pro',
    worship: 'worship_music_pro',
    documentary: 'documentary_standard',
    viral: 'viral_shorts_aggressive',
    general: 'viral_shorts_aggressive',
  };
  const cat = String(category).toLowerCase();

  return {
    cutPace,
    avgShotDuration: Number(avgShot.toFixed(2)),
    captionStyle: hasSpeech ? (cat === 'sports' ? 'sports_impact' : 'phrase_dynamic') : 'none',
    zoomUsage: motionIntensity === 'high' ? 'high' : motionIntensity === 'medium' ? 'medium' : 'low',
    transitionStyle: cutPace === 'fast' ? 'hard_cut' : 'smooth',
    motionIntensity,
    colorLook: cat === 'sports' ? 'sports_hype_contrast' : 'cinematic_warm',
    audioStyle: peaks.length > 5 ? 'sports_impact' : hasSpeech ? 'podcast_clean' : 'music_sync',
    usesFreezeFrame: cat === 'sports',
    usesReplay: cat === 'sports',
    usesPunchZoom: cutPace === 'fast',
    recommendedPreset: presetMap[cat] || presetMap.general,
  };
}

router.post('/pro/analyze-reference', requireAuth, async (req, res) => {
  try {
    const { videoPath, videoId, referenceDbId, referenceName = 'Sem nome', category = 'general', saveAsPreset = false } = req.body || {};

    // Se vier referenceDbId (ID da tabela de referências do DB), resolver o path real
    let resolvedVideoPath = videoPath;
    let resolvedVideoId = videoId;
    let resolvedName = referenceName;
    if (referenceDbId) {
      const dbRef = await getReferenceById(referenceDbId, { userId: req.user.id });
      if (!dbRef) return res.status(404).json({ ok: false, error: `Referência ${referenceDbId} não encontrada.` });
      resolvedVideoPath = dbRef.originalVideoPath || dbRef.filePath || resolvedVideoPath;
      resolvedName = referenceName !== 'Sem nome' ? referenceName : (dbRef.name || resolvedName);
    }

    const { sourceVideo } = await resolveProfessionalSource(
      { sourceVideo: resolvedVideoPath, videoId: resolvedVideoId },
      req
    );

    const referenceId = uuidv4();
    const preset = getProEditingPreset('viral_shorts_aggressive');
    const analysis = await runProAnalysis({ sourceVideo, targetDuration: 30, preset });
    const styleProfile = deriveStyleProfile(analysis, category);

    const refDir = path.join(REFERENCES_BASE, referenceId);
    await fs.mkdir(refDir, { recursive: true });

    const profileData = {
      referenceId,
      name: resolvedName,
      category,
      videoPath: sourceVideo,
      recommendedPreset: styleProfile.recommendedPreset,
      styleProfile: {
        cutPace: styleProfile.cutPace,
        avgShotDuration: styleProfile.avgShotDuration,
        captionStyle: styleProfile.captionStyle,
        zoomUsage: styleProfile.zoomUsage,
        transitionStyle: styleProfile.transitionStyle,
        motionIntensity: styleProfile.motionIntensity,
        colorLook: styleProfile.colorLook,
        audioStyle: styleProfile.audioStyle,
        usesFreezeFrame: styleProfile.usesFreezeFrame,
        usesReplay: styleProfile.usesReplay,
        usesPunchZoom: styleProfile.usesPunchZoom,
      },
      editRules: {
        targetCutPace: styleProfile.cutPace,
        hookDuration: styleProfile.avgShotDuration < 3 ? 2 : 3,
        captionPosition: 'safe_bottom',
        zoomFrequency: styleProfile.zoomUsage === 'high' ? 'medium_high' : 'low',
        useReplayOnPeaks: category === 'sports',
      },
      analysisJobId: analysis.jobId,
      createdAt: new Date().toISOString(),
    };

    const profilePath = path.join(refDir, 'style-profile.json');
    await fs.writeFile(profilePath, JSON.stringify(profileData, null, 2), 'utf-8');

    res.json({
      ok: true,
      referenceId,
      referenceName: resolvedName,
      category,
      recommendedPreset: styleProfile.recommendedPreset,
      styleProfile: profileData.styleProfile,
      editRules: profileData.editRules,
      styleProfilePath: profilePath,
      analysisJobId: analysis.jobId,
    });
  } catch (err) {
    logger.error('[ProAnalyzeReference] ' + err.message);
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ── Motor Pro — Render com Referência ───────────────────────

router.post('/pro/render-with-reference', requireAuth, async (req, res) => {
  try {
    const {
      sourceVideo: rawSourceVideo,
      videoId,
      referenceId,
      clipCount = 1,
      targetDuration = 10,
      format = '9:16',
    } = req.body || {};

    if (!referenceId) {
      return res.status(400).json({ ok: false, error: 'referenceId obrigatório.' });
    }

    const profilePath = path.join(REFERENCES_BASE, referenceId, 'style-profile.json');
    const profileRaw = await fs.readFile(profilePath, 'utf-8').catch(() => null);
    if (!profileRaw) {
      return res.status(404).json({ ok: false, error: `style-profile.json não encontrado para referenceId=${referenceId}. Execute /pro/analyze-reference primeiro.` });
    }
    const profile = JSON.parse(profileRaw);

    const { sourceVideo } = await resolveProfessionalSource(
      { sourceVideo: rawSourceVideo, videoId: videoId || null },
      req
    );

    const presetId = profile.recommendedPreset || 'viral_shorts_aggressive';
    const preset = getProEditingPreset(presetId);

    const safeTargetDurRef = safeNum(targetDuration, 10, 5, 600);
    const safeClipCountRef = safeInt(clipCount, 1, 1, 20);
    const analysis = await runProAnalysis({ sourceVideo, targetDuration: safeTargetDurRef, preset });

    const { getVideoProfessionalToolchainStatus: getToolchainStatus } = await import('../services/video/toolchain/videoToolchainService.js');
    const toolchain = await getToolchainStatus();

    const { scoreHighlights: scoreHL } = await import('../services/video/pipeline/highlightScorerService.js');
    const highlightsRaw = scoreHL(analysis, {
      targetDuration: safeTargetDurRef,
      clipCount: safeClipCountRef,
      durationMode: 'normal',
      preset,
      toolchain,
      objective: req.body?.objective || preset?.objective || null,
      hookFirstEnabled: req.body?.hookFirstEnabled ?? true,
      openingStrengthPriority: req.body?.openingStrengthPriority || 'high',
      avoidDeadAirStart: req.body?.avoidDeadAirStart ?? true,
      preferSpeechStart: req.body?.preferSpeechStart ?? true,
      openingPreRollMs: req.body?.openingPreRollMs ?? 300,
    });
    const clips = Array.isArray(highlightsRaw) ? highlightsRaw : (highlightsRaw?.clips || []);

    const jobId = `ref_${referenceId.slice(0, 8)}_${uuidv4().slice(0, 8)}`;
    const editPlanResult = await buildProfessionalEditPlan({
      jobId,
      sourceVideo,
      highlights: clips,
      presetId,
      format,
      hookFirstEnabled: req.body?.hookFirstEnabled ?? true,
      openingStrengthPriority: req.body?.openingStrengthPriority || 'high',
      avoidDeadAirStart: req.body?.avoidDeadAirStart ?? true,
      preferSpeechStart: req.body?.preferSpeechStart ?? true,
      openingPreRollMs: req.body?.openingPreRollMs ?? 300,
    });

    const renderResult = await renderProfessionalEditPlan({
      jobId,
      sourceVideo,
      plan: editPlanResult.plan,
      format,
    });

    const editPlanPath = editPlanResult.jsonPath || path.join(process.cwd(), 'storage/outputs/videos/edit-plans', `${jobId}.json`);

    res.json({
      ok: true,
      referenceId,
      jobId,
      usedReference: true,
      styleProfilePath: profilePath,
      recommendedPreset: presetId,
      editPlanPath,
      outputs: renderResult.outputs || [],
      primaryOutput: renderResult.primaryOutput || null,
    });
  } catch (err) {
    logger.error('[ProRenderWithReference] ' + err.message);
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ── Full Studio ────────────────────────────────────────────

router.get('/full-studio/preflight', requireAuth, async (req, res) => {
  try {
    const presetId = String(req.query.presetId || req.query.preset || '').trim() || null;
    const { runFullStudioPreflight } = await import('../services/video/fullStudio/fullStudioPreflight.js');
    const result = await runFullStudioPreflight({ presetId });
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('[FullStudioPreflight] ' + err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/full-studio/render', requireAuth, async (req, res) => {
  try {
    const {
      sourceVideo: rawSourceVideo,
      videoId,
      presetId = 'podcast_studio_full_studio',
      format = '9:16',
      clipCount = 1,
      targetDuration = 30,
      hookFirstEnabled = true,
      openingStrengthPriority = 'high',
      avoidDeadAirStart = true,
      preferSpeechStart = true,
      openingPreRollMs = 300,
      metadataEnabled,
      stripSourceMetadata,
      watermarkEnabled,
      watermarkText,
      authorName,
      editedBy,
    } = req.body || {};

    const { sourceVideo } = await resolveProfessionalSource(
      { sourceVideo: rawSourceVideo, videoId: videoId || null },
      req
    );

    if (!sourceVideo) {
      return res.status(400).json({ ok: false, error: 'Informe sourceVideo ou videoId para renderização Full Studio.' });
    }

    const { runFullStudioEdit } = await import('../services/video/fullStudio/fullStudioEngine.js');
    const result = await runFullStudioEdit({
      sourceVideo,
      presetId,
      format,
      clipCount: safeInt(clipCount, 1, 1, 20),
      targetDuration: safeNum(targetDuration, 30, 5, 600),
      hookFirstEnabled,
      openingStrengthPriority,
      avoidDeadAirStart,
      preferSpeechStart,
      openingPreRollMs,
      userId: req.user?.userId || req.user?.id,
      metadataEnabled,
      stripSourceMetadata,
      watermarkEnabled,
      watermarkText,
      authorName,
      editedBy,
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('[FullStudioRender] ' + err.message);
    const isBlocked = /BLOQUEADO|BLOCKED|missing.*required/i.test(err.message);
    res.status(isBlocked ? 422 : 500).json({ ok: false, error: err.message });
  }
});

// ── Health ─────────────────────────────────────────────────

export default router;

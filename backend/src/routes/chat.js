// routes/chat.js — FIX: file type validation, temp cleanup, rate limit per user

import { Router }        from 'express';
import multer            from 'multer';
import rateLimit         from 'express-rate-limit';
import { promises as fs } from 'fs';
import { requireAuth }   from '../middleware/auth.js';
import { orchestrate }   from '../agents/orchestrator.js';
import { query }         from '../db/index.js';
import { config }        from '../config/index.js';
import { logger }        from '../lib/logger.js';
import {
  extractCarouselTopic,
  generateCarouselPromptPack,
  isCarouselRequest,
  wantsHtmlSvgFallback,
} from '../services/carousel-service.js';

const router = Router();

// ── FIX: Allowed file types for chat uploads ──────────────────────────────
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/gif','image/webp',
  'application/pdf','text/plain','text/csv','text/markdown',
  'audio/wav','audio/wave','audio/x-wav','audio/mpeg','audio/mp3','audio/flac',
  'audio/ogg','audio/aac','audio/mp4','audio/x-m4a',
  'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/webm',
]);
const ALLOWED_EXT = /\.(jpg|jpeg|png|gif|webp|pdf|txt|csv|md|wav|mp3|flac|ogg|aac|m4a|mp4|mov|avi|mkv|webm|m4v|3gp)$/i;

const upload = multer({
  dest: config.storage.temp,
  limits: { fileSize: 200 * 1024 * 1024 }, // audio/video files can be large
  fileFilter: (req, file, cb) => {
    const extOk  = ALLOWED_EXT.test(file.originalname ?? '');
    const mimeOk = ALLOWED_MIME.has(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(Object.assign(new Error(`Tipo de arquivo não permitido: ${file.originalname}`), { status: 400 }));
  },
});

// ── FIX: Per-user rate limit on chat send (prevents API cost abuse) ───────
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: req => req.user?.id ?? req.ip,
  message: { error: 'Muitas mensagens. Aguarde um momento.' },
  skip: req => !req.user, // only applies to authenticated users
});

// Helper to clean up temp files after processing
async function cleanupFiles(files = []) {
  await Promise.allSettled(files.map(f => fs.unlink(f.path).catch(() => {})));
}

// ── GET /chat/conversations ────────────────────────────────────────────────
router.get('/conversations', requireAuth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  ?? '100'), 200);
  const offset = parseInt(req.query.offset ?? '0');
  const { rows } = await query(
    'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
    [req.user.id, limit, offset],
  );
  res.json(rows);
});

// ── POST /chat/conversations ───────────────────────────────────────────────
router.post('/conversations', requireAuth, async (req, res) => {
  const { title } = req.body;
  const { rows } = await query(
    'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
    [req.user.id, (title || 'New conversation').slice(0, 200)],
  );
  res.status(201).json(rows[0]);
});

// ── PATCH /chat/conversations/:id ──────────────────────────────────────────
router.patch('/conversations/:id', requireAuth, async (req, res) => {
  const { title } = req.body;
  await query(
    'UPDATE conversations SET title = $1 WHERE id = $2 AND user_id = $3',
    [(title || '').slice(0, 200), req.params.id, req.user.id],
  );
  res.json({ ok: true });
});

// ── DELETE /chat/conversations/:id ─────────────────────────────────────────
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  await query(
    'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id],
  );
  res.status(204).end();
});

// ── GET /chat/conversations/:id/messages — with cursor pagination ──────────
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  const { rows: conv } = await query(
    'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id],
  );
  if (!conv.length) return res.status(404).json({ error: 'Conversation not found' });

  const limit  = Math.min(parseInt(req.query.limit ?? '50'), 100);
  const before = req.query.before; // cursor: ISO timestamp

  let rows;
  if (before) {
    ({ rows } = await query(
      'SELECT id, role, content, metadata, created_at FROM messages WHERE conversation_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3',
      [req.params.id, before, limit],
    ));
    rows = rows.reverse();
  } else {
    ({ rows } = await query(
      'SELECT id, role, content, metadata, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2',
      [req.params.id, limit],
    ));
  }
  res.json(rows);
});

// ── POST /chat/conversations/:id/messages ─────────────────────────────────
router.post(
  '/conversations/:id/messages',
  requireAuth,
  chatLimiter,
  upload.array('files', 5),
  async (req, res) => {
    const { id: conversationId } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      await cleanupFiles(req.files);
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify ownership
    const { rows: conv } = await query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, req.user.id],
    );
    if (!conv.length) {
      await cleanupFiles(req.files);
      return res.status(404).json({ error: 'Conversation not found' });
    }

    try {
      // Save user message
      await query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, 'user', message],
      );

      // Load recent context (last 20 messages)
      const { rows: history } = await query(
        'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20',
        [conversationId],
      );
      const context = history.reverse().slice(0, -1);

      // Global carousel rule: prompt_pack_first unless the user explicitly asks for direct render.
      let result;
      const orchestrateStart = Date.now();
      try {
        if (isCarouselRequest(message) && !wantsHtmlSvgFallback(message)) {
          const topic = extractCarouselTopic(message);
          const pack = await generateCarouselPromptPack({ userId: req.user.id, topic });
          result = {
            ...pack,
            agent: 'visual',
            success: true,
            content: pack.message,
            carouselMode: 'prompt_pack_first',
          };
          logger.info(`[AGENT] carousel prompt_pack_first plan=${pack.planId} user=${req.user.id}`);
        } else {
          logger.info(`[AGENT] start user=${req.user.id} msg="${message.slice(0, 60)}"`);
          result = await orchestrate({
            userId:  req.user.id,
            message,
            context,
            files:   req.files ?? [],
          });
          logger.info(`[AGENT] done agent=${result?.agent || 'unknown'} ms=${Date.now() - orchestrateStart} user=${req.user.id}`);
        }
      } catch (err) {
        logger.error(`[AGENT] error ms=${Date.now() - orchestrateStart} user=${req.user.id} err=${err.message}`);
        if (/^\[agent:visual\]/i.test(message)) {
          result = {
            content: 'Visual agent failed to generate image',
            agent: 'visual',
            type: 'visual',
            success: false,
            files: [],
            previewUrl: null,
            downloadUrl: null,
          };
        } else {
          const userMsg = err.message?.includes('Chave de API') || err.message?.includes('API key') || err.message?.includes('No API key')
            ? `⚠️ ${err.message}`
            : err.message?.includes('Daily token')
              ? `⚠️ ${err.message}`
              : `❌ Erro: ${err.message || 'Erro interno. Tente novamente.'}`;
          result = { content: userMsg, agent: 'error' };
        }
      }

      if ((result.agent === 'visual' || result.type === 'visual' || /^\[agent:visual\]/i.test(message))
        && !['visual_prompts', 'carousel_prompt_pack'].includes(result.type)
        && (!result.previewUrl || !Array.isArray(result.files) || result.files.length === 0)) {
        result = {
          content: 'Visual agent failed to generate image',
          agent: 'visual',
          type: 'visual',
          success: false,
          files: [],
          previewUrl: null,
          downloadUrl: null,
        };
      }

      // Auto-title on first exchange
      const { rows: msgCount } = await query(
        'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
        [conversationId],
      );
      if (parseInt(msgCount[0].count) <= 2) {
        await query(
          'UPDATE conversations SET title = $1 WHERE id = $2',
          [message.slice(0, 60).trim(), conversationId],
        );
      }

      // Save assistant response
      const metadata = {
        agent: result.agent,
        ...(result.metadata || {}),
        ...(result.imageUrl ? { imageUrl: result.imageUrl } : {}),
        ...(result.previewUrl ? { previewUrl: result.previewUrl } : {}),
        ...(result.downloadUrl ? { downloadUrl: result.downloadUrl } : {}),
        ...(result.zipUrl ? { zipUrl: result.zipUrl } : {}),
        ...(result.files ? { files: result.files } : {}),
        ...(result.prompts ? { prompts: result.prompts } : {}),
        ...(result.planId ? { planId: result.planId } : {}),
        ...(result.status ? { status: result.status } : {}),
        ...(result.slides ? { slides: result.slides } : {}),
        ...(result.nextStep ? { nextStep: result.nextStep } : {}),
        ...(result.carouselMode ? { carouselMode: result.carouselMode } : {}),
        ...(result.type ? { type: result.type } : {}),
        ...(typeof result.success === 'boolean' ? { success: result.success } : {}),
      };

      const { rows: saved } = await query(
        'INSERT INTO messages (conversation_id, role, content, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
        [conversationId, 'assistant', result.content, JSON.stringify(metadata)],
      );

      await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

      res.json({
        ...saved[0],
        ...(result.previewUrl ? { previewUrl: result.previewUrl } : {}),
        ...(result.downloadUrl ? { downloadUrl: result.downloadUrl } : {}),
        ...(result.zipUrl ? { zipUrl: result.zipUrl } : {}),
        ...(result.files ? { files: result.files } : {}),
        ...(result.planId ? { planId: result.planId } : {}),
        ...(result.status ? { status: result.status } : {}),
        ...(result.slides ? { slides: result.slides } : {}),
        ...(result.nextStep ? { nextStep: result.nextStep } : {}),
        ...(result.carouselMode ? { carouselMode: result.carouselMode } : {}),
        ...(result.type ? { type: result.type } : {}),
        ...(typeof result.success === 'boolean' ? { success: result.success } : {}),
        ...(result.previewUrl ? { message: result.content } : {}),
      });
    } finally {
      // FIX: Always clean up temp files
      await cleanupFiles(req.files);
    }
  },
);

export default router;

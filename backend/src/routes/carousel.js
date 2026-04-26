import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config/index.js';
import {
  CAROUSEL_STATUS,
  carouselUploadFields,
  finalizeCarouselPlan,
  generateCarouselPromptPack,
  readCarouselPlan,
  renderCarouselHtmlSvgFallback,
  saveCarouselImages,
  toPublicPromptPack,
} from '../services/carousel-service.js';

const router = Router();
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const ALLOWED_IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

const upload = multer({
  dest: config.storage.temp,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extOk = ALLOWED_IMAGE_EXT.test(file.originalname ?? '');
    const mimeOk = ALLOWED_IMAGE_MIME.has(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(Object.assign(new Error(`Formato inválido: ${file.originalname}. Use png, jpg, jpeg ou webp.`), { status: 400 }));
  },
});

router.post('/plan', requireAuth, async (req, res) => {
  const { topic, niche = '', slides = 6, style = 'premium dark neon' } = req.body || {};
  if (!topic?.trim()) return res.status(400).json({ error: 'topic obrigatório.' });

  const pack = await generateCarouselPromptPack({
    userId: req.user.id,
    topic,
    niche,
    slides,
    style,
  });

  res.status(201).json(pack);
});

router.post('/:planId/images', requireAuth, upload.fields(carouselUploadFields()), async (req, res) => {
  const files = Object.values(req.files || {}).flat();
  try {
    const plan = await readCarouselPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });

    const nextPlan = await saveCarouselImages({
      plan: { ...plan, status: CAROUSEL_STATUS.WAITING_IMAGES },
      filesByField: req.files || {},
    });

    res.json({
      ok: true,
      type: 'carousel_images_received',
      status: nextPlan.status,
      planId: nextPlan.planId,
      message: 'Imagens recebidas. Você já pode finalizar o carrossel.',
      uploadedImages: nextPlan.uploadedImages.map(({ index, filename }) => ({ index, filename })),
      nextStep: 'Clique em Finalizar carrossel.',
    });
  } finally {
    await cleanupFiles(files);
  }
});

router.post('/:planId/finalize', requireAuth, async (req, res) => {
  const plan = await readCarouselPlan(req.params.planId, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });
  if (plan.status !== CAROUSEL_STATUS.IMAGES_RECEIVED && plan.status !== CAROUSEL_STATUS.RENDERED) {
    return res.status(409).json({ error: 'Envie as 6 imagens antes de finalizar o carrossel.' });
  }

  const rendered = await finalizeCarouselPlan(plan);
  res.json({
    ok: rendered.success,
    type: 'carousel_rendered',
    status: CAROUSEL_STATUS.RENDERED,
    planId: plan.planId,
    message: 'Carrossel finalizado com as 6 imagens enviadas.',
    files: rendered.files,
    previewUrl: rendered.previewUrl,
    downloadUrl: rendered.downloadUrl,
    zipUrl: rendered.zipUrl,
  });
});

router.post('/render', requireAuth, async (req, res) => {
  const { planId, manualFallback = false } = req.body || {};
  if (!manualFallback) {
    return res.status(409).json({ error: 'Renderização HTML/SVG só é permitida como fallback manual explícito.' });
  }

  const plan = await readCarouselPlan(planId, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });

  const rendered = await renderCarouselHtmlSvgFallback(plan);
  res.json({
    ok: rendered.success,
    type: 'carousel_rendered',
    status: plan.status,
    planId,
    message: 'Carrossel renderizado com HTML/SVG como fallback manual.',
    files: rendered.files,
    previewUrl: rendered.previewUrl,
    downloadUrl: rendered.downloadUrl,
    zipUrl: rendered.zipUrl,
  });
});

router.get('/:planId', requireAuth, async (req, res) => {
  const plan = await readCarouselPlan(req.params.planId, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });
  res.json(toPublicPromptPack(plan));
});

async function cleanupFiles(files = []) {
  await Promise.allSettled(files.map(file => fs.unlink(file.path).catch(() => {})));
}

export default router;

import { Router } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { generateCarouselImagePrompts, renderCarouselPlanPng } from '../renderers/visual-renderer.js';

const router = Router();
const PLAN_DIR = path.join(config.storage.jobs || path.join(path.dirname(config.storage.upload), 'jobs'), 'carousel');

router.post('/plan', requireAuth, async (req, res) => {
  const { topic, niche = '', slides = 6, style = 'premium dark neon', visualMode = 'html_svg_only' } = req.body || {};
  if (!topic?.trim()) return res.status(400).json({ error: 'topic obrigatório.' });

  const generated = generateCarouselImagePrompts({
    message: `carrossel sobre ${topic} ${niche} ${style} ${slides} slides`,
  });
  if (!generated.success) return res.status(400).json({ error: generated.message });

  const planId = uuidv4();
  const responseSlides = generated.prompts.slice(0, Number(slides) || 6).map(item => ({
    index: item.slide,
    headline: item.title,
    body: item.text,
    visualPrompt: item.image_prompt,
    negative: 'cartoon, low quality, blurry, extra fingers, distorted guitar, unreadable text, watermark',
    htmlFallback: item.visual_direction,
    aspectRatio: item.aspect_ratio,
    style: item.visual_style,
  }));

  await fs.mkdir(PLAN_DIR, { recursive: true });
  await fs.writeFile(path.join(PLAN_DIR, `${planId}.json`), JSON.stringify({
    planId,
    userId: req.user.id,
    topic,
    niche,
    style,
    visualMode,
    slides: responseSlides,
    internalPlan: generated.plan,
    createdAt: new Date().toISOString(),
  }, null, 2));

  res.status(201).json({ ok: true, planId, visualMode, slides: responseSlides });
});

router.post('/render', requireAuth, async (req, res) => {
  const { planId, slides = [], visualMode = 'html_svg_only' } = req.body || {};
  const stored = planId
    ? await fs.readFile(path.join(PLAN_DIR, `${planId}.json`), 'utf8').then(JSON.parse).catch(() => null)
    : null;
  if (planId && (!stored || stored.userId !== req.user.id)) return res.status(404).json({ error: 'Plano não encontrado.' });

  const editedSlides = slides.length ? slides : stored?.slides;
  if (!editedSlides?.length) return res.status(400).json({ error: 'slides obrigatórios.' });

  const internalPlan = stored?.internalPlan || {};
  const plan = {
    tema: stored?.topic || 'Carrossel',
    publico: internalPlan.publico || 'audiencia do carrossel',
    promessa: internalPlan.promessa || 'conteudo claro em sequencia',
    sequenciaNarrativa: editedSlides.map(s => `slide ${s.index}`),
    ctaFinal: editedSlides[editedSlides.length - 1]?.body || '',
    visualStyle: internalPlan.visualStyle || {
      palette: { main: '#c6f135', soft: 'rgba(198,241,53,.22)', deep: 'rgba(42,215,255,.16)' },
      mood: 'premium dark neon editorial',
    },
    slides: editedSlides.map((s, index) => ({
      role: `slide ${index + 1}`,
      title: s.headline,
      text: s.body,
      visual: s.htmlFallback || s.visualPrompt || 'direcao visual premium',
      icon: iconFor(index),
    })),
  };

  const rendered = await renderCarouselPlanPng({ plan });
  res.json({
    ok: rendered.success,
    visualMode,
    files: rendered.files,
    previewUrl: rendered.previewUrl,
    downloadUrl: rendered.downloadUrl,
    zipUrl: rendered.zipUrl,
  });
});

function iconFor(index) {
  return ['guitar-wave', 'warning', 'pattern', 'controls', 'space-delay', 'checklist'][index % 6];
}

export default router;

import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { generateCarouselImagePrompts, renderCarouselPlanPng } from '../renderers/visual-renderer.js';

export const CAROUSEL_STATUS = {
  PROMPTS_READY: 'CAROUSEL_PROMPTS_READY',
  WAITING_IMAGES: 'CAROUSEL_WAITING_IMAGES',
  IMAGES_RECEIVED: 'CAROUSEL_IMAGES_RECEIVED',
  RENDERED: 'CAROUSEL_RENDERED',
};

const PLAN_ROOT = path.join(config.storage.jobs || path.join(path.dirname(config.storage.upload), 'jobs'), 'carousel');
const UPLOAD_ROOT = path.join(config.storage.upload, 'carousel');
const SLIDE_FIELDS = ['slide_01', 'slide_02', 'slide_03', 'slide_04', 'slide_05', 'slide_06'];
const NEGATIVE_PROMPT = 'cartoon, low quality, blurry, distorted anatomy, unreadable text, watermark, logo, duplicated elements, messy composition';

export function getCarouselPlanPath(planId) {
  return path.join(PLAN_ROOT, planId, 'plan.json');
}

export function getCarouselUploadDir(planId) {
  return path.join(UPLOAD_ROOT, planId);
}

export function isCarouselRequest(message = '') {
  const clean = normalizeText(message).toLowerCase();
  return /\b(crie|criar|cria|gere|gerar|gera|faça|fazer|monte|montar)\b/.test(clean)
    && /\bcarrossel\b/.test(clean);
}

export function wantsHtmlSvgFallback(message = '') {
  const clean = normalizeText(message).toLowerCase();
  return /gera\s+direto|gerar\s+direto|renderiza\s+direto|renderizar\s+direto|faz\s+em\s+html\/?svg\s+agora|fazer\s+em\s+html\/?svg\s+agora|html\/?svg\s+agora|sem\s+prompts|finalizar\s+com\s+html\/?svg\s+sem\s+imagens|html\/?svg\s+sem\s+imagens|fallback\s+html\/?svg/.test(clean);
}

export async function generateCarouselPromptPack({ userId, topic, niche = '', style = 'premium dark neon', slides = 6 }) {
  const generated = generateCarouselImagePrompts({
    message: `carrossel sobre ${topic} ${niche} ${style} ${slides} slides`,
  });
  if (!generated.success) {
    const error = new Error(generated.message);
    error.status = 400;
    throw error;
  }

  const planId = uuidv4();
  const responseSlides = generated.prompts.slice(0, 6).map(item => ({
    slide: item.slide,
    title: item.title,
    text: item.text,
    visual_concept: item.visual_concept || item.visual_direction,
    image_prompt: item.image_prompt,
    negative_prompt: item.negative_prompt || NEGATIVE_PROMPT,
    composition: item.composition || item.visual_direction || 'Composicao vertical 4:5 com area limpa para headline.',
    aspect_ratio: item.aspect_ratio || '4:5',
    visual_style: item.visual_style || style,
    visual_purpose: item.visual_purpose || 'Imagem editorial realista conectada ao assunto do slide.',
    notes: item.notes || 'sem texto na imagem, deixar espaço para headline',
    index: item.slide,
    headline: item.title,
    body: item.text,
    imagePrompt: item.image_prompt,
    negativePrompt: item.negative_prompt || NEGATIVE_PROMPT,
  }));

  const plan = {
    type: 'carousel_prompt_pack',
    status: CAROUSEL_STATUS.PROMPTS_READY,
    planId,
    userId,
    topic,
    niche,
    style,
    message: 'Aqui estão os prompts das 6 imagens. Gere as imagens e envie de volta para eu finalizar o carrossel.',
    slides: responseSlides,
    nextStep: 'Envie 6 imagens quando estiver pronto.',
    allowManualFallback: false,
    internalPlan: generated.plan,
    uploadedImages: [],
    rendered: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveCarouselPlan(plan);
  return toPublicPromptPack(plan);
}

export const createCarouselPromptPack = generateCarouselPromptPack;

export async function readCarouselPlan(planId, userId) {
  const raw = await fs.readFile(getCarouselPlanPath(planId), 'utf8').catch(() => null);
  if (!raw) return null;
  const plan = JSON.parse(raw);
  if (userId && plan.userId !== userId) return null;
  return plan;
}

export async function saveCarouselPlan(plan) {
  const dir = path.dirname(getCarouselPlanPath(plan.planId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getCarouselPlanPath(plan.planId), JSON.stringify({
    ...plan,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

export async function saveCarouselImages({ plan, filesByField }) {
  const missing = SLIDE_FIELDS.filter(field => !filesByField?.[field]?.[0]);
  if (missing.length > 0) {
    const error = new Error(`Envie as 6 imagens: ${missing.join(', ')}.`);
    error.status = 400;
    throw error;
  }

  const uploadDir = getCarouselUploadDir(plan.planId);
  await fs.mkdir(uploadDir, { recursive: true });

  const uploadedImages = [];
  for (const field of SLIDE_FIELDS) {
    const file = filesByField[field][0];
    const index = Number(field.slice(-2));
    const filename = `${field}.png`;
    const outputPath = path.join(uploadDir, filename);
    await sharp(file.path).png().toFile(outputPath);
    uploadedImages.push({
      index,
      field,
      path: outputPath,
      filename,
      originalName: file.originalname,
    });
  }

  const nextPlan = {
    ...plan,
    status: CAROUSEL_STATUS.IMAGES_RECEIVED,
    uploadedImages,
  };
  await saveCarouselPlan(nextPlan);
  return nextPlan;
}

export async function finalizeCarouselPlan(plan) {
  const imageFiles = SLIDE_FIELDS.map((field, index) => ({
    originalname: `${field}.png`,
    path: path.join(getCarouselUploadDir(plan.planId), `${field}.png`),
    slideIndex: index + 1,
  }));

  const exists = await Promise.all(imageFiles.map(file => fs.access(file.path).then(() => true).catch(() => false)));
  if (exists.some(ok => !ok)) {
    const error = new Error('As 6 imagens precisam ser enviadas antes de finalizar o carrossel.');
    error.status = 409;
    throw error;
  }

  const internalPlan = plan.internalPlan || {};
  const renderPlan = {
    tema: plan.topic || 'Carrossel',
    publico: internalPlan.publico || 'audiencia do carrossel',
    promessa: internalPlan.promessa || 'conteudo claro em sequencia',
    sequenciaNarrativa: plan.slides.map(s => `slide ${s.index}`),
    ctaFinal: plan.slides[plan.slides.length - 1]?.body || '',
    visualStyle: internalPlan.visualStyle || {
      palette: { main: '#c6f135', soft: 'rgba(198,241,53,.22)', deep: 'rgba(42,215,255,.16)' },
      mood: 'premium dark neon editorial',
    },
    slides: plan.slides.map((slide, index) => ({
      role: `slide ${index + 1}`,
      title: slide.headline,
      text: slide.body,
      visual: slide.composition || slide.imagePrompt || 'direcao visual premium',
      icon: iconFor(index),
    })),
  };

  const rendered = await renderCarouselPlanPng({ plan: renderPlan, files: imageFiles });
  const nextPlan = {
    ...plan,
    status: CAROUSEL_STATUS.RENDERED,
    rendered,
  };
  await saveCarouselPlan(nextPlan);
  return rendered;
}

export async function renderCarouselHtmlSvgFallback(plan) {
  const internalPlan = plan.internalPlan || {};
  const renderPlan = {
    tema: plan.topic || 'Carrossel',
    publico: internalPlan.publico || 'audiencia do carrossel',
    promessa: internalPlan.promessa || 'conteudo claro em sequencia',
    sequenciaNarrativa: plan.slides.map(s => `slide ${s.index}`),
    ctaFinal: plan.slides[plan.slides.length - 1]?.body || '',
    visualStyle: internalPlan.visualStyle || {
      palette: { main: '#c6f135', soft: 'rgba(198,241,53,.22)', deep: 'rgba(42,215,255,.16)' },
      mood: 'premium dark neon editorial',
    },
    slides: plan.slides.map((slide, index) => ({
      role: `slide ${index + 1}`,
      title: slide.headline,
      text: slide.body,
      visual: slide.composition || slide.imagePrompt || 'direcao visual premium',
      icon: iconFor(index),
    })),
  };

  const rendered = await renderCarouselPlanPng({ plan: renderPlan });
  const nextPlan = {
    ...plan,
    rendered,
  };
  await saveCarouselPlan(nextPlan);
  return rendered;
}

export function toPublicPromptPack(plan) {
  return {
    type: 'carousel_prompt_pack',
    status: plan.status,
    planId: plan.planId,
    message: plan.message,
    slides: plan.slides,
    nextStep: plan.nextStep,
    allowManualFallback: Boolean(plan.allowManualFallback),
  };
}

export function extractCarouselTopic(message = '') {
  const clean = normalizeText(message).replace(/^\[agent:\w+\]\s*/i, '');
  const match = clean.match(/carrossel\s+(?:sobre|de|para)\s+(.+)$/i)
    || clean.match(/(?:sobre|de|para)\s+(.+)$/i);
  return (match?.[1] || clean)
    .replace(/\b(crie|criar|cria|gere|gerar|gera|faça|fazer|monte|montar|um|uma|prompts?|imagem|imagens|carrossel|instagram)\b/gi, ' ')
    .replace(/\b(das|dos|de|do)\b/gi, ' ')
    .replace(/[:;,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function carouselUploadFields() {
  return SLIDE_FIELDS.map(name => ({ name, maxCount: 1 }));
}

function iconFor(index) {
  return ['guitar-wave', 'warning', 'pattern', 'controls', 'space-delay', 'checklist'][index % 6];
}

function normalizeText(value) {
  return String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .normalize('NFC');
}

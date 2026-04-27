// agents/visual/visualSquad.js
// CarouselStrategistAgent + VisualReviewAgent.
// Provider: OpenAI. Nunca Anthropic.

import { chat, chatFast } from '../../lib/llm.js';
import { logger } from '../../lib/logger.js';

// ── Termos genéricos proibidos como cena principal ────────────────────────────
const GENERIC_BANNED = [
  'sound wave','onda sonora','eq curve','curva de eq','equalizer curve',
  'alert triangle','triângulo de alerta','target','alvo','checklist',
  'generic graph','gráfico genérico','generic icon','ícone genérico',
  'symbol','símbolo','waveform','abstract wave','music note icon',
  'floating note','lightning bolt','checkmark','tick mark',
];

// ── CarouselStrategistAgent ───────────────────────────────────────────────────
export async function carouselStrategistAgent({ topic, niche, platform, goal, userId }) {
  logger.info(`[CarouselStrategist] topic=${topic}`);

  const prompt = `Você é um estrategista de conteúdo para carrosséis de Instagram/TikTok.
Crie o roteiro estratégico ANTES dos prompts de imagem.

TEMA: ${topic}
NICHO: ${niche || 'geral'}
PLATAFORMA: ${platform || 'instagram'}
OBJETIVO: ${goal || 'educar e gerar salvamento'}

Retorne JSON:
{
  "hook": "gancho do slide 1 (provocação/pergunta/problema)",
  "arc": "arco narrativo (problema → desenvolvimento → solução → CTA)",
  "slides": [
    { "slide": 1, "purpose": "gancho", "concept": "conceito visual central", "title": "título curto", "text": "texto resumido do slide" }
  ],
  "cta": "chamada para ação do último slide",
  "saveTrigger": "por que vão salvar este carrossel",
  "shareability": "por que vão compartilhar"
}`;

  const raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 1500 });
  try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
  catch { return null; }
}

// ── VisualReviewAgent ─────────────────────────────────────────────────────────
export async function visualReviewAgent({ promptPack, topic, userId }) {
  logger.info(`[VisualReview] reviewing ${promptPack?.slides?.length} slides`);

  if (!promptPack?.slides?.length) return { score: 0, passed: false, notes: ['Sem slides para revisar'] };

  const slides = promptPack.slides;
  const issues = [];
  let score = 0;

  // 1. Campos obrigatórios
  const hasNeg  = slides.every(s => s.negative_prompt?.length > 10);
  const hasComp = slides.every(s => s.composition?.length > 10);
  const hasPurp = slides.every(s => s.visual_purpose?.length > 10);
  if (hasNeg)  score += 15; else issues.push('negative_prompt ausente em algum slide');
  if (hasComp) score += 10; else issues.push('composition ausente em algum slide');
  if (hasPurp) score += 10; else issues.push('visual_purpose ausente em algum slide');

  // 2. Detectar cenas genéricas como elemento PRINCIPAL (antes da 1ª vírgula)
  const genericCount = slides.filter(s => {
    const main = (s.image_prompt || '').toLowerCase().split(',')[0];
    return GENERIC_BANNED.some(t => main.includes(t));
  }).length;
  const genericScore = Math.max(0, 25 - genericCount * 7);
  score += genericScore;
  if (genericCount > 0) issues.push(`${genericCount} slide(s) com cena principal genérica (onda sonora/ícone/checklist)`);

  // 3. Realismo cinematográfico
  const CINEMATIC = ['cinematic','photo','realistic','editorial','shallow depth','bokeh','stage','haze','studio','50mm'];
  const realistCount = slides.filter(s => CINEMATIC.some(t => (s.image_prompt || '').toLowerCase().includes(t))).length;
  score += Math.round((realistCount / slides.length) * 20);
  if (realistCount < slides.length * 0.6) issues.push('Prompts pouco cinematográficos — parecem SVG/ícone');

  // 4. Especificidade (prompt > 100 chars)
  const specCount = slides.filter(s => (s.image_prompt || '').length > 100).length;
  score += Math.round((specCount / slides.length) * 10);

  // 5. Variedade
  const starts = new Set(slides.map(s => (s.image_prompt || '').toLowerCase().slice(0,40)));
  score += starts.size >= slides.length ? 10 : Math.round((starts.size / slides.length) * 10);
  if (starts.size < slides.length * 0.7) issues.push('Slides com prompts muito similares');

  const total = Math.min(100, score);
  const passed = total >= 85;

  return { score: total, passed, notes: issues, slides: slides.length };
}

export default { carouselStrategistAgent, visualReviewAgent };

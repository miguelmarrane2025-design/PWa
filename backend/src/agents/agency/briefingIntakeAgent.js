// agents/agency/briefingIntakeAgent.js
// Analisa pedido do usuário e monta briefing estruturado.
// Provider: OpenAI via llm.js.

import { chat } from '../../lib/llm.js';
import { logger } from '../../lib/logger.js';

const SYSTEM = `Você é o BriefingIntakeAgent do BotSquad.
Analise o pedido e extraia um briefing estruturado em JSON.

Squads disponíveis:
- agency_command_squad   → Work Orders, roteamento, status
- social_growth_squad    → crescimento orgânico YouTube/TikTok/Instagram
- marketing_strategy_squad → oferta, funil, copy, monetização
- traffic_scale_squad    → tráfego orgânico e pago
- dark_channel_squad     → canais faceless/dark
- video_cutting_squad    → cortes OpusClip, shorts, legendas
- creative_review_squad  → revisão visual, thumbnails, carrosséis
- infoproduct_publishing_squad → ebooks, cursos, workbooks
- niche_visionary_squad  → nichos, oportunidades, blue ocean
- audio_gear_squad       → presets, IRs, pedaleiras
- scriptwriter           → roteiros
- copywriter             → copy, CTA, legendas

Retorne APENAS JSON sem markdown:
{
  "briefingComplete": true,
  "missingInfo": [],
  "objective": "...",
  "niche": "...",
  "audience": "...",
  "platform": "...",
  "format": "...",
  "primarySquad": "...",
  "supportSquads": [],
  "successMetric": "...",
  "approvalRequired": true
}`;

export async function briefingIntakeAgent({ message, context = [], userId }) {
  logger.info(`[BriefingIntake] userId=${userId}`);

  const raw = await chat(
    [
      { role: 'system', content: SYSTEM },
      ...context.slice(-6),
      { role: 'user', content: message },
    ],
    { userId, max_tokens: 1000 }
  );

  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch {}

  return {
    briefingComplete: false,
    missingInfo: ['Não foi possível parsear o briefing.'],
    objective: 'general',
    niche: null,
    audience: null,
    platform: null,
    format: null,
    primarySquad: null,
    supportSquads: [],
    successMetric: null,
    approvalRequired: true,
  };
}

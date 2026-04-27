// agents/video/videoClipDirectorAgent.js
// Agente estrategista de cortes — usa IA para avaliar momentos e orientar o pipeline FFmpeg.
// Provider: OpenAI via chat/chatFast. Nunca Anthropic/Gemini.

import { chat, chatFast } from '../../lib/llm.js';
import { runWithReview } from '../../core/runWithReview.js';
import { agentMemoryService } from '../../memory/agentMemoryService.js';
import { logger } from '../../lib/logger.js';

// ── VideoMomentReviewerAgent ──────────────────────────────────────────────────
export async function videoMomentReviewerAgent({ moments, topic, platform, userId }) {
  logger.info(`[VideoMomentReviewer] moments=${moments?.length} platform=${platform}`);

  const momentList = (moments || []).map((m, i) =>
    `Corte ${i + 1}: ${m.start}s–${m.end}s (${m.duration}s) score=${m.score} reason="${m.reason}"`
  ).join('\n');

  const prompt = `Você é um revisor especialista em vídeo viral para redes sociais.

TEMA DO VÍDEO: ${topic || 'conteúdo geral'}
PLATAFORMA: ${platform || 'instagram'}

CANDIDATOS A CORTE:
${momentList}

Avalie cada corte com base em:
1. Tem gancho nos primeiros 3 segundos?
2. Alta energia ao longo do trecho?
3. Ausência de pausas mortas?
4. Duração ideal para a plataforma?
5. Faz sentido isolado?
6. Potencial de retenção?
7. Termina com continuidade/CTA implícito?

Score mínimo para aprovação: 80.

Retorne SOMENTE JSON válido:
{
  "score": 0,
  "passed": false,
  "notes": ["observação 1", "observação 2"],
  "bestCuts": [1, 2],
  "mustFix": ["ajuste obrigatório"],
  "recommendation": "texto curto de orientação"
}`;

  let raw = '';
  try {
    raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 600 });
    const m = raw.match(/\{[\s\S]*\}/);
    const review = m ? JSON.parse(m[0]) : { score: 70, passed: false, notes: ['Não foi possível avaliar'], bestCuts: [] };
    return { ...review, passed: (review.score ?? 0) >= 80 };
  } catch (err) {
    logger.warn(`[VideoMomentReviewer] parse error: ${err.message}`);
    return { score: 70, passed: false, notes: ['Erro na avaliação'], bestCuts: [], mustFix: [] };
  }
}

// ── VideoStrategyAgent ────────────────────────────────────────────────────────
async function videoStrategyAgent({ message, cutType, platform, userId }) {
  const ctx = await agentMemoryService.loadAgentContext('video').catch(() => ({ goodExamples: [], feedback: [] }));
  const refs = ctx.goodExamples?.slice(-2).map(e => e.summary || '').filter(Boolean).join(' | ') || '';

  const prompt = `Você é um diretor criativo de vídeo especializado em conteúdo viral.

PEDIDO: ${message || 'criar cortes virais'}
TIPO DE CORTE: ${cutType || 'short_form'}
PLATAFORMA: ${platform || 'instagram'}
${refs ? `REFERÊNCIAS APROVADAS: ${refs}` : ''}

Defina a estratégia de corte:
- Quantos cortes e de qual duração?
- Qual o ângulo de gancho?
- O que priorizar: energia, informação, emoção?
- Algum critério específico para a plataforma?

Retorne SOMENTE JSON:
{
  "cutStrategy": "descrição da estratégia",
  "targetDuration": "30-60s",
  "hookFocus": "primeiros 3 segundos devem ter...",
  "energyTarget": "alta|média|variada",
  "platformNote": "dica específica para a plataforma",
  "priority": "energia|informação|emoção|variedade"
}`;

  let raw = '';
  try {
    raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 500 });
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { cutStrategy: 'Auto — detectar melhores momentos por energia e ausência de silêncio', targetDuration: '30-60s', hookFocus: 'Início com afirmação forte', energyTarget: 'alta', priority: 'energia' };
  } catch {
    return { cutStrategy: 'Auto', targetDuration: '30-60s', priority: 'energia' };
  }
}

async function videoStrategyReviewAgent({ message, cutType, platform, userId }, strategy) {
  const prompt = `Voce e um revisor de estrategia para cortes de video social.

PEDIDO: ${message || 'criar cortes virais'}
TIPO DE CORTE: ${cutType || 'short_form'}
PLATAFORMA: ${platform || 'instagram'}
ESTRATEGIA GERADA: ${JSON.stringify(strategy)}

Avalie:
- Clareza da estrategia
- Adequacao a plataforma
- Forca do gancho
- Foco em retencao
- Direcao pratica para o pipeline

Retorne APENAS JSON:
{"score":0,"notes":[],"passed":false}`;

  try {
    const raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 500 });
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      const score = Math.max(0, Math.min(100, parseInt(parsed.score ?? 0, 10)));
      return { score, notes: parsed.notes || [], passed: score >= 80 };
    }
  } catch {}
  return { score: 0, notes: ['Falha na revisao da estrategia'], passed: false };
}

async function videoStrategyRefinerAgent({ message, cutType, platform, userId }, draft, notes) {
  const current = draft?.content ?? draft ?? {};
  const prompt = `Refine esta estrategia de cortes de video com base nas criticas do revisor.

PEDIDO: ${message || 'criar cortes virais'}
TIPO DE CORTE: ${cutType || 'short_form'}
PLATAFORMA: ${platform || 'instagram'}
ESTRATEGIA ATUAL: ${JSON.stringify(current)}
CRITICAS:
${(notes || []).map((note, index) => `${index + 1}. ${note}`).join('\n') || 'Sem criticas'}

Retorne APENAS JSON no mesmo formato da estrategia.`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 900 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? { content: JSON.parse(m[0]), raw } : draft;
  } catch {
    return draft;
  }
}

// ── runVideoClipDirectorFlow ──────────────────────────────────────────────────
export async function runVideoClipDirectorFlow({ message, cutType = 'short_form', platform = 'instagram', userId = null }) {
  logger.info(`[VideoClipDirector] cutType=${cutType} platform=${platform}`);

  // 1. Estrategia + revisao
  const reviewed = await runWithReview({
    specialist: async () => {
      const strategy = await videoStrategyAgent({ message, cutType, platform, userId });
      return { content: strategy, raw: JSON.stringify(strategy) };
    },
    reviewer: async (input, draft) => {
      const strategy = draft?.content ?? draft;
      return videoStrategyReviewAgent({ message, cutType, platform, userId }, strategy);
    },
    refiner: async (input, draft, notes) => {
      return videoStrategyRefinerAgent({ message, cutType, platform, userId }, draft, notes);
    },
    input: { message, cutType, platform },
    minScore: 80,
    maxAttempts: 3,
    memoryKey: 'video',
    userId,
  });

  const strategy = reviewed.output?.content ?? reviewed.output ?? {};

  const platformNote = {
    tiktok:    '⚡ TikTok: gancho nos primeiros 1-2s, cortes de 15-60s, vertical 9:16',
    reels:     '📱 Reels: gancho em 3s, cortes de 15-90s, vertical 9:16',
    shorts:    '▶️ Shorts: máximo 60s, gancho imediato, vertical 9:16',
    youtube:   '▶️ YouTube: pode ser mais longo, introdução de 5-10s',
    instagram: '📷 Instagram: cortes de 15-60s, vertical ou quadrado',
  }[platform] || `🎬 ${platform}: adaptar ao formato da plataforma`;

  const content = [
    `## 🎬 Estratégia de Corte — ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
    '',
    `**Tipo:** ${cutType === 'short_form' ? 'Short Form (viral/reel)' : cutType === 'long_form' ? 'Long Form (educacional)' : 'Auto (detectar automaticamente)'}`,
    `**Duração alvo:** ${strategy.targetDuration || '30-60s'}`,
    `**Foco:** ${strategy.priority || 'energia'}`,
    '',
    `**Estratégia:**`,
    strategy.cutStrategy || 'Detectar automaticamente os melhores momentos por análise de silêncio e energia de áudio.',
    '',
    `**Gancho:**`,
    strategy.hookFocus || 'Priorizar início com afirmação forte ou fala com energia alta.',
    '',
    platformNote,
    '',
    `> 💡 Para processar o vídeo, use a aba **Vídeo** — envie o arquivo e clique em *Identificar Melhores Momentos*.`,
    '',
    `**Critérios de aprovação de corte:**`,
    `• Score mínimo: 80/100`,
    `• Sem pausas mortas longas`,
    `• Gancho nos primeiros 3s`,
    `• Duração dentro da faixa ideal para ${platform}`,
  ].join('\n');

  return {
    content,
    metadata: { agent: 'video_clip_director', strategy, cutType, platform, reviewLoop: reviewed },
  };
}

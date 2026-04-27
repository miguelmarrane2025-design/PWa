// agents/dark-channel/darkChannelSquad.js
// Criação e crescimento de canais dark/faceless.
// Provider: OpenAI via llm.js.

import { chat }                    from '../../lib/llm.js';
import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

const REVIEWER_SYSTEM = `Você é o DarkChannelReviewAgent.
Avalie pacotes de canal dark/faceless.

Score 0-100. Critérios: nicho viável, identidade do canal coerente, pilares de conteúdo diferenciados, roteiro com gancho forte, direção visual clara, sem risco de strike/ban, metadados otimizados.

Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const SPECIALIST_SYSTEM = `Você é o DarkChannelSquad do BotSquad.
Crie pacotes completos de canais dark/faceless para TikTok e YouTube.

Nichos prioritários: guitarra/worship/timbre, fé/histórias bíblicas, curiosidades/educação, tecnologia/IA, histórias e biografias.

Para cada pedido, entregue:
- Estratégia do canal (nome, tagline, identidade)
- Pilares de conteúdo (3-5)
- 10+ ideias de vídeo com títulos
- Roteiro completo do primeiro vídeo (gancho, desenvolvimento, CTA)
- Direção visual (estética, paleta, estilo de edição)
- Narração (tom, ritmo, energia)
- Metadados: título, descrição, hashtags
- Checklist de compliance (sem plágio, sem strike)

Responda na língua do usuário.`;

export async function runDarkChannelFlow({ message, context = [], files = [], userId, briefing = {} }) {
  logger.info(`[DarkChannelSquad] userId=${userId}`);

  const ctx    = await agentMemoryService.loadAgentContext('dark-channel').catch(() => ({ goodExamples: [] }));
  const memRef = ctx.goodExamples?.slice(-2).map(e => e.output?.channelStrategy || '').filter(Boolean).join(' | ') || '';

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + (memRef ? `\n\nReferências aprovadas: ${memRef}` : ''),
    buildUserMsg: (inp) => `PEDIDO: ${inp.message}\nNicho: ${inp.niche || 'não informado'}\nPlataforma: ${inp.platform || 'YouTube/TikTok'}`,
    userId,
  });
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 82, userId });
  const refiner  = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + '\n\nAPRIMORE conforme notas.',
    buildUserMsg: (inp, draft, notes) => `PEDIDO: ${inp.message}\nRASCUNHO:\n${draft?.content||''}\nNOTAS:\n${(notes||[]).join('\n')}`,
    userId,
  });

  const result = await runWithReview({
    specialist, reviewer, refiner,
    input: { message, niche: briefing.niche, platform: briefing.platform },
    minScore: 82, maxAttempts: 2, memoryKey: 'dark-channel', userId,
  });

  const content = result.output?.content || result.output || 'Pacote gerado.';
  return {
    content:  `🎬 **Dark Channel Squad** | Score: ${result.qualityScore}/100\n\n${content}`,
    agent:    'dark_channel_squad',
    metadata: { qualityScore: result.qualityScore },
  };
}

export default { runDarkChannelFlow };

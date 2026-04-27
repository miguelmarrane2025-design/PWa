// agents/traffic/trafficScaleSquad.js
// Escala com tráfego orgânico e pago.
// Provider: OpenAI via llm.js.

import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

const REVIEWER_SYSTEM = `Você é o TrafficScaleReviewAgent.
Avalie planos de tráfego orgânico e pago.

Score 0-100. Critérios: estratégia orgânica clara, criativos definidos, estrutura de campanha viável, orçamento realista, públicos especificados, métricas de sucesso definidas, testes A/B planejados.

Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const SPECIALIST_SYSTEM = `Você é o TrafficScaleSquad do BotSquad.
Crie planos de escala de tráfego orgânico e pago.

Inclua:
- Escala orgânica: conteúdos vencedores → volume → reaproveitamento
- Plano de tráfego pago: campanha, objetivo, público, orçamento sugerido
- Criativos a testar (ângulo, hook, formato)
- Estrutura de campanha (topo/meio/fundo)
- Métricas e KPIs
- Escalonamento progressivo

Responda na língua do usuário.`;

export async function runTrafficScaleFlow({ message, context = [], files = [], userId, briefing = {} }) {
  logger.info(`[TrafficScaleSquad] userId=${userId}`);

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM,
    buildUserMsg: (inp) => `PEDIDO: ${inp.message}\nNicho: ${inp.niche || 'não informado'}\nObjetivo: ${inp.objective || 'escalar tráfego'}`,
    userId,
  });
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 78, userId });
  const refiner  = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + '\n\nAPRIMORE conforme notas.',
    buildUserMsg: (inp, draft, notes) => `PEDIDO: ${inp.message}\nRASCUNHO:\n${draft?.content||''}\nNOTAS:\n${(notes||[]).join('\n')}`,
    userId,
  });

  const result = await runWithReview({
    specialist, reviewer, refiner,
    input: { message, niche: briefing.niche, objective: briefing.objective },
    minScore: 78, maxAttempts: 2, memoryKey: 'traffic', userId,
  });

  const content = result.output?.content || result.output || 'Plano gerado.';
  return {
    content:  `🚀 **Traffic Scale Squad** | Score: ${result.qualityScore}/100\n\n${content}`,
    agent:    'traffic_scale_squad',
    metadata: { qualityScore: result.qualityScore },
  };
}

export default { runTrafficScaleFlow };

// agents/niche/nicheVisionarySquad.js
// Encontrar nichos, subnichos, blue ocean, oportunidades.
// Provider: OpenAI via llm.js.

import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

const REVIEWER_SYSTEM = `Você é o NicheOpportunityReviewAgent.
Avalie oportunidades de nicho.

Score 0-100. Critérios: nicho específico (não genérico), análise de concorrência real, oportunidade monetizável, produto digital viável, audiência apaixonada identificada, ângulos de conteúdo diferenciados.

Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const SPECIALIST_SYSTEM = `Você é o NicheVisionarySquad do BotSquad.
Encontre oportunidades de nicho, subnicho e blue ocean.

Para cada pedido entregue:
- Mapa de nichos (nicho → subnicho → micro-nicho)
- Análise de concorrência (saturação, gaps)
- Oportunidades blue ocean (pouco exploradas)
- Potencial de monetização por nicho
- Produtos digitais viáveis (ebook, curso, membership, infoproduto)
- Oportunidades de canal dark/faceless
- Ângulos de conteúdo diferenciados
- Tendências emergentes
- Riscos e alertas
- Top 3 recomendações com justificativa

Seja específico, não genérico. Use dados e exemplos reais.
Responda na língua do usuário.`;

export async function runNicheVisionaryFlow({ message, context = [], files = [], userId, briefing = {} }) {
  logger.info(`[NicheVisionarySquad] userId=${userId}`);

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM,
    buildUserMsg: (inp) => `PEDIDO: ${inp.message}\nContexto: ${inp.context || 'análise geral'}`,
    userId,
  });
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 82, userId });
  const refiner  = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + '\n\nAPRIMORE com mais especificidade.',
    buildUserMsg: (inp, draft, notes) => `PEDIDO: ${inp.message}\nRASCUNHO:\n${draft?.content||''}\nNOTAS:\n${(notes||[]).join('\n')}`,
    userId,
  });

  const result = await runWithReview({
    specialist, reviewer, refiner,
    input: { message, context: briefing.niche },
    minScore: 82, maxAttempts: 2, memoryKey: 'niche-visionary', userId,
  });

  const content = result.output?.content || result.output || 'Análise de nicho gerada.';
  return {
    content:  `🔭 **Niche Visionary Squad** | Score: ${result.qualityScore}/100\n\n${content}`,
    agent:    'niche_visionary_squad',
    metadata: { qualityScore: result.qualityScore },
  };
}

export default { runNicheVisionaryFlow };

// agents/marketing/marketingStrategySquad.js
// Oferta, funil, copy, monetização.
// Provider: OpenAI via llm.js.

import { chat }                    from '../../lib/llm.js';
import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

const REVIEWER_SYSTEM = `Você é o MarketingConversionReviewAgent.
Avalie estratégias de marketing e ofertas.

Score 0-100. Critérios: proposta de valor clara, público-alvo definido, dor e desejo articulados, mecanismo único, funil coerente, copy persuasiva sem ser genérica, monetização viável.

Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const SPECIALIST_SYSTEM = `Você é o MarketingStrategySquad do BotSquad.
Crie estratégias de marketing, ofertas e funis de venda.

Inclua quando relevante:
- Análise do público-alvo (dor + desejo + transformação)
- Posicionamento único
- Oferta irresistível (headline, promessa, prova, garantia)
- Mecanismo único
- Funil: topo → meio → fundo
- Copy principal
- Pontos de monetização
- Próximos passos

Seja concreto. Nunca genérico.
Responda na língua do usuário.`;

export async function runMarketingStrategyFlow({ message, context = [], files = [], userId, briefing = {} }) {
  logger.info(`[MarketingStrategySquad] userId=${userId}`);

  const ctx    = await agentMemoryService.loadAgentContext('marketing').catch(() => ({ goodExamples: [] }));
  const memRef = ctx.goodExamples?.slice(-2).map(e => e.output?.offer || '').filter(Boolean).join(' | ') || '';

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + (memRef ? `\n\nReferências aprovadas: ${memRef}` : ''),
    buildUserMsg: (inp) => `PEDIDO: ${inp.message}\nNicho: ${inp.niche || 'não informado'}\nAudiência: ${inp.audience || 'não informada'}\nObjetivo: ${inp.objective || 'geral'}`,
    userId,
  });

  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 80, userId });

  const refiner = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + '\n\nAPRIMORE conforme notas do revisor.',
    buildUserMsg: (inp, draft, notes) => `PEDIDO: ${inp.message}\n\nRASCUNHO:\n${draft?.content || ''}\n\nNOTAS:\n${(notes||[]).join('\n')}`,
    userId,
  });

  const input = { message, niche: briefing.niche, audience: briefing.audience, objective: briefing.objective };

  const result = await runWithReview({
    specialist, reviewer, refiner, input,
    minScore: 80, maxAttempts: 2, memoryKey: 'marketing', userId,
  });

  const content = result.output?.content || result.output || 'Estratégia gerada.';
  return {
    content:  `💰 **Marketing Strategy Squad** | Score: ${result.qualityScore}/100\n\n${content}`,
    agent:    'marketing_strategy_squad',
    metadata: { qualityScore: result.qualityScore, approved: result.approved },
  };
}

export default { runMarketingStrategyFlow };

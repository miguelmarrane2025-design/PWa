// agents/infoproduct/infoProductPublishingSquad.js
// Criação de infoprodutos completos.
// Reaproveita infoproductSquad existente + reviewer próprio.
// Provider: OpenAI via llm.js.

import { chat }                    from '../../lib/llm.js';
import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

const REVIEWER_SYSTEM = `Você é o ProductQualityReviewAgent.
Avalie infoprodutos (ebooks, cursos, workbooks).

Score 0-100 (mínimo 85 para aprovar). Critérios: promessa de transformação clara, conteúdo completo (não cortado), estrutura de capítulos/módulos coerente, linguagem para o público-alvo, exercícios práticos quando aplicável, oferta irresistível com título e subtítulo, página de vendas esboçada.

Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const SPECIALIST_SYSTEM = `Você é o InfoProductPublishingSquad do BotSquad.
Crie infoprodutos completos de alta qualidade.

Para pedidos de EBOOK/LIVRO:
- Título + Subtítulo irresistível
- Promessa de transformação
- Índice completo (10-15 capítulos)
- Capítulo 1 completo (2000+ palavras)
- Exercícios práticos por capítulo
- Bônus sugeridos
- Oferta + página de vendas esboçada

Para pedidos de CURSO:
- Nome + promessa
- Estrutura de módulos
- Aulas por módulo
- Materiais complementares
- Precificação sugerida

Para WORKBOOK/GUIA:
- Título + promessa
- Seções principais
- Exercícios e templates
- Checklist de ação

Score mínimo de aprovação: 85.
Responda na língua do usuário.`;

export async function runInfoProductFlow({ message, context = [], files = [], userId, briefing = {} }) {
  logger.info(`[InfoProductPublishingSquad] userId=${userId}`);

  // Tenta reaproveitar squad existente
  try {
    const { infoproductSquad } = await import('../infoproduct/infoproductSquad.js');
    if (infoproductSquad) {
      const r = await infoproductSquad({ userId, message, context, files });
      if (r?.content) {
        // Passa pelo reviewer
        const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 85, userId });
        const review   = await reviewer({ message }, { content: r.content });
        return {
          content:  `📚 **InfoProduct Publishing Squad** | Score: ${review.score}/100\n\n${r.content}`,
          agent:    'infoproduct_publishing_squad',
          metadata: { qualityScore: review.score },
        };
      }
    }
  } catch {}

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM,
    buildUserMsg: (inp) => `PEDIDO: ${inp.message}\nNicho: ${inp.niche || 'não informado'}\nAudiência: ${inp.audience || 'não informada'}`,
    userId,
  });
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 85, userId });
  const refiner  = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + '\n\nAPRIMORE para atingir score 85+.',
    buildUserMsg: (inp, draft, notes) => `PEDIDO: ${inp.message}\nRASCUNHO:\n${draft?.content||''}\nNOTAS:\n${(notes||[]).join('\n')}`,
    userId,
  });

  const result = await runWithReview({
    specialist, reviewer, refiner,
    input: { message, niche: briefing.niche, audience: briefing.audience },
    minScore: 85, maxAttempts: 3, memoryKey: 'infoproduct-publishing', userId,
  });

  const content = result.output?.content || result.output || 'Infoproduto gerado.';
  return {
    content:  `📚 **InfoProduct Publishing Squad** | Score: ${result.qualityScore}/100\n\n${content}`,
    agent:    'infoproduct_publishing_squad',
    metadata: { qualityScore: result.qualityScore },
  };
}

export default { runInfoProductFlow };

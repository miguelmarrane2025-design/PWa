// agents/creative-review/creativeReviewSquad.js
// Revisão de vídeos, imagens, thumbnails, carrosséis e consistência visual.
// Provider: OpenAI via llm.js. Nunca chama provider direto.

import { chat }                    from '../../lib/llm.js';
import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

// ── Reviewer principal ────────────────────────────────────────────────────────
const REVIEWER_SYSTEM = `Você é o CreativeQualityReviewAgent do BotSquad.
Avalie a qualidade visual e criativa de qualquer entrega.

Score 0-100. Critérios:
- Objetivo visual está claro?
- Hierarquia de informação correta?
- Coerência visual (paleta, tipografia, estilo)?
- Thumbnail: gancho visual, rosto/emoção, texto legível, contraste?
- Carrossel: primeiro slide vende o clique? fluxo coerente? CTA no último?
- Vídeo: gancho nos primeiros 3s? corte limpo? legenda legível? sem pausa morta?
- Não está genérico/sem personalidade?
- Pronto para publicar?

Score >= 85: aprovado | 70-84: refinar | < 70: reprovar.

Retorne APENAS JSON: {"score":0,"notes":[],"passed":false,"strengths":[],"mustFix":[],"improvements":[]}`;

// ── Agentes internos ──────────────────────────────────────────────────────────

export async function videoReviewAgent({ content, context, userId }) {
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 80, userId });
  return reviewer({ type: 'video', context }, { content });
}

export async function thumbnailReviewAgent({ content, context, userId }) {
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 82, userId });
  return reviewer({ type: 'thumbnail', context }, { content });
}

export async function carouselReviewAgent({ content, context, userId }) {
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 80, userId });
  return reviewer({ type: 'carousel', context }, { content });
}

export async function imageReviewAgent({ content, context, userId }) {
  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 78, userId });
  return reviewer({ type: 'image', context }, { content });
}

// ── Main Flow ─────────────────────────────────────────────────────────────────
const SPECIALIST_SYSTEM = `Você é o CreativeReviewSquad do BotSquad.
Revise qualquer entrega criativa com olhar profissional.

Para THUMBNAIL: avalie gancho visual, emoção/rosto, texto (legível, curto, impacto), contraste, cor dominante.
Para CARROSSEL: avalie primeiro slide (isca), fluxo de slides, copy por slide, CTA final.
Para VÍDEO: avalie gancho (3s), retenção, cortes, legenda, enquadramento vertical, metadados.
Para IMAGEM: avalie composição, mensagem, paleta, adequação ao canal.

Entregue:
- Diagnóstico geral (2-3 linhas)
- Pontos fortes (lista)
- Problemas críticos (mustFix)
- Melhorias sugeridas
- Score 0-100
- Aprovado ou precisa refinar

Responda na língua do usuário.`;

export async function runCreativeReviewFlow({ message, context = [], files = [], userId, briefing = {} }) {
  logger.info(`[CreativeReviewSquad] userId=${userId}`);

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM,
    buildUserMsg: (inp) => `PEDIDO DE REVISÃO: ${inp.message}\nTipo: ${inp.type || 'criativo geral'}\nContexto: ${inp.context || 'não informado'}`,
    userId,
  });

  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 80, userId });

  const refiner = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + '\n\nAPRIMORE a revisão conforme notas.',
    buildUserMsg: (inp, draft, notes) => `PEDIDO: ${inp.message}\nRASCUNHO:\n${draft?.content||''}\nNOTAS:\n${(notes||[]).join('\n')}`,
    userId,
  });

  // Detectar tipo pelo pedido
  const type = message.match(/thumb(nail)?/i) ? 'thumbnail'
             : message.match(/carrossel|carousel/i) ? 'carousel'
             : message.match(/v[íi]deo|video|clip/i) ? 'video'
             : 'image';

  const result = await runWithReview({
    specialist, reviewer, refiner,
    input: { message, type, context: briefing.niche },
    minScore: 80, maxAttempts: 2, memoryKey: 'creative-review', userId,
  });

  const content = result.output?.content || result.output || 'Revisão concluída.';
  return {
    content:  `🎨 **Creative Review Squad** | Score: ${result.qualityScore}/100\n\n${content}`,
    agent:    'creative_review_squad',
    metadata: { qualityScore: result.qualityScore, type },
  };
}

export default { runCreativeReviewFlow, videoReviewAgent, thumbnailReviewAgent, carouselReviewAgent, imageReviewAgent };

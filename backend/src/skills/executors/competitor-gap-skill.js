import { competitorGapAgent } from '../../agents/growth/competitorGapAgent.js';

export default async function(ctx, params) {
  const message = params.message || params.texto || ctx?.sessao?.ultimoTexto || '';
  const niche = params.nicho || ctx?.sessao?.nicho || 'geral';
  const competitor = params.competitor || params.concorrente || '';
  const result = await competitorGapAgent({
    message,
    niche,
    competitor,
    userId: ctx?.userId || null,
    context: [],
    tools: {},
  });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata || result };
}

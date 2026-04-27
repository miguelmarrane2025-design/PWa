import { hookResearchAgent } from '../../agents/growth/hookResearchAgent.js';

export default async function(ctx, params) {
  const message = params.message || params.texto || ctx?.sessao?.ultimoTexto || '';
  const niche = params.nicho || ctx?.sessao?.nicho || 'geral';
  const platform = params.platform || 'instagram';
  const result = await hookResearchAgent({
    message,
    niche,
    platform,
    userId: ctx?.userId || null,
    context: [],
    tools: {},
  });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata || result };
}

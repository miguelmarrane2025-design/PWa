import { profileInvestigatorAgent } from '../../agents/growth/profileInvestigatorAgent.js';

export default async function(ctx, params) {
  const message = params.message || params.texto || ctx?.sessao?.ultimoTexto || '';
  const niche = params.nicho || ctx?.sessao?.nicho || 'geral';
  const result = await profileInvestigatorAgent({
    message,
    niche,
    userId: ctx?.userId || null,
    context: [],
    tools: {},
  });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata || result };
}

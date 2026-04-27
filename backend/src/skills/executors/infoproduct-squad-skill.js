import { runInfoproductFlow } from '../../agents/infoproduct/infoproductSquad.js';
export default async function(ctx, params, tools) {
  const topic    = params.topic || params.tema || ctx?.sessao?.ultimoTexto || 'infoproduto';
  const niche    = params.niche || params.nicho || ctx?.sessao?.nicho || 'geral';
  const audience = params.audience || params.publico || 'iniciantes';
  const level    = params.level || params.nivel || 'iniciante';
  const result   = await runInfoproductFlow({ topic, niche, audience, level, userId: ctx?.userId });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata };
}

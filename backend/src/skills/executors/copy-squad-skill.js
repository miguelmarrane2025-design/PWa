// skills/executors/copy-squad-skill.js
// Adapter: skill-manager → CopySquad (CopyChief + Copywriter + CopyReview + CopyRefiner)
import { runCopyFlow } from '../../agents/copy/copySquad.js';

export default async function(ctx, params, tools) {
  const topic    = params.topic || params.tema || params.texto || ctx?.sessao?.ultimoTexto || 'copy';
  const niche    = params.nicho || params.niche || ctx?.sessao?.nicho || 'geral';
  const goal     = params.goal  || params.objetivo || '';
  const audience = params.audience || params.publico || '';
  const userId   = ctx?.userId || null;

  const result = await runCopyFlow({ topic, niche, goal, audience, userId });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata };
}

// skills/executors/niche-visionary-squad-skill.js
import { logger } from '../../lib/logger.js';
export async function execute(ctx, params = {}) {
  try {
    const { runNicheVisionaryFlow } = await import('../../agents/niche/nicheVisionarySquad.js');
    const r = await runNicheVisionaryFlow({ message: ctx.sessao?.ultimoTexto || params.message || '', context: ctx.historico || [], userId: ctx.userId });
    return { outputs: [{ tipo: 'texto', conteudo: r.content }] };
  } catch (err) { return { outputs: [{ tipo: 'texto', conteudo: `Erro Niche Visionary Squad: ${err.message}` }] }; }
}

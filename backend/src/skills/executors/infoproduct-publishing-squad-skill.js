// skills/executors/infoproduct-publishing-squad-skill.js
import { logger } from '../../lib/logger.js';
export async function execute(ctx, params = {}) {
  try {
    const { runInfoProductFlow } = await import('../../agents/infoproduct/infoProductPublishingSquad.js');
    const r = await runInfoProductFlow({ message: ctx.sessao?.ultimoTexto || params.message || '', context: ctx.historico || [], userId: ctx.userId });
    return { outputs: [{ tipo: 'texto', conteudo: r.content }] };
  } catch (err) { return { outputs: [{ tipo: 'texto', conteudo: `Erro InfoProduct Publishing Squad: ${err.message}` }] }; }
}

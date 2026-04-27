// skills/executors/traffic-scale-squad-skill.js
import { logger } from '../../lib/logger.js';
export async function execute(ctx, params = {}) {
  try {
    const { runTrafficScaleFlow } = await import('../../agents/traffic/trafficScaleSquad.js');
    const r = await runTrafficScaleFlow({ message: ctx.sessao?.ultimoTexto || params.message || '', context: ctx.historico || [], userId: ctx.userId });
    return { outputs: [{ tipo: 'texto', conteudo: r.content }] };
  } catch (err) { return { outputs: [{ tipo: 'texto', conteudo: `Erro Traffic Scale Squad: ${err.message}` }] }; }
}

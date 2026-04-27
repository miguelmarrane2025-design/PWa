// skills/executors/dark-channel-squad-skill.js
import { logger } from '../../lib/logger.js';
export async function execute(ctx, params = {}) {
  try {
    const { runDarkChannelFlow } = await import('../../agents/dark-channel/darkChannelSquad.js');
    const r = await runDarkChannelFlow({ message: ctx.sessao?.ultimoTexto || params.message || '', context: ctx.historico || [], userId: ctx.userId });
    return { outputs: [{ tipo: 'texto', conteudo: r.content }] };
  } catch (err) { return { outputs: [{ tipo: 'texto', conteudo: `Erro Dark Channel Squad: ${err.message}` }] }; }
}

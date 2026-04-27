// skills/executors/video-cutting-squad-skill.js
import { logger } from '../../lib/logger.js';
export async function execute(ctx, params = {}) {
  try {
    const { runVideoCuttingFlow } = await import('../../agents/video/videoCuttingSquad.js');
    const r = await runVideoCuttingFlow({ message: ctx.sessao?.ultimoTexto || params.message || '', context: ctx.historico || [], files: ctx.arquivos || [], userId: ctx.userId });
    return { outputs: [{ tipo: 'texto', conteudo: r.content }] };
  } catch (err) { return { outputs: [{ tipo: 'texto', conteudo: `Erro Video Cutting Squad: ${err.message}` }] }; }
}

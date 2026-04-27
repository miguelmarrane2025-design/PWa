// skills/executors/creative-review-squad-skill.js
import { logger } from '../../lib/logger.js';
export async function execute(ctx, params = {}) {
  try {
    const { runCreativeReviewFlow } = await import('../../agents/creative-review/creativeReviewSquad.js');
    const r = await runCreativeReviewFlow({
      message: ctx.sessao?.ultimoTexto || params.message || '',
      context: ctx.historico || [],
      files:   ctx.arquivos  || [],
      userId:  ctx.userId,
    });
    return { outputs: [{ tipo: 'texto', conteudo: r.content }] };
  } catch (err) {
    logger.error(`[CreativeReviewSquadSkill] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `Erro Creative Review Squad: ${err.message}` }] };
  }
}

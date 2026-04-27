// skills/executors/marketing-strategy-squad-skill.js
import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  try {
    const { runMarketingStrategyFlow } = await import('../../agents/marketing/marketingStrategySquad.js');
    const result = await runMarketingStrategyFlow({
      message: ctx.sessao?.ultimoTexto || params.message || '',
      context: ctx.historico || [],
      files:   ctx.arquivos  || [],
      userId:  ctx.userId,
    });
    return { outputs: [{ tipo: 'texto', conteudo: result.content }] };
  } catch (err) {
    logger.error(`[MarketingStrategySquadSkill] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `Erro no Marketing Strategy Squad: ${err.message}` }] };
  }
}

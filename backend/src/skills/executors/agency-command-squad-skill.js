// skills/executors/agency-command-squad-skill.js
// Executor de skill para o Agency Command Squad.

import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  try {
    const { runAgencyCommandFlow } = await import('../../agents/agency/agencyCommandSquad.js');
    const message = ctx.sessao?.ultimoTexto || params.message || '';
    const result  = await runAgencyCommandFlow({
      message,
      context: ctx.historico || [],
      files:   ctx.arquivos  || [],
      userId:  ctx.userId,
    });
    return { outputs: [{ tipo: 'texto', conteudo: result.content }] };
  } catch (err) {
    logger.error(`[AgencyCommandSquadSkill] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `Erro no Agency Command Squad: ${err.message}` }] };
  }
}

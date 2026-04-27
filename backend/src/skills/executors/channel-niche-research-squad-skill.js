// backend/src/skills/executors/channel-niche-research-squad-skill.js
// Executor da skill channel_niche_research_squad.
// Extrai briefing estruturado da sessão e delega ao squad.

import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  try {
    const { runChannelNicheResearchFlow } = await import('../../agents/channel-niche/channelNicheResearchSquad.js');

    const message = ctx.sessao?.ultimoTexto || params.message || '';

    // Extrair briefing da sessão se disponível
    const briefing = params.briefing || {};

    // Tentar inferir plataformas a partir da mensagem
    const msgLower = message.toLowerCase();
    if (!briefing.platforms) {
      briefing.platforms = [];
      if (msgLower.includes('tiktok'))    briefing.platforms.push('tiktok');
      if (msgLower.includes('youtube') || msgLower.includes('yt')) briefing.platforms.push('youtube');
      if (msgLower.includes('instagram') || msgLower.includes('reels')) briefing.platforms.push('instagram');
      if (msgLower.includes('kwai'))      briefing.platforms.push('kwai');
      if (briefing.platforms.length === 0) briefing.platforms = ['youtube', 'tiktok'];
    }

    // Inferir se faceless desejado
    if (briefing.constraints === undefined) {
      briefing.constraints = {
        faceless:      msgLower.includes('sem rosto') || msgLower.includes('faceless') || msgLower.includes('dark'),
        noCopyrightRisk: true,
      };
    }

    const result = await runChannelNicheResearchFlow({
      message,
      context: ctx.historico || [],
      files:   ctx.arquivos  || [],
      userId:  ctx.userId,
      briefing,
    });

    return { outputs: [{ tipo: 'texto', conteudo: result.content }] };
  } catch (err) {
    logger.error('[ChannelNicheResearchSquadSkill] ' + err.message);
    return { outputs: [{ tipo: 'texto', conteudo: 'Erro no Channel Niche Research Squad: ' + err.message }] };
  }
}

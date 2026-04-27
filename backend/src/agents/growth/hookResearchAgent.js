// agents/growth/hookResearchAgent.js
// Pesquisa e análise de hooks virais por nicho/plataforma.
import { researchAgent } from '../researchAgent.js';
import { logger } from '../../lib/logger.js';

export async function hookResearchAgent({ message, niche, platform, userId, context = [], tools = {} }) {
  logger.info(`[HookResearch] niche=${niche} platform=${platform} userId=${userId}`);
  const enriched = `[Pesquisar hooks virais para nicho: ${niche || 'geral'} plataforma: ${platform || 'instagram'}] ${message}`;
  return researchAgent({ userId, message: enriched, context, tools, _systemOverride: 'growth' });
}

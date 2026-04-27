// agents/growth/competitorGapAgent.js
// Análise de gaps de concorrentes por nicho.
import { researchAgent } from '../researchAgent.js';
import { logger } from '../../lib/logger.js';

export async function competitorGapAgent({ message, niche, competitor, userId, context = [], tools = {} }) {
  logger.info(`[CompetitorGap] niche=${niche} userId=${userId}`);
  const enriched = `[Analisar gaps de concorrente: ${competitor || 'não especificado'} nicho: ${niche || 'geral'}] ${message}`;
  return researchAgent({ userId, message: enriched, context, tools, _systemOverride: 'growth' });
}

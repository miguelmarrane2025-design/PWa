// agents/growth/channelGrowthStrategistAgent.js
// Estratégias de crescimento de canal por plataforma.
import { researchAgent } from '../researchAgent.js';
import { logger } from '../../lib/logger.js';

export async function channelGrowthStrategistAgent({ message, platform, niche, userId, context = [], tools = {} }) {
  logger.info(`[ChannelGrowth] platform=${platform} niche=${niche} userId=${userId}`);
  const enriched = `[Criar estratégia de crescimento de canal para: ${platform || 'instagram'} nicho: ${niche || 'geral'}] ${message}`;
  return researchAgent({ userId, message: enriched, context, tools, _systemOverride: 'growth' });
}

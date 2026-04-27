// agents/growth/contentPatternAnalystAgent.js
// Analisa padrões de conteúdo viral e retenção por nicho.
import { researchAgent } from '../researchAgent.js';
import { logger } from '../../lib/logger.js';

export async function contentPatternAnalystAgent({ message, niche, platform, userId, context = [], tools = {} }) {
  logger.info(`[ContentPattern] niche=${niche} platform=${platform} userId=${userId}`);
  const enriched = `[Analisar padrões de conteúdo viral nicho: ${niche || 'geral'} plataforma: ${platform || 'instagram'}] ${message}`;
  return researchAgent({ userId, message: enriched, context, tools, _systemOverride: 'social' });
}

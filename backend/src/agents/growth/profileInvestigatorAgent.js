// agents/growth/profileInvestigatorAgent.js
// Wrapper sobre researchAgent com foco em investigação de perfis.
import { researchAgent } from '../researchAgent.js';
import { logger } from '../../lib/logger.js';

export async function profileInvestigatorAgent({ message, userId, context = [], tools = {} }) {
  logger.info(`[ProfileInvestigator] userId=${userId}`);
  const enriched = `[Investigar perfil] ${message}`;
  return researchAgent({ userId, message: enriched, context, tools, _systemOverride: 'social' });
}

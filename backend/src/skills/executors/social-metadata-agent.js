// skills/executors/social-metadata-agent.js
// Executor para a skill social_metadata_agent.

import { socialMetadataAgent } from '../../agents/video/socialMetadataAgent.js';
import { logger } from '../../lib/logger.js';

export default async function (ctx, params, tools) {
  const topic    = params.texto || params.topic || ctx?.sessao?.ultimoTexto || '';
  const platform = params.platform || 'instagram';
  const niche    = params.nicho || ctx?.sessao?.nicho || 'geral';
  const userId   = ctx?.userId || null;

  logger.info(`[SocialMetadataExecutor] platform=${platform} userId=${userId}`);

  try {
    const result = await socialMetadataAgent({ topic, platform, niche, userId });
    return {
      outputs:  [{ tipo: 'texto', conteudo: result.content }],
      metadata: result.metadata || { agent: 'social_metadata_agent' },
    };
  } catch (err) {
    logger.error(`[SocialMetadataExecutor] error: ${err.message}`);
    return {
      outputs: [{ tipo: 'texto', conteudo: `❌ Erro no SocialMetadata: ${err.message}` }],
    };
  }
}

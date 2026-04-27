// skills/executors/caption-style-agent.js
// Executor para a skill caption_style_agent.

import { captionStyleAgent } from '../../agents/video/captionStyleAgent.js';
import { logger } from '../../lib/logger.js';

export default async function (ctx, params, tools) {
  const captionStyle = params.captionStyle || params.estilo || 'classic';
  const platform     = params.platform || 'instagram';
  const userId       = ctx?.userId || null;

  logger.info(`[CaptionStyleExecutor] style=${captionStyle} userId=${userId}`);

  try {
    const result = await captionStyleAgent({ captionStyle, platform, userId });
    return {
      outputs:  [{ tipo: 'texto', conteudo: result.content }],
      metadata: result.metadata || { agent: 'caption_style_agent' },
    };
  } catch (err) {
    logger.error(`[CaptionStyleExecutor] error: ${err.message}`);
    return {
      outputs: [{ tipo: 'texto', conteudo: `❌ Erro no CaptionStyle: ${err.message}` }],
    };
  }
}

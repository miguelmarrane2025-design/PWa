// skills/executors/video-clip-director.js
// Executor para a skill video_clip_director.
// Delega para o VideoClipDirectorAgent que usa o pipeline FFmpeg + avaliação de IA.

import { runVideoClipDirectorFlow } from '../../agents/video/videoClipDirectorAgent.js';
import { logger } from '../../lib/logger.js';

export default async function (ctx, params, tools) {
  const message  = params.texto || params.topic || ctx?.sessao?.ultimoTexto || '';
  const cutType  = params.cutType  || params.acao || 'short_form';
  const platform = params.platform || ctx?.sessao?.plataforma || 'instagram';
  const userId   = ctx?.userId || null;

  logger.info(`[VideoClipDirectorExecutor] cutType=${cutType} platform=${platform} userId=${userId}`);

  try {
    const result = await runVideoClipDirectorFlow({ message, cutType, platform, userId });
    return {
      outputs:  [{ tipo: 'texto', conteudo: result.content }],
      metadata: result.metadata || { agent: 'video_clip_director' },
    };
  } catch (err) {
    logger.error(`[VideoClipDirectorExecutor] error: ${err.message}`);
    return {
      outputs: [{
        tipo: 'texto',
        conteudo: `❌ Erro no VideoClipDirector: ${err.message}. Envie o vídeo diretamente na aba Vídeo para processar.`,
      }],
    };
  }
}

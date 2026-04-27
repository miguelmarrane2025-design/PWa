import { runThumbnailFlow } from '../../agents/thumbnail/thumbnailSquad.js';
export default async function(ctx, params, tools) {
  const videoTitle = params.title || params.titulo || params.texto || ctx?.sessao?.ultimoTexto || 'vídeo';
  const niche      = params.niche || params.nicho  || ctx?.sessao?.nicho || 'geral';
  const channel    = params.channel || ctx?.sessao?.canal || '';
  const result     = await runThumbnailFlow({ videoTitle, niche, channel, userId: ctx?.userId });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata };
}

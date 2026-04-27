import { runAudioGearFlow } from '../../agents/audio/audioGearSquad.js';
export default async function(ctx, params, tools) {
  const message = params.message || params.texto || ctx?.sessao?.ultimoTexto || '';
  const style   = params.style   || params.estilo  || ctx?.sessao?.estilo || 'worship balanced';
  const guitar  = params.guitar  || params.guitarra || ctx?.sessao?.guitarra || '';
  const result  = await runAudioGearFlow({ message, style, guitar, userId: ctx?.userId });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata };
}

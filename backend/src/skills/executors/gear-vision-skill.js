// skills/executors/gear-vision-skill.js
import { logger } from '../../lib/logger.js';
export async function execute(ctx, params = {}) {
  try {
    const { createPresetFromImage, gearVisionAgent } = await import('../../agents/audio/gearVisionAgent.js');
    const message    = ctx.sessao?.ultimoTexto || params.message || '';
    const imagePath  = ctx.sessao?.ultimaFoto  || params.imagePath || null;
    const imageFiles = (ctx.arquivos || []).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.originalname ?? ''));
    const imgPath    = imagePath || imageFiles[0]?.path || null;
    const style      = message.match(/ambient|emocional|lead|base limpa|worship|gospel/i)?.[0] || 'worship balanced';
    const known      = params.knownDevice || '';

    const r = await createPresetFromImage({ imagePath: imgPath, targetStyle: style, knownDevice: known, context: message, userId: ctx.userId });
    return { outputs: [{ tipo: 'texto', conteudo: r.content }] };
  } catch (err) { return { outputs: [{ tipo: 'texto', conteudo: `Erro Gear Vision: ${err.message}` }] }; }
}

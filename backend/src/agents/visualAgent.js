import { logger }         from '../lib/logger.js';
import { generateCarouselImagePrompts, renderCarouselPng } from '../renderers/visual-renderer.js';

export async function visualAgent({ userId, message, context = [], files = [] }) {
  console.log('VISUAL PIPELINE EXECUTADO');
  try {
    if (wantsImagePrompts(message)) {
      const prompts = generateCarouselImagePrompts({ message, context, userId });
      if (!prompts.success) throw new Error(prompts.message);
      logger.info(`[VisualAgent] Carousel image prompts generated user=${userId}`);
      return {
        ...prompts,
        agent: 'visual',
        content: formatPromptResponse(prompts.prompts),
      };
    }

    const rendered = await renderCarouselPng({ message, context, userId, files });
    if (!rendered?.previewUrl || !Array.isArray(rendered.files) || rendered.files.length === 0) {
      throw new Error('Visual agent failed to generate image');
    }
    logger.info(`[VisualAgent] Local visual rendered: ${rendered.files?.[0]}`);
    return {
      ...rendered,
      content: rendered.message,
    };
  } catch (err) {
    logger.error(`[VisualAgent] Local render error: ${err.message}`);
    return {
      success: false,
      type: 'visual',
      content: 'Visual agent failed to generate image',
      message: 'Visual agent failed to generate image',
      files: [],
      previewUrl: null,
      downloadUrl: null,
      error: err.message,
    };
  }
}

function wantsImagePrompts(message = '') {
  const clean = message.replace(/^\[agent:\w+\]\s*/i, '').toLowerCase();
  return /prompt(s)?\s+(das|de)?\s*imagem|gerar\s+prompts|prompts?\s+do\s+carrossel|imagens?\s+do\s+carrossel/.test(clean);
}

function formatPromptResponse(prompts = []) {
  return [
    'Gerar prompts de imagem do carrossel',
    '',
    'Copie os prompts abaixo para gerar as imagens externamente. Depois envie as imagens e use "Montar carrossel com imagens".',
    '',
    '```json',
    JSON.stringify(prompts, null, 2),
    '```',
  ].join('\n');
}

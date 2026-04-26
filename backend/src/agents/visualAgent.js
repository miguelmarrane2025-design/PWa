import { logger }         from '../lib/logger.js';
import { generateCarouselImagePrompts, renderCarouselPng } from '../renderers/visual-renderer.js';
import {
  extractCarouselTopic,
  generateCarouselPromptPack,
  isCarouselRequest,
  wantsHtmlSvgFallback,
} from '../services/carousel-service.js';

export async function visualAgent({ userId, message, context = [], files = [] }) {
  console.log('VISUAL PIPELINE EXECUTADO');
  try {
    if (isCarouselRequest(message) && !wantsHtmlSvgFallback(message)) {
      const topic = extractCarouselTopic(message);
      if (!topic) throw new Error('Informe o tema do carrossel.');
      const pack = await generateCarouselPromptPack({ userId, topic });
      logger.info(`[VisualAgent] Carousel prompt pack ready user=${userId} plan=${pack.planId}`);
      return {
        ...pack,
        agent: 'visual',
        success: true,
        content: pack.message,
      };
    }

    if (wantsImagePrompts(message)) {
      const topic = extractCarouselTopic(message);
      const prompts = topic
        ? await generateCarouselPromptPack({ userId, topic })
        : generateCarouselImagePrompts({ message, context, userId });
      if (!prompts.success && !prompts.planId) throw new Error(prompts.message);
      logger.info(`[VisualAgent] Carousel image prompts generated user=${userId}`);
      if (prompts.type === 'carousel_prompt_pack') {
        return {
          ...prompts,
          agent: 'visual',
          success: true,
          content: prompts.message,
        };
      }
      return {
        ...prompts,
        agent: 'visual',
        content: formatPromptResponse(prompts.prompts),
      };
    }

    if (/\bcarrossel\b/i.test(message) && !wantsHtmlSvgFallback(message)) {
      return {
        success: false,
        type: 'carousel_prompt_pack',
        content: 'Para carrossel, eu primeiro gero os prompts das imagens. Peça "Crie um carrossel sobre [tema]" para começar.',
        message: 'Para carrossel, eu primeiro gero os prompts das imagens. Peça "Crie um carrossel sobre [tema]" para começar.',
        files: [],
        previewUrl: null,
        downloadUrl: null,
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

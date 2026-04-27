// agents/carouselAssemblerAgent.js
// Monta o carrossel final depois que o usuário envia as imagens.
// Só executa quando as imagens foram recebidas.

import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { chat } from '../lib/llm.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

const ASSEMBLER_SYSTEM = `Você é o montador de carrosséis do BotSquad. Sua função:
1. Receber um planId e as imagens enviadas pelo usuário.
2. Associar cada imagem ao slide correspondente.
3. Confirmar que o carrossel está pronto para download.
4. Instruir o usuário sobre como baixar os slides.

Seja objetivo e claro. Responda no idioma do usuário.`;

/**
 * Detecta se a mensagem indica que o usuário está enviando imagens para um carrossel.
 */
export function detectsImageUploadForCarousel(message, files = []) {
  if (files.length === 0) return false;
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.originalname ?? ''));
  if (imageFiles.length === 0) return false;

  const triggers = [
    /aqui.*(imag|foto|slide)/i,
    /imagens.*(carrossel|carousel)/i,
    /enviando.*(imag|foto)/i,
    /prontas.*(imag|foto)/i,
    /segue.*(imag|foto)/i,
    /planId/i,
  ];
  return triggers.some(r => r.test(message)) || imageFiles.length >= 2;
}

/**
 * Monta o carrossel com as imagens recebidas.
 */
export async function carouselAssemblerAgent({ userId, message, context = [], files = [] }) {
  logger.info(`[CarouselAssembler] start user=${userId} files=${files.length}`);

  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.originalname ?? ''));

  if (imageFiles.length === 0) {
    return {
      type: 'text',
      content: '📎 Não encontrei imagens. Por favor, envie as imagens do carrossel para eu montar o arquivo final.',
      agent: 'carousel-assembler',
    };
  }

  // Extrair planId do contexto, se disponível
  let planId = null;
  const planMatch = [...context, { content: message }]
    .map(m => typeof m.content === 'string' ? m.content : '')
    .join(' ')
    .match(/planId[:\s]+([a-f0-9-]{36})/i);
  if (planMatch) planId = planMatch[1];

  // Gerar pasta de saída para este carrossel
  const carouselId = planId || uuidv4();
  const outputDir  = path.join(config.storage.output || 'storage/output', 'carousels', carouselId);
  await fs.mkdir(outputDir, { recursive: true });

  // Copiar/mover imagens para a pasta do carrossel
  const savedImages = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const f    = imageFiles[i];
    const ext  = path.extname(f.originalname || f.path || '.jpg');
    const dest = path.join(outputDir, `slide_${String(i + 1).padStart(2, '0')}${ext}`);
    try {
      await fs.copyFile(f.path, dest);
      savedImages.push({ slide: i + 1, file: `slide_${String(i + 1).padStart(2, '0')}${ext}`, original: f.originalname });
    } catch (e) {
      logger.warn(`[CarouselAssembler] could not copy file: ${e.message}`);
    }
  }

  // Gerar manifesto JSON
  const manifest = {
    carouselId,
    planId,
    userId,
    createdAt: new Date().toISOString(),
    slides: savedImages,
    status: 'IMAGES_RECEIVED',
  };
  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Resposta ao usuário
  const backendBase = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;
  const folderUrl   = `${backendBase}/carousels/${carouselId}/`;

  const content = [
    `✅ **Carrossel montado! ${savedImages.length} imagens recebidas.**`,
    ``,
    `📦 **ID do carrossel:** \`${carouselId}\``,
    ``,
    `**Slides salvos:**`,
    ...savedImages.map(s => `• Slide ${s.slide}: ${s.original || s.file}`),
    ``,
    `📥 **Download:** ${folderUrl}`,
    ``,
    `> Dica: para baixar todos os arquivos como ZIP, use: \`GET /carousels/${carouselId}/download\``,
  ].join('\n');

  return {
    type: 'carousel_assembled',
    content,
    agent: 'carousel-assembler',
    metadata: {
      agent: 'carousel-assembler',
      carouselId,
      planId,
      slides: savedImages.length,
      outputDir,
      folderUrl,
    },
  };
}

export default carouselAssemblerAgent;

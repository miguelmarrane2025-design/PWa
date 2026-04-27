// video/downloadVideoFile.js
// Baixa vídeo por URL usando stream. Nunca carrega tudo em memória.

import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { logger } from '../lib/logger.js';

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB hard limit
const ALLOWED_MIME   = /^video\//;
const STORAGE_BASE   = process.env.VIDEO_ORIGINAL_DIR || 'storage/uploads/videos/original';

/**
 * Baixa um vídeo de uma URL para disco via stream.
 * @param {string} url URL do vídeo (Drive, Dropbox, link direto)
 * @param {string} videoId UUID para nomear o arquivo
 * @returns {{ filePath: string, size: number, mime: string }}
 */
export async function downloadVideoFile(url, videoId) {
  await fs.mkdir(STORAGE_BASE, { recursive: true });

  const fetch = (await import('node-fetch')).default;

  logger.info(`[VideoDownload] start url=${url.slice(0, 80)} videoId=${videoId}`);

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 BotSquad/27 VideoImporter' },
    redirect: 'follow',
    timeout: 60000,
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} from video URL`);

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('A URL retornou uma página HTML — pode ser uma tela de confirmação do Google Drive. Certifique-se de que o arquivo é compartilhado publicamente ou use um link direto de download.');
  }

  const contentLength = parseInt(resp.headers.get('content-length') || '0');
  if (contentLength > MAX_SIZE_BYTES) throw new Error(`Arquivo muito grande: ${(contentLength / 1e9).toFixed(1)} GB. Máximo: 2 GB.`);

  // Determinar extensão pelo content-type ou URL
  const ext = contentType.includes('mp4') ? '.mp4'
    : contentType.includes('webm') ? '.webm'
    : contentType.includes('quicktime') ? '.mov'
    : contentType.includes('x-matroska') ? '.mkv'
    : url.match(/\.(mp4|mov|mkv|webm)/i)?.[1] ? `.${url.match(/\.(mp4|mov|mkv|webm)/i)[1].toLowerCase()}`
    : '.mp4';

  const filePath = path.join(STORAGE_BASE, `${videoId}${ext}`);
  const ws = createWriteStream(filePath);

  let downloaded = 0;
  for await (const chunk of resp.body) {
    downloaded += chunk.length;
    if (downloaded > MAX_SIZE_BYTES) {
      ws.destroy();
      await fs.unlink(filePath).catch(() => {});
      throw new Error('Download cancelado: arquivo excede 2 GB.');
    }
    ws.write(chunk);
  }

  await new Promise((res, rej) => { ws.end(); ws.on('finish', res); ws.on('error', rej); });

  logger.info(`[VideoDownload] done path=${filePath} size=${downloaded}`);
  return { filePath, size: downloaded, mime: contentType.split(';')[0] };
}

// video/videoCleanupJob.js
// Limpeza automática de arquivos temporários de vídeo.

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';

const DIRS = {
  chunks:   process.env.VIDEO_CHUNKS_DIR   || 'storage/uploads/videos/chunks',
  original: process.env.VIDEO_ORIGINAL_DIR || 'storage/uploads/videos/original',
  temp:     process.env.VIDEO_TEMP_DIR     || 'storage/temp/video',
};

const HOURS_ORIGINAL = parseInt(process.env.VIDEO_RETENTION_HOURS_ORIGINAL || '24');
const HOURS_TEMP     = parseInt(process.env.VIDEO_RETENTION_HOURS_TEMP     || '6');
const AUTO_DELETE_TEMP     = process.env.VIDEO_AUTO_DELETE_TEMP !== 'false';
const AUTO_DELETE_ORIGINAL = process.env.VIDEO_KEEP_ORIGINAL === 'false';

async function cleanDir(dirPath, maxAgeHours) {
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      // Safety: never delete outside storage/
      if (!fullPath.includes('storage')) continue;
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat) continue;
      const ageMs = now - stat.mtimeMs;
      if (ageMs > maxAgeMs) {
        if (entry.isDirectory()) {
          await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
        } else {
          await fs.unlink(fullPath).catch(() => {});
        }
        deleted++;
      }
    }
  } catch {}
  return deleted;
}

export async function runVideoCleanup() {
  logger.info('[VideoCleanup] starting...');
  let total = 0;

  if (AUTO_DELETE_TEMP) {
    total += await cleanDir(DIRS.chunks, HOURS_TEMP);
    total += await cleanDir(DIRS.temp, HOURS_TEMP);
  }
  if (AUTO_DELETE_ORIGINAL) {
    total += await cleanDir(DIRS.original, HOURS_ORIGINAL);
  }

  logger.info(`[VideoCleanup] done. deleted=${total} files/dirs`);
  return { deleted: total };
}

// Auto-schedule cleanup every 2 hours
if (process.env.VIDEO_AUTO_DELETE_TEMP !== 'false') {
  setInterval(() => runVideoCleanup().catch(e => logger.warn(`[VideoCleanup] ${e.message}`)), 2 * 60 * 60 * 1000);
}

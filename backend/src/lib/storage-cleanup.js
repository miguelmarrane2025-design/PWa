// lib/storage-cleanup.js
// ─────────────────────────────────────────────────────────────────────────
// Automatic file cleanup for storage directories.
// Runs daily and on startup (offset by 5 min to avoid startup contention).
//
// Rules:
//   outputs/  — files older than OUTPUT_TTL_DAYS (default 7)
//   temp/     — files older than 1 hour (should already be cleaned, belt+suspenders)
//   uploads/  — files older than 1 hour (multer originals)
//
// Skips files referenced in active video_jobs or audio_jobs (status != 'done'/'error').
// ─────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'fs';
import path               from 'path';
import { config }         from '../config/index.js';
import { query }          from '../db/index.js';
import { logger }         from './logger.js';

const OUTPUT_TTL_DAYS = parseInt(process.env.OUTPUT_TTL_DAYS || '7');
const TEMP_TTL_HOURS  = 1;

async function getProtectedPaths() {
  // Files referenced by in-progress jobs must not be deleted
  const protected_ = new Set();
  try {
    const { rows: vj } = await query(
      `SELECT output_path, captions_path, input_paths FROM video_jobs
       WHERE status NOT IN ('done','error')`,
    );
    for (const r of vj) {
      if (r.output_path)   protected_.add(r.output_path);
      if (r.captions_path) protected_.add(r.captions_path);
      const inputs = Array.isArray(r.input_paths) ? r.input_paths : [];
      inputs.forEach(p => protected_.add(p));
    }

    const { rows: aj } = await query(
      `SELECT output_path, input_path FROM audio_jobs
       WHERE status NOT IN ('done','error')`,
    );
    for (const r of aj) {
      if (r.output_path) protected_.add(r.output_path);
      if (r.input_path)  protected_.add(r.input_path);
    }
  } catch { /* DB not ready — return empty set, skip cleanup */ }
  return protected_;
}

async function cleanDir(dir, maxAgeMs, label) {
  try {
    const entries = await fs.readdir(dir).catch(() => []);
    if (!entries.length) return;

    const protected_ = await getProtectedPaths();
    const now = Date.now();
    let deleted = 0;

    for (const name of entries) {
      const fullPath = path.join(dir, name);
      try {
        if (protected_.has(fullPath)) continue;
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(fullPath);
          deleted++;
        }
      } catch { /* file already gone — skip */ }
    }

    if (deleted > 0) {
      logger.info(`[StorageCleanup] ${label}: deleted ${deleted} file(s)`);
    }
  } catch (err) {
    logger.warn(`[StorageCleanup] ${label} failed: ${err.message}`);
  }
}

export async function runCleanup() {
  logger.info('[StorageCleanup] Starting...');
  await Promise.all([
    cleanDir(config.storage.output,  OUTPUT_TTL_DAYS * 24 * 60 * 60 * 1000, 'outputs'),
    cleanDir(config.storage.temp,    TEMP_TTL_HOURS  * 60 * 60 * 1000,       'temp'),
    cleanDir(config.storage.upload,  TEMP_TTL_HOURS  * 60 * 60 * 1000,       'uploads'),
  ]);
  logger.info('[StorageCleanup] Done');
}

// Schedule: run once at startup (after 5 min delay) then every 24 hours
export function scheduleCleanup() {
  // 5-minute startup delay so server is fully ready
  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, 24 * 60 * 60 * 1000).unref();
  }, 5 * 60 * 1000).unref();
}

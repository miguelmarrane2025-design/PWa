// remotionCompositionService.js — Remotion como motor de motion graphics
// Responsável por overlays, captions animadas, lower thirds, CTA, etc.
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../../lib/logger.js';

const OUTPUT_BASE = path.resolve(process.cwd(), 'storage/outputs/videos/composition');

async function checkRemotionAvailable() {
  try {
    await import('@remotion/renderer');
    return { available: true };
  } catch {
    return { available: false };
  }
}

export async function generateRemotionOverlays({ jobId, sourceVideo, clips = [], preset = {}, captions = [], overlays = [], format = '9:16', brand = {} } = {}) {
  const start = Date.now();
  const outDir = path.join(OUTPUT_BASE, jobId, 'remotion');
  await fs.mkdir(outDir, { recursive: true });

  const remotionStatus = await checkRemotionAvailable();

  if (!remotionStatus.available) {
    logger.warn('[RemotionComposition] @remotion/renderer não disponível — fallback FFmpeg drawtext');
    return {
      ok: true,
      usedTool: 'ffmpeg_drawtext_fallback',
      overlaysGenerated: [],
      compositionPath: null,
      warnings: ['Remotion não disponível — overlays via FFmpeg drawtext'],
      fallback: 'ffmpeg_drawtext',
      latencyMs: Date.now() - start,
    };
  }

  // Remotion available — generate composition manifest for use by renderer
  const compositionManifest = {
    jobId,
    sourceVideo,
    clips,
    captions,
    overlays,
    format,
    brand,
    preset: {
      id: preset.id || 'default',
      captionStyle: preset.captionRules?.style || 'clean',
      overlayStyle: preset.visualRules?.overlayStyle || 'clean',
    },
    createdAt: new Date().toISOString(),
  };

  const manifestPath = path.join(outDir, 'composition-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(compositionManifest, null, 2), 'utf-8');

  return {
    ok: true,
    usedTool: 'remotion',
    overlaysGenerated: overlays,
    compositionPath: manifestPath,
    compositionManifest,
    warnings: [],
    fallback: null,
    latencyMs: Date.now() - start,
  };
}

export default { generateRemotionOverlays, checkRemotionAvailable };

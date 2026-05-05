// proCompositionEngine.js — Motor central de composição
// Decide a cadeia: Remotion → Natron → Blender → FFmpeg conforme disponibilidade/perfil
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../../lib/logger.js';
import { generateRemotionOverlays } from './remotionCompositionService.js';
import { applyColorGrade } from '../color/proColorGradeService.js';
import { applyAudioMix } from '../audio/proVideoAudioMixService.js';
import { checkNatronAvailability } from '../runners/natronRunner.js';
import { checkBlenderAvailability } from '../runners/blenderRunner.js';

const OUTPUT_BASE = path.resolve(process.cwd(), 'storage/outputs/videos/composition');

export async function runCompositionPipeline({ jobId, sourceVideo, editPlan, preset = {}, styleProfile = {}, requestedLevel = 'pro', format = '9:16' } = {}) {
  const start = Date.now();
  const outDir = path.join(OUTPUT_BASE, jobId);
  await fs.mkdir(outDir, { recursive: true });

  const usedTools = [];
  const skippedTools = [];
  const fallbacks = [];
  const blockingTools = [];
  const warnings = [];

  // ── 1. Motion Graphics / Overlays (Remotion) ─────────────────────
  const videoTrack = editPlan?.plan?.tracks?.find(t => t.type === 'video');
  const clips = videoTrack?.clips || [];

  const remotionResult = await generateRemotionOverlays({
    jobId,
    sourceVideo,
    clips,
    preset,
    format,
  });

  if (remotionResult.usedTool === 'ffmpeg_drawtext_fallback') {
    fallbacks.push('remotion_fallback_ffmpeg');
  } else {
    usedTools.push('remotion');
  }

  // ── 2. Natron (node compositing avançado) ─────────────────────────
  const natronStatus = await checkNatronAvailability();
  if (!natronStatus.available) {
    if (requestedLevel === 'full_studio' && preset.requiresNatron) {
      blockingTools.push({ tool: 'natron', reason: 'Natron obrigatório para este preset Full Studio', installHint: 'apt install natron ou AppImage de natrongithub.org' });
    } else {
      skippedTools.push('natron');
      fallbacks.push('natron_fallback_remotion_ffmpeg');
    }
  } else {
    usedTools.push('natron');
  }

  // ── 3. Blender (3D / motion / title cards) ────────────────────────
  const blenderStatus = await checkBlenderAvailability();
  if (!blenderStatus.available) {
    if (requestedLevel === 'full_studio' && preset.requiresBlender) {
      blockingTools.push({ tool: 'blender', reason: 'Blender obrigatório para este preset Full Studio', installHint: 'apt install blender ou snap install blender --classic' });
    } else {
      skippedTools.push('blender');
      fallbacks.push('blender_fallback_remotion');
    }
  } else {
    usedTools.push('blender');
  }

  if (blockingTools.length > 0 && requestedLevel === 'full_studio') {
    return {
      ok: false,
      blocked: true,
      blockingTools,
      reason: `Full Studio bloqueado: ${blockingTools.map(t => t.tool).join(', ')} ausente(s).`,
      usedTools,
      skippedTools,
      fallbacks,
      warnings,
      compositionReport: { remotionResult },
      outputPath: null,
      latencyMs: Date.now() - start,
    };
  }

  return {
    ok: true,
    blocked: false,
    blockingTools: [],
    usedTools,
    skippedTools,
    fallbacks,
    warnings,
    compositionReport: { remotionResult, natronAvailable: natronStatus.available, blenderAvailable: blenderStatus.available },
    outputPath: null, // composição manifesto; render final fica no proRenderService
    latencyMs: Date.now() - start,
  };
}

export default { runCompositionPipeline };

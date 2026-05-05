// fullStudioEngine.js — Motor central Full Studio (After Effects + DaVinci-like)
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../lib/logger.js';
import { runFullStudioPreflight } from './fullStudioPreflight.js';
import { runProAnalysis } from '../pipeline/proAnalysisService.js';
import { scoreHighlights } from '../pipeline/highlightScorerService.js';
import { buildProfessionalEditPlan } from '../pipeline/editPlanService.js';
import { reviewProfessionalEditPlan } from '../pipeline/editSupervisorService.js';
import { renderProfessionalEditPlan } from '../pipeline/proRenderService.js';
import { validateProfessionalOutput } from '../pipeline/outputValidationService.js';
import { runCompositionPipeline } from '../composition/proCompositionEngine.js';
import { applyColorGrade } from '../color/proColorGradeService.js';
import { applyAudioMix } from '../audio/proVideoAudioMixService.js';
import { getVideoProfessionalToolchainStatus } from '../toolchain/videoToolchainService.js';
import { getProEditingPreset, PRO_EDITING_PRESETS } from '../presets/proEditingPresets.js';

const OUTPUT_BASE = path.resolve(process.cwd(), 'storage/outputs/videos/full-studio');

export async function runFullStudioEdit({
  sourceVideo,
  presetId = 'podcast_studio_full_studio',
  format = '9:16',
  clipCount = 1,
  targetDuration = 30,
  userId = null,
} = {}) {
  const jobId = `fs_${uuidv4().slice(0, 12)}`;
  const outDir = path.join(OUTPUT_BASE, jobId);
  await fs.mkdir(outDir, { recursive: true });

  const stages = [];
  const log = (stage, status, data = {}) => {
    stages.push({ stage, status, ...data, at: new Date().toISOString() });
    logger.info(`[FullStudio] stage=${stage} status=${status} job=${jobId}`);
  };

  // ── STAGE 1: Preflight ────────────────────────────────────────────
  log('preflight', 'running');
  const preflight = await runFullStudioPreflight({ presetId });
  if (!preflight.ready) {
    log('preflight', 'blocked', { blockingReasons: preflight.blockingReasons });
    return {
      ok: false,
      jobId,
      status: 'blocked',
      stage: 'preflight',
      preflight,
      stages,
      outputs: [],
      primaryOutput: null,
      message: `Full Studio bloqueado: ${preflight.blockingReasons.join('; ')}`,
    };
  }
  log('preflight', 'ok');

  const preset = getProEditingPreset(presetId);

  // ── STAGE 2: Analysis ─────────────────────────────────────────────
  log('analysis', 'running');
  let analysis;
  try {
    analysis = await runProAnalysis({ sourceVideo, targetDuration, preset });
    log('analysis', 'ok', { usedTools: analysis.usedTools, candidatesCount: analysis.candidates?.length });
  } catch (err) {
    log('analysis', 'failed', { error: err.message });
    return { ok: false, jobId, status: 'failed', stage: 'analysis', error: err.message, stages, outputs: [], primaryOutput: null };
  }

  // ── STAGE 3: Highlights ───────────────────────────────────────────
  log('highlights', 'running');
  const toolchain = await getVideoProfessionalToolchainStatus();
  const highlightsRaw = scoreHighlights(analysis, { targetDuration, clipCount, durationMode: 'normal', preset, toolchain });
  const clips = Array.isArray(highlightsRaw) ? highlightsRaw : (highlightsRaw?.clips || []);
  log('highlights', 'ok', { clipsCount: clips.length });

  // ── STAGE 4: Edit Plan ────────────────────────────────────────────
  log('editPlan', 'running');
  const editPlanResult = await buildProfessionalEditPlan({ jobId, sourceVideo, highlights: clips, presetId, format });
  log('editPlan', 'ok', { jsonPath: editPlanResult.jsonPath });

  // ── STAGE 5: Supervisor ───────────────────────────────────────────
  log('supervisor', 'running');
  try {
    const supervisorReview = await reviewProfessionalEditPlan({ plan: editPlanResult.plan, sourceVideo, preset });
    log('supervisor', 'ok', { approved: supervisorReview?.approved });
  } catch {
    log('supervisor', 'skipped');
  }

  // ── STAGE 6: Composition (Remotion + Natron/Blender se disponível) ─
  log('composition', 'running');
  const compositionResult = await runCompositionPipeline({
    jobId,
    sourceVideo,
    editPlan: editPlanResult,
    preset,
    requestedLevel: 'full_studio',
    format,
  });
  if (!compositionResult.ok && compositionResult.blocked) {
    log('composition', 'blocked', { blockingTools: compositionResult.blockingTools });
    return { ok: false, jobId, status: 'blocked', stage: 'composition', compositionResult, stages, outputs: [], primaryOutput: null };
  }
  log('composition', 'ok', { usedTools: compositionResult.usedTools, fallbacks: compositionResult.fallbacks });

  // ── STAGE 7: Render ───────────────────────────────────────────────
  log('render', 'running');
  let renderResult;
  try {
    renderResult = await renderProfessionalEditPlan({ jobId, sourceVideo, plan: editPlanResult.plan, format });
    log('render', 'ok', { outputsCount: renderResult.outputs?.length });
  } catch (err) {
    log('render', 'failed', { error: err.message });
    return { ok: false, jobId, status: 'failed', stage: 'render', error: err.message, stages, outputs: [], primaryOutput: null };
  }

  if (!renderResult.outputs?.length) {
    log('render', 'failed', { error: 'Nenhum clip válido gerado' });
    return { ok: false, jobId, status: 'failed', stage: 'render', error: 'Nenhum clip válido foi gerado pelo Motor Pro.', stages, outputs: [], primaryOutput: null };
  }

  // ── STAGE 8: Color Grade ──────────────────────────────────────────
  log('colorGrade', 'running');
  const colorGradedOutputs = [];
  for (const output of renderResult.outputs) {
    const colorOut = output.path.replace('.mp4', '_graded.mp4');
    const colorResult = await applyColorGrade({
      inputPath: output.path,
      outputPath: colorOut,
      colorPresetId: preset.colorRules?.preset || 'viral_punchy_mobile',
      engineProfile: 'full_studio',
    });
    if (colorResult.ok) {
      colorGradedOutputs.push({ ...output, path: colorResult.outputPath, colorGraded: true, colorPreset: colorResult.colorPresetId });
    } else {
      colorGradedOutputs.push({ ...output, colorGraded: false, colorError: colorResult.error });
    }
  }
  log('colorGrade', 'ok');

  // ── STAGE 9: Audio Mix ────────────────────────────────────────────
  log('audioMix', 'running');
  const finalOutputs = [];
  for (const output of colorGradedOutputs) {
    const audioOut = output.path.replace('_graded.mp4', '_final.mp4').replace('.mp4', '_final.mp4');
    const audioResult = await applyAudioMix({
      inputPath: output.path,
      outputPath: audioOut,
      audioMode: preset.audioRules?.chain || 'social_loud_clean',
      engineProfile: 'full_studio',
    });
    if (audioResult.ok) {
      finalOutputs.push({ ...output, path: audioResult.outputPath, audioMixed: true });
    } else {
      finalOutputs.push({ ...output, audioMixed: false, audioError: audioResult.error });
    }
  }
  log('audioMix', 'ok');

  // ── STAGE 10: Validate ────────────────────────────────────────────
  log('validation', 'running');
  const validatedOutputs = [];
  for (const output of finalOutputs) {
    try {
      const validation = await validateProfessionalOutput(output.path);
      validatedOutputs.push({ ...output, validation, valid: true });
    } catch (err) {
      validatedOutputs.push({ ...output, valid: false, validationError: err.message });
    }
  }
  log('validation', 'ok', { validCount: validatedOutputs.filter(o => o.valid).length });

  const successOutputs = validatedOutputs.filter(o => o.valid);
  if (!successOutputs.length) {
    return { ok: false, jobId, status: 'failed', stage: 'validation', error: 'Nenhum output passou na validação final.', stages, outputs: validatedOutputs, primaryOutput: null };
  }

  // Save stage report
  await fs.writeFile(path.join(outDir, 'stages.json'), JSON.stringify(stages, null, 2), 'utf-8').catch(() => {});

  return {
    ok: true,
    jobId,
    status: 'done',
    presetId,
    format,
    stages,
    preflight,
    compositionResult,
    outputs: successOutputs,
    primaryOutput: successOutputs[0] || null,
    usedTools: [...new Set(stages.filter(s => s.status === 'ok').map(s => s.stage))],
  };
}

export default { runFullStudioEdit };

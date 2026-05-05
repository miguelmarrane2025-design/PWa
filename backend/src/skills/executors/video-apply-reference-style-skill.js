// skills/executors/video-apply-reference-style-skill.js
import { logger } from '../../lib/logger.js';
import { runProAnalysis } from '../../services/video/pipeline/proAnalysisService.js';
import { buildProfessionalEditPlan } from '../../services/video/pipeline/editPlanService.js';
import { renderProfessionalEditPlan } from '../../services/video/pipeline/proRenderService.js';
import { getProEditingPreset } from '../../services/video/presets/proEditingPresets.js';
import { getVideoProfessionalToolchainStatus } from '../../services/video/toolchain/videoToolchainService.js';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const REFERENCES_BASE = path.resolve(process.cwd(), 'storage/outputs/videos/references');

export async function execute(ctx, params = {}) {
  const sourceVideo = params.sourceVideo || params.videoPath || ctx.arquivos?.[0]?.path || ctx.arquivos?.[0];
  const referenceId = params.referenceId;
  const clipCount = Number(params.clipCount || 1);
  const targetDuration = Number(params.targetDuration || 10);
  const format = params.format || '9:16';

  if (!sourceVideo) {
    return {
      outputs: [{ tipo: 'texto', conteudo: 'Informe sourceVideo (caminho do vídeo fonte) para aplicar o estilo de referência.' }],
    };
  }
  if (!referenceId) {
    return {
      outputs: [{ tipo: 'texto', conteudo: 'Informe referenceId do style-profile gerado por video_reference_style_analyzer.' }],
    };
  }

  try {
    const profilePath = path.join(REFERENCES_BASE, referenceId, 'style-profile.json');
    const profileRaw = await fs.readFile(profilePath, 'utf-8').catch(() => null);
    if (!profileRaw) {
      return {
        outputs: [{ tipo: 'texto', conteudo: `style-profile.json não encontrado para referenceId=${referenceId}. Execute video_reference_style_analyzer primeiro.` }],
      };
    }
    const profile = JSON.parse(profileRaw);

    const presetId = profile.recommendedPreset || 'viral_shorts_aggressive';
    const preset = getProEditingPreset(presetId);

    const analysis = await runProAnalysis({ sourceVideo, targetDuration, preset });

    const toolchain = await getVideoProfessionalToolchainStatus();
    const { scoreHighlights } = await import('../../services/video/pipeline/highlightScorerService.js');
    const highlightsRaw = scoreHighlights(analysis, {
      targetDuration,
      clipCount,
      durationMode: 'normal',
      preset,
      toolchain,
    });
    const clips = Array.isArray(highlightsRaw) ? highlightsRaw : (highlightsRaw?.clips || []);

    const jobId = `ref_${referenceId.slice(0, 8)}_${uuidv4().slice(0, 8)}`;
    const editPlanResult = await buildProfessionalEditPlan({
      jobId,
      sourceVideo,
      highlights: clips,
      presetId,
      format,
    });

    const renderResult = await renderProfessionalEditPlan({
      jobId,
      sourceVideo,
      plan: editPlanResult.plan,
      format,
    });

    const primaryOutput = renderResult.primaryOutput || null;

    const lines = [
      `**Estilo de Referência Aplicado**`,
      `• referenceId: \`${referenceId}\``,
      `• Preset usado: \`${presetId}\``,
      `• jobId: \`${jobId}\``,
      `• Clips renderizados: ${renderResult.outputs?.length || 0}`,
    ];

    if (primaryOutput) {
      lines.push(`• Output principal: ${primaryOutput.fileName || primaryOutput.path || 'gerado'}`);
      lines.push(`• Duração: ${primaryOutput.duration || '?'}s | Tamanho: ${primaryOutput.size || '?'} bytes`);
    }

    return {
      outputs: [{ tipo: 'texto', conteudo: lines.join('\n') }],
      data: renderResult,
      jobId,
      referenceId,
      presetId,
      outputs: renderResult.outputs || [],
      primaryOutput,
    };
  } catch (err) {
    logger.error('[VideoApplyReferenceStyle] ' + err.message);
    return {
      outputs: [{ tipo: 'texto', conteudo: `Erro ao aplicar estilo de referência: ${err.message}` }],
    };
  }
}

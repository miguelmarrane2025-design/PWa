// skills/executors/video-reference-style-analyzer-skill.js
import { logger } from '../../lib/logger.js';
import { runProAnalysis } from '../../services/video/pipeline/proAnalysisService.js';
import { listProEditingPresets, getProEditingPreset } from '../../services/video/presets/proEditingPresets.js';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const REFERENCES_BASE = path.resolve(process.cwd(), 'storage/outputs/videos/references');

function deriveStyleProfile(analysis, category = 'general') {
  const scenes = analysis?.analysis?.scenes || [];
  const peaks = analysis?.analysis?.peaks || [];
  const speechSegs = analysis?.analysis?.speechSegments || [];
  const duration = analysis?.probe?.duration || 1;

  const avgShot = scenes.length > 1
    ? scenes.slice(0, -1).reduce((s, sc, i) => s + (scenes[i + 1].start - sc.start), 0) / (scenes.length - 1)
    : duration;

  const cutPace = avgShot < 2 ? 'fast' : avgShot < 5 ? 'medium' : 'slow';
  const motionScores = (analysis?.analysis?.motionTimeline || []).map(m => m.score || 0);
  const avgMotion = motionScores.length ? motionScores.reduce((a, b) => a + b, 0) / motionScores.length : 0;
  const motionIntensity = avgMotion > 60 ? 'high' : avgMotion > 30 ? 'medium' : 'low';
  const hasSpeech = speechSegs.length > 0;

  const presetMap = {
    sports: 'sports_highlight_pro',
    podcast: 'podcast_clean_pro',
    worship: 'worship_music_pro',
    documentary: 'documentary_standard',
    viral: 'viral_shorts_aggressive',
    general: 'viral_shorts_aggressive',
  };
  const cat = String(category).toLowerCase();

  return {
    cutPace,
    avgShotDuration: Number(avgShot.toFixed(2)),
    captionStyle: hasSpeech ? (cat === 'sports' ? 'sports_impact' : 'phrase_dynamic') : 'none',
    zoomUsage: motionIntensity === 'high' ? 'high' : motionIntensity === 'medium' ? 'medium' : 'low',
    transitionStyle: cutPace === 'fast' ? 'hard_cut' : 'smooth',
    motionIntensity,
    colorLook: cat === 'sports' ? 'sports_hype_contrast' : 'cinematic_warm',
    audioStyle: peaks.length > 5 ? 'sports_impact' : hasSpeech ? 'podcast_clean' : 'music_sync',
    usesFreezeFrame: cat === 'sports',
    usesReplay: cat === 'sports',
    usesPunchZoom: cutPace === 'fast',
    recommendedPreset: presetMap[cat] || presetMap.general,
  };
}

export async function execute(ctx, params = {}) {
  const videoPath = params.videoPath || params.sourceVideo || ctx.arquivos?.[0]?.path || ctx.arquivos?.[0];
  const referenceName = params.referenceName || params.name || 'Referência sem nome';
  const category = params.category || 'general';

  if (!videoPath) {
    return {
      outputs: [{
        tipo: 'texto',
        conteudo: 'Informe videoPath para analisar a referência de estilo.',
      }],
    };
  }

  try {
    const preset = getProEditingPreset('viral_shorts_aggressive');
    const analysis = await runProAnalysis({ sourceVideo: videoPath, targetDuration: 30, preset });
    const styleProfile = deriveStyleProfile(analysis, category);

    const referenceId = uuidv4();
    const refDir = path.join(REFERENCES_BASE, referenceId);
    await fs.mkdir(refDir, { recursive: true });

    const profileData = {
      referenceId,
      name: referenceName,
      category,
      videoPath,
      recommendedPreset: styleProfile.recommendedPreset,
      styleProfile: {
        cutPace: styleProfile.cutPace,
        avgShotDuration: styleProfile.avgShotDuration,
        captionStyle: styleProfile.captionStyle,
        zoomUsage: styleProfile.zoomUsage,
        transitionStyle: styleProfile.transitionStyle,
        motionIntensity: styleProfile.motionIntensity,
        colorLook: styleProfile.colorLook,
        audioStyle: styleProfile.audioStyle,
        usesFreezeFrame: styleProfile.usesFreezeFrame,
        usesReplay: styleProfile.usesReplay,
        usesPunchZoom: styleProfile.usesPunchZoom,
      },
      editRules: {
        targetCutPace: styleProfile.cutPace,
        hookDuration: styleProfile.avgShotDuration < 3 ? 2 : 3,
        captionPosition: 'safe_bottom',
        zoomFrequency: styleProfile.zoomUsage === 'high' ? 'medium_high' : 'low',
        useReplayOnPeaks: category === 'sports',
      },
      analysisJobId: analysis.jobId,
      createdAt: new Date().toISOString(),
    };

    const profilePath = path.join(refDir, 'style-profile.json');
    await fs.writeFile(profilePath, JSON.stringify(profileData, null, 2), 'utf-8');

    const lines = [
      `**Análise de Referência Concluída**`,
      `• referenceId: \`${referenceId}\``,
      `• Preset recomendado: \`${styleProfile.recommendedPreset}\``,
      `• Ritmo de corte: ${styleProfile.cutPace} (avg shot: ${styleProfile.avgShotDuration}s)`,
      `• Intensidade de movimento: ${styleProfile.motionIntensity}`,
      `• Zoom: ${styleProfile.zoomUsage}`,
      `• Transição: ${styleProfile.transitionStyle}`,
      `• Legenda: ${styleProfile.captionStyle}`,
      `• style-profile.json salvo em: ${profilePath}`,
    ];

    return {
      outputs: [{ tipo: 'texto', conteudo: lines.join('\n') }],
      data: profileData,
      referenceId,
      recommendedPreset: styleProfile.recommendedPreset,
      styleProfile: profileData.styleProfile,
      styleProfilePath: profilePath,
    };
  } catch (err) {
    logger.error('[VideoReferenceStyleAnalyzer] ' + err.message);
    return {
      outputs: [{ tipo: 'texto', conteudo: `Erro na análise de referência: ${err.message}` }],
    };
  }
}

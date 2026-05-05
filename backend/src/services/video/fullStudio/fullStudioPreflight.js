// fullStudioPreflight.js — Preflight obrigatório do Full Studio
import { getVideoProfessionalToolchainStatus } from '../toolchain/videoToolchainService.js';

// Ferramentas obrigatórias em QUALQUER preset Full Studio
const FULL_STUDIO_ALWAYS_REQUIRED = ['ffmpeg', 'ffprobe'];

// Ferramentas obrigatórias por preset Full Studio
const PRESET_REQUIRED_TOOLS = {
  sports_broadcast_full_studio: ['ffmpeg', 'ffprobe', 'opencv', 'pyscenedetect', 'yolo', 'librosa', 'imagemagick', 'sox', 'blender'],
  cinematic_trailer_full_studio: ['ffmpeg', 'ffprobe', 'imagemagick', 'blender'],
  worship_atmosphere_full_studio: ['ffmpeg', 'ffprobe', 'librosa', 'natron', 'camilladsp', 'sox', 'blender'],
  podcast_studio_full_studio: ['ffmpeg', 'ffprobe', 'whisper', 'opencv', 'sox'],
  viral_kinetic_full_studio: ['ffmpeg', 'ffprobe', 'whisper', 'imagemagick', 'libvips', 'sox'],
  product_premium_full_studio: ['ffmpeg', 'ffprobe', 'imagemagick', 'libvips', 'sox'],
};

function mapToolAvailability(groups) {
  return {
    ffmpeg: groups.baseVideo?.ffmpeg?.available,
    ffprobe: groups.baseVideo?.ffprobe?.available,
    opencv: groups.analysis?.opencv?.available,
    pyscenedetect: groups.analysis?.pyscenedetect?.available,
    whisper: groups.analysis?.whisper?.available,
    librosa: groups.audio?.librosa?.available,
    yolo: groups.vision?.yolo?.available,
    remotion: groups.motionGraphics?.remotion?.available,
    natron: groups.composition?.natron?.available,
    blender: groups.composition?.blender?.available || groups.motionGraphics?.blender?.available,
    imagemagick: groups.design?.imagemagick?.available,
    libvips: groups.design?.libvips?.available,
    sox: groups.audio?.sox?.available,
    camilladsp: groups.audio?.camilladsp?.available,
    opencolorio: groups.color?.opencolorio?.available,
    gmic: groups.color?.gmic?.available,
    ladspa: groups.audio?.ladspa?.available,
    rubberband: groups.audio?.rubberband?.available,
  };
}

function getInstallHint(toolId) {
  const hints = {
    natron: 'Download NatronRenderer AppImage from natrongithub.org and add to PATH',
    blender: 'sudo apt install blender  OR  snap install blender --classic',
    gmic: 'sudo apt install gmic',
    opencolorio: 'pip install opencolorio  OR  sudo apt install libopencolorio-dev',
    ladspa: 'sudo apt install ladspa-sdk tap-plugins',
    rubberband: 'sudo apt install rubberband-cli',
  };
  return hints[toolId] || `Install ${toolId}`;
}

export async function runFullStudioPreflight({ presetId = null } = {}) {
  const toolchain = await getVideoProfessionalToolchainStatus();
  const groups = toolchain.groups || {};
  const availability = mapToolAvailability(groups);

  const requiredTools = presetId && PRESET_REQUIRED_TOOLS[presetId]
    ? [...new Set([...FULL_STUDIO_ALWAYS_REQUIRED, ...PRESET_REQUIRED_TOOLS[presetId]])]
    : FULL_STUDIO_ALWAYS_REQUIRED;

  const missingRequiredTools = [];
  const installedButNotIntegrated = [];
  const integratedTools = [];
  const blockingReasons = [];
  const nextActions = [];

  for (const toolId of requiredTools) {
    const available = availability[toolId];
    if (available) {
      integratedTools.push(toolId);
    } else {
      missingRequiredTools.push(toolId);
      blockingReasons.push(`${toolId} não encontrado no sistema`);
      nextActions.push({ action: 'install', tool: toolId, hint: getInstallHint(toolId) });
    }
  }

  const ready = missingRequiredTools.length === 0;

  return {
    ok: ready,
    profile: 'full_studio',
    status: ready ? 'ready' : 'blocked',
    ready,
    presetId: presetId || null,
    requiredTools,
    missingRequiredTools,
    installedButNotIntegrated,
    integratedTools,
    blockingReasons,
    nextActions,
    toolAvailability: availability,
  };
}

export default { runFullStudioPreflight };

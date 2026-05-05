// skills/executors/video-full-studio-audio-finisher-skill.js
import { applyAudioMix, listAudioModes } from '../../services/video/audio/proVideoAudioMixService.js';
import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  if (params.listModes) {
    const modes = listAudioModes();
    return { outputs: [{ tipo: 'texto', conteudo: `**Audio Modes disponíveis:**\n${modes.map(m => `• ${m}`).join('\n')}` }], data: { modes } };
  }
  const inputPath = params.inputPath || params.videoPath;
  const outputPath = params.outputPath || (inputPath ? inputPath.replace('.mp4', '_mixed.mp4') : null);
  if (!inputPath || !outputPath) return { outputs: [{ tipo: 'texto', conteudo: 'Informe inputPath.' }] };
  try {
    const result = await applyAudioMix({ inputPath, outputPath, audioMode: params.audioMode || 'social_loud_clean', engineProfile: params.engineProfile || 'pro' });
    const msg = result.ok ? `✅ Audio mix aplicado — modo: ${result.audioMode}\nOutput: ${result.outputPath}` : `❌ Erro: ${result.error}`;
    return { outputs: [{ tipo: 'texto', conteudo: msg }], data: result };
  } catch (err) {
    return { outputs: [{ tipo: 'texto', conteudo: `Erro audio mix: ${err.message}` }] };
  }
}

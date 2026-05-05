// skills/executors/video-full-studio-colorist-skill.js
import { applyColorGrade, listColorProfiles } from '../../services/video/color/proColorGradeService.js';
import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  if (params.listProfiles) {
    const profiles = listColorProfiles();
    return { outputs: [{ tipo: 'texto', conteudo: `**Color Profiles disponíveis:**\n${profiles.map(p => `• ${p.id}`).join('\n')}` }], data: { profiles } };
  }
  const inputPath = params.inputPath || params.sourceVideo || params.videoPath;
  const outputPath = params.outputPath || (inputPath ? inputPath.replace('.mp4', '_graded.mp4') : null);
  if (!inputPath || !outputPath) return { outputs: [{ tipo: 'texto', conteudo: 'Informe inputPath e outputPath.' }] };
  try {
    const result = await applyColorGrade({ inputPath, outputPath, colorPresetId: params.colorPresetId || 'viral_punchy_mobile', engineProfile: params.engineProfile || 'pro' });
    const msg = result.ok ? `✅ Color grade aplicado — preset: ${result.colorPresetId}\nOutput: ${result.outputPath}` : `❌ Erro: ${result.error}`;
    return { outputs: [{ tipo: 'texto', conteudo: msg }], data: result };
  } catch (err) {
    return { outputs: [{ tipo: 'texto', conteudo: `Erro color grade: ${err.message}` }] };
  }
}

// skills/executors/video-full-professional-edit-skill.js
// Fluxo completo: analyze → highlights → editPlan → supervisor → composition → color → audio → render → validation
import { runFullStudioEdit } from '../../services/video/fullStudio/fullStudioEngine.js';
import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  const sourceVideo = params.sourceVideo || params.videoPath || ctx.arquivos?.[0]?.path || ctx.arquivos?.[0];
  if (!sourceVideo) {
    return { outputs: [{ tipo: 'texto', conteudo: 'Informe sourceVideo para a edição profissional completa.' }] };
  }
  try {
    const result = await runFullStudioEdit({
      sourceVideo,
      presetId: params.presetId || 'podcast_studio_full_studio',
      format: params.format || '9:16',
      clipCount: Number(params.clipCount || 1),
      targetDuration: Number(params.targetDuration || 30),
    });
    if (!result.ok) {
      const isBlocked = result.status === 'blocked';
      const lines = [
        isBlocked ? `🔴 **BLOQUEADO — Full Studio**` : `❌ **Falhou — Full Studio**`,
        `• Etapa: ${result.stage || '?'}`,
        ...(result.preflight?.nextActions || []).map(a => `• Instalar ${a.tool}: ${a.hint}`),
        result.error ? `• Erro: ${result.error}` : '',
      ].filter(Boolean);
      return { outputs: [{ tipo: 'texto', conteudo: lines.join('\n') }], data: result };
    }
    const p = result.primaryOutput;
    const lines = [
      `✅ **Edição Profissional Completa — \`${result.jobId}\`**`,
      `• Preset: ${result.presetId} | ${result.outputs?.length} clip(s)`,
      `• Etapas: ${result.stages?.filter(s => s.status === 'ok').map(s => s.stage).join(' → ')}`,
      p ? `• Output: ${p.fileName || p.path} — ${p.duration}s | ${p.videoCodec} | ${((p.size || 0) / 1024 / 1024).toFixed(1)}MB` : '',
    ].filter(Boolean);
    return { outputs: [{ tipo: 'texto', conteudo: lines.join('\n') }], data: result, jobId: result.jobId };
  } catch (err) {
    logger.error('[FullProfessionalEdit] ' + err.message);
    return { outputs: [{ tipo: 'texto', conteudo: `Erro: ${err.message}` }] };
  }
}

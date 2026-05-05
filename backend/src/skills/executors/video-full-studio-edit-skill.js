// skills/executors/video-full-studio-edit-skill.js
import { runFullStudioEdit } from '../../services/video/fullStudio/fullStudioEngine.js';
import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  const sourceVideo = params.sourceVideo || params.videoPath || ctx.arquivos?.[0]?.path || ctx.arquivos?.[0];
  if (!sourceVideo) return { outputs: [{ tipo: 'texto', conteudo: 'Informe sourceVideo para o Full Studio.' }] };
  try {
    const result = await runFullStudioEdit({
      sourceVideo,
      presetId: params.presetId || 'podcast_studio_full_studio',
      format: params.format || '9:16',
      clipCount: Number(params.clipCount || 1),
      targetDuration: Number(params.targetDuration || 30),
    });
    if (!result.ok) {
      const msg = result.status === 'blocked'
        ? `🔴 Full Studio BLOQUEADO na etapa "${result.stage}": ${result.preflight?.blockingReasons?.join('; ') || result.error}`
        : `❌ Full Studio falhou em "${result.stage}": ${result.error}`;
      return { outputs: [{ tipo: 'texto', conteudo: msg }], data: result };
    }
    const primary = result.primaryOutput;
    const lines = [
      `✅ **Full Studio concluído — jobId: \`${result.jobId}\`**`,
      `• Preset: ${result.presetId} | Clips: ${result.outputs?.length}`,
      primary ? `• Output: ${primary.fileName || primary.path} | ${primary.duration}s | ${primary.videoCodec}` : '',
    ].filter(Boolean);
    return { outputs: [{ tipo: 'texto', conteudo: lines.join('\n') }], data: result, jobId: result.jobId };
  } catch (err) {
    logger.error('[FullStudioEdit] ' + err.message);
    return { outputs: [{ tipo: 'texto', conteudo: `Erro Full Studio: ${err.message}` }] };
  }
}

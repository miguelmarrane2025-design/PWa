// skills/executors/video-composition-engine-skill.js
import { runCompositionPipeline } from '../../services/video/composition/proCompositionEngine.js';
import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  const sourceVideo = params.sourceVideo || params.videoPath || ctx.arquivos?.[0]?.path;
  if (!sourceVideo) return { outputs: [{ tipo: 'texto', conteudo: 'Informe sourceVideo.' }] };
  try {
    const { v4: uuidv4 } = await import('uuid');
    const jobId = params.jobId || `comp_${uuidv4().slice(0, 8)}`;
    const result = await runCompositionPipeline({ jobId, sourceVideo, editPlan: params.editPlan || {}, preset: params.preset || {}, requestedLevel: params.requestedLevel || 'pro', format: params.format || '9:16' });
    const lines = [
      `**Composition Engine — ${result.ok ? 'OK' : result.blocked ? 'BLOQUEADO' : 'ERRO'}**`,
      `• Ferramentas usadas: ${(result.usedTools || []).join(', ') || '—'}`,
      `• Fallbacks: ${(result.fallbacks || []).join(', ') || 'nenhum'}`,
      result.blocked ? `• Bloqueios: ${(result.blockingTools || []).map(t => t.tool).join(', ')}` : '',
    ].filter(Boolean);
    return { outputs: [{ tipo: 'texto', conteudo: lines.join('\n') }], data: result };
  } catch (err) {
    return { outputs: [{ tipo: 'texto', conteudo: `Erro composition: ${err.message}` }] };
  }
}

// skills/executors/video-full-studio-preflight-skill.js
import { runFullStudioPreflight } from '../../services/video/fullStudio/fullStudioPreflight.js';
import { logger } from '../../lib/logger.js';

export async function execute(ctx, params = {}) {
  const presetId = params.presetId || null;
  try {
    const result = await runFullStudioPreflight({ presetId });
    const lines = [
      `**Full Studio Preflight — ${result.status.toUpperCase()}**`,
      result.ready ? '✅ Pronto para render Full Studio' : '🔴 BLOQUEADO',
      '',
      `**Ferramentas disponíveis (${result.integratedTools.length}):** ${result.integratedTools.join(', ') || '—'}`,
    ];
    if (result.missingRequiredTools.length) {
      lines.push('', `**Faltando (${result.missingRequiredTools.length}):**`);
      result.nextActions.forEach(a => lines.push(`• ${a.tool}: ${a.hint}`));
    }
    return { outputs: [{ tipo: 'texto', conteudo: lines.join('\n') }], data: result, ready: result.ready };
  } catch (err) {
    logger.error('[FullStudioPreflight] ' + err.message);
    return { outputs: [{ tipo: 'texto', conteudo: `Erro no preflight: ${err.message}` }] };
  }
}

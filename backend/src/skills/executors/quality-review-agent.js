// skills/executors/quality-review-agent.js
// Executor para a skill quality_review.

import { qualityReviewAgent } from '../../agents/reviewers/qualityReviewAgent.js';
import { logger } from '../../lib/logger.js';

export default async function (ctx, params, tools) {
  const request = params.texto || params.topic || ctx?.sessao?.ultimoTexto || '';
  const output  = params.output || params.conteudo || '';
  const domain  = params.domain || params.nicho || 'geral';
  const userId  = ctx?.userId || null;

  logger.info(`[QualityReviewExecutor] domain=${domain} userId=${userId}`);

  try {
    const result = await qualityReviewAgent({
      originalRequest: request,
      output,
      domain,
      userId,
      minScore: params.minScore || 80,
    });

    const passed = result.passed ? '✅ Aprovado' : '❌ Reprovado';
    const notes  = result.notes?.map(n => `• ${n}`).join('\n') || '';
    const fix    = result.mustFix?.map(f => `• ${f}`).join('\n') || '';

    const content = [
      `**Quality Review — Score: ${result.score}/100** ${passed}`,
      result.strengths?.length ? `\n**Pontos fortes:**\n${result.strengths.map(s => `• ${s}`).join('\n')}` : '',
      notes ? `\n**Observações:**\n${notes}` : '',
      fix   ? `\n**Obrigatório corrigir:**\n${fix}` : '',
    ].filter(Boolean).join('\n');

    return {
      outputs:  [{ tipo: 'texto', conteudo: content }],
      metadata: { agent: 'quality_review', score: result.score, passed: result.passed },
    };
  } catch (err) {
    logger.error(`[QualityReviewExecutor] error: ${err.message}`);
    return {
      outputs: [{ tipo: 'texto', conteudo: `❌ Erro na revisão de qualidade: ${err.message}` }],
    };
  }
}

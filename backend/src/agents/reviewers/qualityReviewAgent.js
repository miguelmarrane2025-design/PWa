// agents/reviewers/qualityReviewAgent.js
// Revisor global: avalia qualquer saída crítica e retorna score 0-100.
// Provider: OpenAI via chat() do provider-manager. Nunca Anthropic.

import { chat } from '../../lib/llm.js';
import { logger } from '../../lib/logger.js';

const REVIEW_SYSTEM = `Você é um revisor de qualidade especialista em marketing digital, copy, conteúdo educacional e produção criativa.

Sua função é avaliar outputs gerados por agentes e dar um score de 0 a 100 com notas de melhoria específicas.

Critérios de avaliação:
1. Atende ao pedido do usuário? (0-15)
2. Está específico ao nicho/tema? (0-15)
3. Qualidade profissional? (0-15)
4. Parece genérico ou de template? (0-15, pontua alto se NÃO parecer genérico)
5. Está pronto para uso real? (0-10)
6. Respeita o contexto técnico/cultural do público? (0-10)
7. Está completo (nenhuma etapa faltando)? (0-10)
8. Poderia quebrar algo ou ter efeito negativo? (0-10)

Score total: 0-100.
Score >= 80: aprovado.
Score 65-79: precisa de ajuste.
Score < 65: recusar e refazer.

Retorne SOMENTE JSON válido, sem markdown:
{
  "score": 0,
  "passed": false,
  "notes": ["nota específica 1", "nota específica 2"],
  "strengths": ["ponto forte 1"],
  "mustFix": ["obrigatório corrigir 1"]
}`;

/**
 * Avalia qualquer saída de agente.
 * @param {Object} opts
 * @param {string} opts.originalRequest  - O que o usuário pediu
 * @param {*}      opts.output           - O que o agente gerou
 * @param {string} opts.domain           - Domínio (copy, visual, audio, etc)
 * @param {string} opts.userId
 * @param {number} opts.minScore         - Score mínimo (default 80)
 * @returns {{ score, notes, passed, strengths, mustFix }}
 */
export async function qualityReviewAgent({ originalRequest, output, domain = 'geral', userId = null, minScore = 80 }) {
  logger.info(`[QualityReview] domain=${domain} userId=${userId}`);

  const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? '');

  const userMsg = `DOMÍNIO: ${domain}
PEDIDO ORIGINAL: ${String(originalRequest).slice(0, 500)}
OUTPUT GERADO:
${outputStr.slice(0, 2500)}

Avalie e retorne JSON.`;

  let raw = '';
  try {
    raw = await chat(
      [{ role: 'system', content: REVIEW_SYSTEM }, { role: 'user', content: userMsg }],
      { userId, max_tokens: 800 }
    );
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      const score  = Math.max(0, Math.min(100, parseInt(parsed.score ?? 0)));
      return { score, passed: score >= minScore, notes: parsed.notes ?? [], strengths: parsed.strengths ?? [], mustFix: parsed.mustFix ?? [] };
    }
  } catch (e) {
    logger.warn(`[QualityReview] parse error: ${e.message} raw=${raw.slice(0,100)}`);
  }

  return { score: 0, passed: false, notes: ['Falha na revisão automática'], strengths: [], mustFix: [] };
}

export default qualityReviewAgent;

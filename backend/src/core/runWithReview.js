// core/runWithReview.js
// Motor de revisão: SpecialistAgent → ReviewAgent → RefinerAgent → entrega.
// Usa openaiStrong/chatFast do provider-manager existente.
// NÃO usa Anthropic/Claude. Provider padrão = OpenAI.

import { chat, chatFast } from '../lib/llm.js';
import { agentMemoryService } from '../memory/agentMemoryService.js';
import { logger } from '../lib/logger.js';

/**
 * Executa um ciclo especialista → revisor → refinador.
 *
 * @param {Object} opts
 * @param {Function} opts.specialist  async(input) → { content, raw }
 * @param {Function} opts.reviewer    async(input, draft) → { score, notes, passed }
 * @param {Function} opts.refiner     async(input, draft, notes) → { content, raw }
 * @param {*}        opts.input       Dados de entrada para o especialista
 * @param {number}   opts.minScore    Score mínimo para aprovar (default: 80)
 * @param {number}   opts.maxAttempts Máximo de tentativas (default: 3)
 * @param {string}   opts.memoryKey   ID do agente para salvar na memória
 * @param {string}   opts.userId      ID do usuário
 * @returns {Promise<RunWithReviewResult>}
 */
export async function runWithReview({
  specialist,
  reviewer,
  refiner,
  input,
  minScore    = 80,
  maxAttempts = 3,
  memoryKey   = null,
  userId      = null,
}) {
  let draft       = null;
  let lastScore   = 0;
  let lastNotes   = [];
  let attempts    = 0;
  let approved    = false;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      // 1. Gerar (especialista na 1ª tentativa, refinador nas seguintes)
      if (attempts === 1 || !refiner) {
        logger.info(`[runWithReview] attempt=${attempts} memoryKey=${memoryKey} → specialist`);
        draft = await specialist(input);
      } else {
        logger.info(`[runWithReview] attempt=${attempts} memoryKey=${memoryKey} → refiner (score=${lastScore})`);
        draft = await refiner(input, draft, lastNotes);
      }

      if (!draft) {
        logger.warn(`[runWithReview] attempt=${attempts} got null draft`);
        continue;
      }

      // 2. Revisar
      const review = await reviewer(input, draft);
      lastScore = review.score ?? 0;
      lastNotes = review.notes ?? [];

      logger.info(`[runWithReview] attempt=${attempts} score=${lastScore} passed=${review.passed}`);

      if (review.passed || lastScore >= minScore) {
        approved = true;
        break;
      }

    } catch (err) {
      logger.error(`[runWithReview] attempt=${attempts} error: ${err.message}`);
      if (attempts >= maxAttempts) break;
    }
  }

  const result = {
    ok:           approved || lastScore > 0,
    output:       draft,
    qualityScore: lastScore,
    reviewNotes:  lastNotes,
    attempts,
    approved,
    passed:       approved,
    memoryKey,
  };

  // 3. Salvar na memória
  if (memoryKey) {
    try {
      if (approved) {
        await agentMemoryService.saveApprovedOutput(memoryKey, { input, output: draft, score: lastScore, userId });
      } else {
        await agentMemoryService.saveRejectedOutput(memoryKey, { input, output: draft, score: lastScore, notes: lastNotes, userId });
      }
    } catch (e) {
      logger.warn(`[runWithReview] memory save failed: ${e.message}`);
    }
  }

  return result;
}

/**
 * Utilitário: cria uma função reviewer a partir de um prompt de sistema.
 * O reviewer chama OpenAI e retorna { score, notes, passed }.
 */
export function makeReviewer({ systemPrompt, minScore = 80, userId = null }) {
  return async (input, draft) => {
    const content = typeof draft === 'string' ? draft : JSON.stringify(draft?.content ?? draft ?? '');
    const userMsg = `ENTRADA ORIGINAL:\n${JSON.stringify(input).slice(0, 600)}\n\nSAÍDA GERADA:\n${content.slice(0, 2000)}\n\nAvalie e retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

    let raw = '';
    try {
      raw = await chat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], { userId, max_tokens: 800 });
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        const score  = Math.max(0, Math.min(100, parseInt(parsed.score ?? 0)));
        return { score, notes: parsed.notes ?? [], passed: score >= minScore };
      }
    } catch {}
    return { score: 0, notes: ['Falha na revisão'], passed: false };
  };
}

/**
 * Utilitário: cria um specialist simples a partir de uma função de prompt.
 */
export function makeSpecialist({ systemPrompt, buildUserMsg, userId = null, useFast = false }) {
  return async (input) => {
    const userMsg = buildUserMsg(input);
    const fn = useFast ? chatFast : chat;
    const raw = await fn([{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], { userId, max_tokens: 3000 });
    return { content: raw, raw };
  };
}

export default { runWithReview, makeReviewer, makeSpecialist };

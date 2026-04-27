// src/ai/modelRouter.js
// Roteador inteligente de modelos: decide mini vs strong com base no score e no budget diário.
// Envolve as funções de LLM existentes sem modificá-las.

import { chat, chatFast } from '../lib/llm.js';
import { tokenBudgetManager } from './tokenBudgetManager.js';
import { logger } from '../lib/logger.js';

// ── Regras de roteamento por tarefa ─────────────────────────────────────────
//  'mini'   → modelos rápidos/baratos (gpt-4o-mini, configurados via DEFAULT_MODEL_MINI)
//  'strong' → modelos premium  (gpt-4o, configurados via DEFAULT_MODEL_STRONG)
const TASK_TIER = {
  // Mini por padrão
  carousel_draft:        'mini',
  prompt_first_pass:     'mini',
  slide_organizer:       'mini',
  json_formatter:        'mini',
  short_copy:            'mini',
  simple_variation:      'mini',
  // Strong quando qualidade importa
  prompt_director:       'mini',   // começa mini, escala se score < 65
  prompt_evaluator:      'strong',
  art_direction_premium: 'strong',
  niche_refinement:      'strong',
  copy_strategy:         'strong',
  quality_review:        'strong',
};

async function estimateTokens(messages) {
  const text = messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join(' ');
  return Math.ceil(text.length / 3.5); // ~3.5 chars/token heuristic
}

// ── callMini ─────────────────────────────────────────────────────────────────
async function callMini(messages, opts = {}) {
  const userId = opts.userId ?? null;
  const task   = opts.task   ?? 'mini_task';

  if (!tokenBudgetManager.hasCapacity(userId, 'mini')) {
    logger.warn(`[ModelRouter] mini budget exhausted for user=${userId} — falling back to strong`);
    return callStrong(messages, { ...opts, task: `${task}_forced` });
  }

  logger.info(`[ModelRouter] callMini task=${task} user=${userId}`);
  const result = await chatFast(messages, { ...opts });
  const tokens = await estimateTokens(messages) + Math.ceil((result?.length ?? 0) / 3.5);
  tokenBudgetManager.record(userId, 'mini', tokens, task);
  return result;
}

// ── callStrong ────────────────────────────────────────────────────────────────
async function callStrong(messages, opts = {}) {
  const userId = opts.userId ?? null;
  const task   = opts.task   ?? 'strong_task';

  if (!tokenBudgetManager.hasCapacity(userId, 'strong')) {
    logger.warn(`[ModelRouter] strong budget exhausted for user=${userId} — falling back to mini`);
    return callMini(messages, { ...opts, task: `${task}_downgraded` });
  }

  logger.info(`[ModelRouter] callStrong task=${task} user=${userId}`);
  const result = await chat(messages, { ...opts });
  const tokens = await estimateTokens(messages) + Math.ceil((result?.length ?? 0) / 3.5);
  tokenBudgetManager.record(userId, 'strong', tokens, task);
  return result;
}

// ── callAuto: escolhe tier automaticamente pela tarefa ────────────────────────
async function callAuto(taskKey, messages, opts = {}) {
  const tier = TASK_TIER[taskKey] ?? 'mini';
  if (tier === 'strong') return callStrong(messages, { ...opts, task: taskKey });
  return callMini(messages, { ...opts, task: taskKey });
}

export const modelRouter = { callMini, callStrong, callAuto, TASK_TIER };

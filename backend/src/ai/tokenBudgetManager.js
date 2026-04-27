// src/ai/tokenBudgetManager.js
import { logger } from '../lib/logger.js';

const DEFAULTS = {
  strongDailyLimit: parseInt(process.env.TOKEN_LIMIT_STRONG || '250000'),
  miniDailyLimit:   parseInt(process.env.TOKEN_LIMIT_MINI   || '2500000'),
};

const budgets = new Map();

function todayStr() { return new Date().toISOString().slice(0, 10); }

function getOrCreate(userId) {
  const today = todayStr();
  let b = budgets.get(userId);
  if (!b || b.date !== today) { b = { date: today, strongUsed: 0, miniUsed: 0, tasks: [] }; budgets.set(userId, b); }
  return b;
}

export const tokenBudgetManager = {
  record(userId, tier, tokens, taskLabel = '') {
    const b = getOrCreate(userId);
    if (tier === 'strong') b.strongUsed += tokens; else b.miniUsed += tokens;
    b.tasks.push({ ts: Date.now(), tier, tokens, task: taskLabel });
    if (b.tasks.length > 50) b.tasks.shift();
    logger.info(`[TokenBudget] user=${userId} tier=${tier} +${tokens} | strong=${b.strongUsed}/${DEFAULTS.strongDailyLimit} mini=${b.miniUsed}/${DEFAULTS.miniDailyLimit}`);
  },
  hasCapacity(userId, tier) {
    const b = getOrCreate(userId);
    return tier === 'strong' ? b.strongUsed < DEFAULTS.strongDailyLimit : b.miniUsed < DEFAULTS.miniDailyLimit;
  },
  getSummary(userId) {
    const b = getOrCreate(userId);
    const topTask = b.tasks.reduce((acc, t) => (!acc || t.tokens > acc.tokens) ? t : acc, null);
    return {
      date: b.date,
      strong: { used: b.strongUsed, limit: DEFAULTS.strongDailyLimit, pct: Math.round(b.strongUsed / DEFAULTS.strongDailyLimit * 100) },
      mini:   { used: b.miniUsed,   limit: DEFAULTS.miniDailyLimit,   pct: Math.round(b.miniUsed / DEFAULTS.miniDailyLimit * 100) },
      tasks: b.tasks.slice(-10), topTask,
    };
  },
  reset(userId) { budgets.delete(userId); },
};

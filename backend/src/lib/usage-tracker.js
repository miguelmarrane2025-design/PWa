// lib/usage-tracker.js
// ─────────────────────────────────────────────────────────────────────────
// Per-user AI token consumption tracking.
// Uses an in-memory Map with Postgres persistence (write-through, async).
//
// Integrates with provider-manager: called after every successful AI call.
// Quota enforcement: rejects calls when daily limit exceeded.
//
// Default daily limit: 500,000 tokens (configurable via DAILY_TOKEN_LIMIT env)
// Reset: midnight UTC daily (via periodic cleanup)
// ─────────────────────────────────────────────────────────────────────────

import { query }  from '../db/index.js';
import { logger } from './logger.js';

const DAILY_LIMIT = parseInt(process.env.DAILY_TOKEN_LIMIT || '500000');

// In-memory counters: userId → { tokens, date, warned }
const _counters = new Map();

function _todayKey() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function _get(userId) {
  const today = _todayKey();
  let entry = _counters.get(userId);
  if (!entry || entry.date !== today) {
    entry = { tokens: 0, date: today, warned: false };
    _counters.set(userId, entry);
  }
  return entry;
}

/**
 * Record token usage after a successful AI call.
 * @param {string|null} userId
 * @param {number}      tokens   — total_tokens from API response
 * @param {string}      provider
 * @param {string}      model
 */
export async function recordUsage(userId, tokens, provider = 'openai', model = '') {
  if (!userId || !tokens) return;
  const entry = _get(userId);
  entry.tokens += tokens;

  // Async DB write — fire and forget, never blocks the AI response
  query(
    `INSERT INTO usage_log (user_id, provider, model, tokens, logged_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT DO NOTHING`,
    [userId, provider, model, tokens],
  ).catch(() => {});  // table may not exist yet — silent fail

  if (entry.tokens > DAILY_LIMIT * 0.8 && !entry.warned) {
    entry.warned = true;
    logger.warn(`[UsageTracker] user=${userId} at ${Math.round(entry.tokens/DAILY_LIMIT*100)}% daily limit`);
  }
}

/**
 * Check if user is within daily limit.
 * Returns { allowed: bool, used: number, limit: number, remaining: number }
 */
export function checkQuota(userId) {
  if (!userId) return { allowed: true, used: 0, limit: DAILY_LIMIT, remaining: DAILY_LIMIT };
  const entry = _get(userId);
  const remaining = Math.max(0, DAILY_LIMIT - entry.tokens);
  return {
    allowed:   entry.tokens < DAILY_LIMIT,
    used:      entry.tokens,
    limit:     DAILY_LIMIT,
    remaining,
    resetAt:   `${_todayKey()}T23:59:59Z`,
  };
}

/**
 * Get usage for a user (for API endpoint).
 */
export function getUsage(userId) {
  return checkQuota(userId);
}

// Prune old in-memory entries every hour
setInterval(() => {
  const today = _todayKey();
  for (const [uid, entry] of _counters) {
    if (entry.date !== today) _counters.delete(uid);
  }
}, 60 * 60 * 1000).unref();

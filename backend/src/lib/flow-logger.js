// lib/flow-logger.js
// Structured per-flow logger. Wraps winston with flow context tags.
// Usage: flowLog('chat', 'info', 'message sent', { userId, tokens: 320 })
//        flowLog('video', 'warn', 'ffmpeg slow', { jobId, elapsed: 12000 })

import { logger } from './logger.js';

const FLOWS = new Set(['chat', 'audio', 'video', 'research', 'hunter', 'skill', 'provider', 'auth']);

/**
 * @param {'chat'|'audio'|'video'|'research'|'hunter'|'skill'|'provider'|'auth'} flow
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object} [meta]
 */
export function flowLog(flow, level, message, meta = {}) {
  const tag = FLOWS.has(flow) ? flow : 'misc';
  const metaStr = Object.keys(meta).length
    ? ' ' + Object.entries(meta).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join(' ')
    : '';
  logger[level](`[${tag.toUpperCase()}] ${message}${metaStr}`);
}

/**
 * Express middleware: tags each request with its flow label.
 * Adds req.flowLog(level, message, meta) helper.
 */
export function flowMiddleware(flow) {
  return (req, res, next) => {
    req.flowLog = (level, msg, meta = {}) =>
      flowLog(flow, level, msg, { userId: req.user?.id, ...meta });
    next();
  };
}

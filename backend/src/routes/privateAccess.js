import { Router } from 'express';
import { clearPrivateAccessCookie, setPrivateAccessCookie } from '../auth/privateAccessGuard.js';
import { logger } from '../lib/logger.js';

export const privateAccessRouter = Router();

const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

privateAccessRouter.post('/private-access', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts' });
  }

  const expected = process.env.APP_ACCESS_TOKEN;
  const token = String(req.body?.token || '').trim();
  if (!expected) {
    return res.status(503).json({ ok: false, error: 'Service not configured' });
  }
  if (!token || token !== expected) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }

  attempts.delete(ip);
  setPrivateAccessCookie(res);
  logger.info(`[PrivateAccess] granted ip=${ip}`);
  return res.json({ ok: true });
});

privateAccessRouter.post('/private-logout', (_req, res) => {
  clearPrivateAccessCookie(res);
  return res.json({ ok: true });
});

export default privateAccessRouter;

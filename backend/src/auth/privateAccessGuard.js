import { createHmac } from 'crypto';
import { logger } from '../lib/logger.js';

const PRIVATE_MODE = process.env.APP_PRIVATE_MODE === 'true';
const COOKIE_NAME = process.env.APP_ACCESS_COOKIE_NAME || 'botsquad_private_access';
const SESSION_HOURS = Number.parseInt(process.env.APP_ACCESS_SESSION_HOURS || '24', 10) || 24;

const PUBLIC_PATHS = [
  '/health',
  '/api/health',
  '/auth/private-access',
  '/api/auth/private-access',
  '/auth/private-logout',
  '/api/auth/private-logout',
  '/auth/login',
  '/api/auth/login',
  '/auth/register',
  '/api/auth/register',
  '/auth/forgot-password',
  '/api/auth/forgot-password',
  '/auth/reset-password',
  '/api/auth/reset-password',
  '/login',
  '/forgot-password',
  '/reset-password',
];

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map(chunk => chunk.trim())
      .filter(Boolean)
      .map(chunk => {
        const index = chunk.indexOf('=');
        const key = index >= 0 ? chunk.slice(0, index).trim() : chunk.trim();
        const value = index >= 0 ? chunk.slice(index + 1).trim() : '';
        return [key, decodeURIComponent(value)];
      }),
  );
}

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/assets/')
    || pathname === '/favicon.ico'
    || pathname === '/manifest.webmanifest'
    || pathname === '/robots.txt'
    || /\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2|ttf|map|html|webmanifest|txt)$/i.test(pathname)
  );
}

function signedCookieValue() {
  const secret = process.env.APP_ACCESS_TOKEN || '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret)
    .update(`botsquad_access:${timestamp}`)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

function verifyCookieValue(value) {
  if (!value) return false;
  const secret = process.env.APP_ACCESS_TOKEN || '';
  const [timestamp, signature] = String(value).split('.');
  if (!timestamp || !signature || !secret) return false;
  const expected = createHmac('sha256', secret)
    .update(`botsquad_access:${timestamp}`)
    .digest('hex');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  if (diff !== 0) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - Number.parseInt(timestamp, 10);
  return ageSeconds >= 0 && ageSeconds <= SESSION_HOURS * 3600;
}

export function privateAccessGuard(req, res, next) {
  if (!PRIVATE_MODE) return next();
  if (isPublicPath(req.path) || isStaticAsset(req.path)) return next();

  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) {
    logger.warn('[PrivateAccessGuard] APP_ACCESS_TOKEN not configured while private mode is enabled');
    return res.status(503).json({ ok: false, error: 'Service not configured', code: 'not_configured' });
  }

  const cookies = parseCookies(req.headers.cookie);
  if (!verifyCookieValue(cookies[COOKIE_NAME])) {
    return res.status(401).json({ ok: false, error: 'Private access required', code: 'private_access_required' });
  }

  return next();
}

export function setPrivateAccessCookie(res) {
  res.cookie(COOKIE_NAME, signedCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
}

export function clearPrivateAccessCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export default {
  privateAccessGuard,
  setPrivateAccessCookie,
  clearPrivateAccessCookie,
};

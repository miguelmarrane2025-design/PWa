// routes/drive.js
// Google Drive integration — OAuth tokens persisted per user in DB.

import { Router }  from 'express';
import { google }  from 'googleapis';
import { requireAuth } from '../middleware/auth.js';
import { query }   from '../db/index.js';
import { config }  from '../config/index.js';
import { logger }  from '../lib/logger.js';

const router = Router();

function getOAuth2Client(tokens = null) {
  const client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
  if (tokens) client.setCredentials(tokens);
  return client;
}

// ── GET /drive/status ─────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  if (!config.google.clientId) {
    return res.json({ configured: false, message: 'Google Drive not configured in .env' });
  }
  const { rows } = await query(
    "SELECT id, updated_at FROM user_api_keys WHERE user_id=$1 AND provider='google_drive'",
    [req.user.id],
  );
  res.json({ configured: rows.length > 0, connected: rows.length > 0 });
});

// ── GET /drive/auth ───────────────────────────────────────────────────────
router.get('/auth', requireAuth, (req, res) => {
  if (!config.google.clientId) {
    return res.status(503).json({ error: 'Google Drive not configured — add GOOGLE_CLIENT_ID to .env' });
  }
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope:       ['https://www.googleapis.com/auth/drive'],
    state:       req.user.id,
  });
  res.json({ url });
});

// ── GET /drive/callback ───────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send('Missing code or state');

  try {
    const oauth2   = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    // Persist tokens in DB
    await query(
      `INSERT INTO user_api_keys (user_id, provider, api_key, verified)
       VALUES ($1, 'google_drive', $2, TRUE)
       ON CONFLICT (user_id, provider) DO UPDATE SET api_key = $2, verified = TRUE, updated_at = NOW()`,
      [userId, JSON.stringify(tokens)],
    );

    logger.info(`[Drive] Token saved for user ${userId}`);
    // Redirect to frontend (different origin than backend)
    const frontendUrl = process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/integrations?drive=connected`);
  } catch (err) {
    logger.error(`[Drive] Callback error: ${err.message}`);
    res.status(500).json({ error: 'Falha na autenticação OAuth.' });
  }
});

// ── GET /drive/files ──────────────────────────────────────────────────────
router.get('/files', requireAuth, async (req, res) => {
  const { rows } = await query(
    "SELECT api_key FROM user_api_keys WHERE user_id=$1 AND provider='google_drive' AND verified=TRUE",
    [req.user.id],
  );
  if (!rows.length) return res.status(401).json({ error: 'Google Drive not connected. Go to /drive/auth first.' });

  try {
    const tokens = JSON.parse(rows[0].api_key);
    const oauth2 = getOAuth2Client(tokens);
    const drive  = google.drive({ version: 'v3', auth: oauth2 });

    const response = await drive.files.list({
      pageSize: 30,
      fields:   'files(id, name, mimeType, modifiedTime, size)',
      q:        "trashed=false",
    });

    res.json(response.data.files);
  } catch (err) {
    logger.error(`[Drive] files error: ${err.message}`);
    res.status(500).json({ error: 'Erro ao acessar Google Drive.' });
  }
});

// ── DELETE /drive/disconnect ──────────────────────────────────────────────
router.delete('/disconnect', requireAuth, async (req, res) => {
  await query(
    "DELETE FROM user_api_keys WHERE user_id=$1 AND provider='google_drive'",
    [req.user.id],
  );
  res.status(204).end();
});

export default router;

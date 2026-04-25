// routes/social.js
// Endpoints para análise de perfis sociais.
// GET /social/profile?platform=youtube&q=@canal
// GET /social/profile?platform=instagram&q=@perfil
// GET /social/profile?platform=tiktok&q=@perfil

import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { analyzeProfile } from '../integrations/social-apis.js';
import { logger }      from '../lib/logger.js';

const router = Router();

// ── GET /social/profile ───────────────────────────────────────────────────
router.get('/profile', requireAuth, async (req, res) => {
  const { platform, q } = req.query;

  if (!platform || !q) {
    return res.status(400).json({ error: 'platform and q are required. Example: ?platform=youtube&q=@canal' });
  }

  const allowed = ['youtube', 'instagram', 'tiktok'];
  if (!allowed.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${allowed.join(', ')}` });
  }

  try {
    const data = await analyzeProfile({ platform, identifier: q, userId: req.user.id });
    res.json(data);
  } catch (err) {
    logger.error(`[Social] Profile analysis error: ${err.message}`);
    res.status(500).json({ error: 'Erro ao buscar perfil. Verifique a chave da API.' });
  }
});

// ── GET /social/keys/status ───────────────────────────────────────────────
// Returns which social API keys are configured for this user
router.get('/keys/status', requireAuth, async (req, res) => {
  const { query: dbQuery } = await import('../db/index.js');
  const { rows } = await dbQuery(
    `SELECT provider, verified FROM user_api_keys
     WHERE user_id = $1 AND provider IN ('youtube', 'rapidapi')`,
    [req.user.id],
  );

  res.json({
    youtube:  rows.some(r => r.provider === 'youtube'  && r.verified),
    rapidapi: rows.some(r => r.provider === 'rapidapi' && r.verified),
    note: {
      youtube:  'Gratuito — YouTube Data API v3. Obtém dados reais de qualquer canal.',
      rapidapi: 'Pago (~$10/mês) — RapidAPI. Habilita análise de Instagram e TikTok de terceiros.',
    },
  });
});

export default router;

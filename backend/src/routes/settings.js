// routes/settings.js — v17
// Manages all user API keys and provider config.
// Supports multiple keys per provider (key_slot 0, 1, 2…).
// Model list comes from provider-manager, not hardcoded.

import { Router }           from 'express';
import { requireAuth }      from '../middleware/auth.js';
import { query }            from '../db/index.js';
import { logger }           from '../lib/logger.js';
import { encrypt }          from '../lib/crypto.js';
import {
  invalidateClientCache,
  verifyKey,
  listModels,
} from '../lib/provider-manager.js';
import { getUsage } from '../lib/usage-tracker.js';
import {
  GENERIC_KEY_PROVIDERS,
  getSettingsProviderCatalog,
} from '../lib/settings-catalog.js';
import axios from 'axios';

const router = Router();

// ── Helper: save / upsert one key slot ────────────────────────────────────
async function _saveKey(userId, provider, apiKey, model, slot = 0) {
  const { valid, model: detectedModel, error } = await verifyKey(apiKey, provider);
  if (!valid) throw Object.assign(new Error(error || 'Chave inválida'), { status: 400 });

  const finalModel  = model || detectedModel;
  const encryptedKey = encrypt(apiKey);

  const { rows } = await query(
    `INSERT INTO user_api_keys (user_id, provider, api_key, model, verified, key_slot)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     ON CONFLICT (user_id, provider, key_slot)
     DO UPDATE SET api_key = $3, model = $4, verified = TRUE, updated_at = NOW()
     RETURNING id, provider, model, verified, updated_at, key_slot,
               LEFT(api_key, 4) || '...' AS key_preview`,
    [userId, provider, encryptedKey, finalModel, slot],
  );

  // Upsert into user_providers
  await query(
    `INSERT INTO user_providers (user_id, provider, active)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (user_id, provider) DO UPDATE SET active = TRUE`,
    [userId, provider],
  );

  invalidateClientCache(userId);
  return rows[0];
}

async function _saveGenericKey(userId, provider, apiKey, model, slot = 0) {
  if (!apiKey?.trim()) throw Object.assign(new Error('Chave inválida'), { status: 400 });

  const encryptedKey = encrypt(apiKey.trim());

  const { rows } = await query(
    `INSERT INTO user_api_keys (user_id, provider, api_key, model, verified, key_slot)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     ON CONFLICT (user_id, provider, key_slot)
     DO UPDATE SET api_key = $3, model = $4, verified = TRUE, updated_at = NOW()
     RETURNING id, provider, model, verified, updated_at, key_slot,
               LEFT(api_key, 4) || '...' AS key_preview`,
    [userId, provider, encryptedKey, model || null, slot],
  );

  await query(
    `INSERT INTO user_providers (user_id, provider, active)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (user_id, provider) DO UPDATE SET active = TRUE`,
    [userId, provider],
  );

  invalidateClientCache(userId);
  return rows[0];
}

// ── GET /settings/providers — catalog of all supported providers ──────────
router.get('/providers', requireAuth, async (req, res) => {
  const catalog = getSettingsProviderCatalog();

  // Merge with user's configured keys
  const { rows } = await query(
    `SELECT provider, COUNT(*) AS key_count, MAX(verified::int) AS has_verified
     FROM user_api_keys WHERE user_id = $1 GROUP BY provider`,
    [req.user.id],
  );
  const byProvider = Object.fromEntries(rows.map(r => [r.provider, r]));
  const { rows: providerRows } = await query(
    `SELECT provider, active, priority
     FROM user_providers WHERE user_id = $1`,
    [req.user.id],
  );
  const providerFlags = Object.fromEntries(providerRows.map(r => [r.provider, r]));

  res.json(catalog.map(p => ({
    ...p,
    keyCount:    parseInt(byProvider[p.id]?.key_count ?? 0),
    hasVerified: !!(byProvider[p.id]?.has_verified),
    active:      !!providerFlags[p.id]?.active,
    priority:    parseInt(providerFlags[p.id]?.priority ?? 0),
  })));
});

// ── GET /settings/apikeys — all keys for user (masked) ───────────────────
router.get('/apikeys', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, provider, model, verified, updated_at, key_slot,
            LEFT(api_key, 4) || '...' AS key_preview
     FROM user_api_keys WHERE user_id = $1 ORDER BY provider, key_slot`,
    [req.user.id],
  );
  res.json(rows);
});

// ── GET /settings/apikeys/status ─────────────────────────────────────────
router.get('/apikeys/status', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT provider, model, verified FROM user_api_keys WHERE user_id = $1',
    [req.user.id],
  );
  res.json({
    configured: rows.some(r => r.verified),
    keys: rows,
  });
});

// ── GET /settings/models?provider=openai&key=sk-... ───────────────────────
// Returns live model list from the provider. Used by frontend to populate dropdown.
router.get('/models', requireAuth, async (req, res) => {
  const { provider = 'openai', key: apiKey } = req.query;

  if (!apiKey) {
    // Return the provider-manager default list without hitting API
    const { rows } = await query(
      `SELECT DISTINCT model FROM user_api_keys
       WHERE user_id = $1 AND provider = $2 AND verified = TRUE`,
      [req.user.id, provider],
    );
    return res.json({ models: rows.map(r => r.model).filter(Boolean) });
  }

  if (GENERIC_KEY_PROVIDERS.has(provider)) {
    return res.json({ models: [] });
  }

  try {
    const models = await listModels(apiKey, provider);
    res.json({ models });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /settings/apikeys — add / replace a key ─────────────────────────
// Body: { provider, api_key, model?, slot? }
router.post('/apikeys', requireAuth, async (req, res) => {
  const { provider = 'openai', api_key, model, slot = 0 } = req.body;

  // YouTube key has different verification (not OpenAI-compatible)
  if (provider === 'youtube') {
    return _saveYouTubeKey(req, res, api_key);
  }

  if (provider === 'ollama') {
    const ollamaHost = (api_key?.trim() && api_key.trim() !== 'local')
      ? api_key.trim()
      : (process.env.OLLAMA_HOST || 'http://localhost:11434');
    try {
      const { valid, model: detectedModel, info, error } = await verifyKey(ollamaHost, 'ollama');
      if (!valid) return res.status(400).json({ error });

      const finalModel = model || detectedModel || 'gemma3:27b';
      const saved = await _saveGenericKey(req.user.id, 'ollama', ollamaHost, finalModel, parseInt(slot));
      logger.info(`[SETTINGS] Ollama configured user=${req.user.id} host=${ollamaHost} model=${finalModel}`);
      return res.json({ ...saved, info });
    } catch (err) {
      return res.status(err.status ?? 500).json({ error: err.message });
    }
  }

  if (!api_key?.trim()) return res.status(400).json({ error: 'api_key obrigatório' });

  if (GENERIC_KEY_PROVIDERS.has(provider)) {
    try {
      const saved = await _saveGenericKey(req.user.id, provider, api_key, model, parseInt(slot));
      return res.json(saved);
    } catch (err) {
      return res.status(err.status ?? 500).json({ error: err.message });
    }
  }

  try {
    const saved = await _saveKey(req.user.id, provider, api_key.trim(), model, parseInt(slot));
    res.json(saved);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── PATCH /settings/apikeys/:provider/model ───────────────────────────────
router.patch('/apikeys/:provider/model', requireAuth, async (req, res) => {
  const { model } = req.body;
  const { provider } = req.params;

  await query(
    `UPDATE user_api_keys SET model = $1, updated_at = NOW()
     WHERE user_id = $2 AND provider = $3`,
    [model, req.user.id, provider],
  );
  invalidateClientCache(req.user.id);
  res.json({ ok: true, model });
});

// ── DELETE /settings/apikeys/:provider — removes ALL slots ───────────────
router.delete('/apikeys/:provider', requireAuth, async (req, res) => {
  await query(
    'DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2',
    [req.user.id, req.params.provider],
  );
  await query(
    'DELETE FROM user_providers WHERE user_id = $1 AND provider = $2',
    [req.user.id, req.params.provider],
  );
  invalidateClientCache(req.user.id);
  res.status(204).end();
});

// ── PATCH /settings/providers/:provider — toggle active state ─────────────
router.patch('/providers/:provider', requireAuth, async (req, res) => {
  const { provider } = req.params;
  const active = req.body?.active !== false;
  const priority = Number.isFinite(Number(req.body?.priority)) ? Number(req.body.priority) : 0;

  await query(
    `INSERT INTO user_providers (user_id, provider, active, priority)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, provider)
     DO UPDATE SET active = $3, priority = $4`,
    [req.user.id, provider, active, priority],
  );

  res.json({ ok: true, provider, active, priority });
});

// ── DELETE /settings/apikeys/:provider/:slot — removes one slot ───────────
router.delete('/apikeys/:provider/:slot', requireAuth, async (req, res) => {
  await query(
    'DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2 AND key_slot = $3',
    [req.user.id, req.params.provider, parseInt(req.params.slot)],
  );
  invalidateClientCache(req.user.id);
  res.status(204).end();
});

// ── GET /settings/ollama/status — checks local/self-hosted Ollama ─────────
router.get('/ollama/status', requireAuth, async (req, res) => {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  try {
    const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return res.json({ running: false, host, error: `HTTP ${r.status}` });
    const data = await r.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      isGemma: /gemma/i.test(m.name),
    }));
    res.json({
      running: true,
      host,
      models,
      gemmaModels: models.filter(m => m.isGemma).map(m => m.name),
      installCmd: 'ollama pull gemma3:27b',
    });
  } catch (err) {
    res.json({
      running: false,
      host,
      error: err.message,
      installHint: 'Instale o Ollama e execute: ollama pull gemma3:27b',
    });
  }
});

// ── YouTube key (special: not LLM) ───────────────────────────────────────
async function _saveYouTubeKey(req, res, api_key) {
  if (!api_key || api_key.length < 20) {
    return res.status(400).json({ error: 'Chave inválida' });
  }
  try {
    await axios.get(
      `https://www.googleapis.com/youtube/v3/search?part=id&q=test&maxResults=1&key=${api_key}`,
      { timeout: 8000 },
    );
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 400) {
      return res.status(400).json({ error: 'YouTube API key inválida ou sem quota' });
    }
  }
  const encryptedKey = encrypt(api_key);
  const { rows } = await query(
    `INSERT INTO user_api_keys (user_id, provider, api_key, verified, key_slot)
     VALUES ($1, 'youtube', $2, TRUE, 0)
     ON CONFLICT (user_id, provider, key_slot)
     DO UPDATE SET api_key = $2, verified = TRUE, updated_at = NOW()
     RETURNING id, provider, verified, updated_at, 'yt-...' AS key_preview`,
    [req.user.id, encryptedKey],
  );
  return res.json(rows[0]);
}

// ── GET /settings/usage — token consumption for today ────────────────────
router.get('/usage', requireAuth, (req, res) => {
  res.json(getUsage(req.user.id));
});

export default router;

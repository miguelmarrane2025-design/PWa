// lib/provider-manager.js
// ─────────────────────────────────────────────────────────────────────────────
// Central AI Provider Manager — BotSquad v17
//
// SINGLE SOURCE OF TRUTH for all LLM calls in the system.
// No agent, skill, or module should instantiate a provider client directly.
//
// Features:
//   • Multi-key per provider (round-robin + daily-limit rotation)
//   • Automatic fallback: key A fails → key B → env fallback
//   • Exponential backoff with jitter on rate limits / server errors
//   • Structured per-request logging (provider / model / key index / tokens)
//   • Pluggable provider registry — add OpenRouter, Anthropic, Groq, etc.
//   • Backward-compatible: exports the same `chat`, `embed`, `transcribe`,
//     `generateImage`, `getClientForUser`, `invalidateClientCache` API
//     that llm.js already exposes, so zero changes needed in existing callers.
//
// Supported providers (ready to wire):
//   openai      ✅ fully wired
//   openrouter  ✅ adapter ready, needs OPENROUTER_API_KEY
//   anthropic   ✅ adapter ready, needs ANTHROPIC_API_KEY
//   gemini      ✅ adapter ready, needs GEMINI_API_KEY / Gemma via Google AI API
//   groq        ✅ adapter ready, needs GROQ_API_KEY
//   xai         ✅ adapter ready
//   deepseek    ✅ adapter ready
//   ollama      ✅ local Gemma via Ollama
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI        from 'openai';
import { query }     from '../db/index.js';
import { logger }    from './logger.js';
import { decrypt }   from './crypto.js';
import { recordUsage, checkQuota } from './usage-tracker.js';

// ── Constants ─────────────────────────────────────────────────────────────
const MAX_RETRIES  = parseInt(process.env.OPENAI_MAX_RETRIES || '3');
const BASE_DELAY   = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

function buildTokenLimitOptions(model, maxTokens) {
  const normalized = String(model || '').toLowerCase();
  const value = maxTokens ?? 2048;
  if (/^(gpt-5|o1|o3|o4)/i.test(normalized)) {
    return { max_completion_tokens: value };
  }
  return { max_tokens: value };
}

// ── Provider registry ──────────────────────────────────────────────────────
// Each provider entry has:
//   envKey:      env var for a global fallback key
//   envModel:    env var for default model
//   defaultModel:hardcoded default if envModel not set
//   buildClient: (apiKey) → { client, completions(msgs, opts) }
//   fastModel:   cheaper/faster model for that provider
//   embedModel:  embedding model (only openai for now)
const PROVIDERS = {
  openai: {
    envKey:       'OPENAI_API_KEY',
    envModel:     'OPENAI_MODEL',
    // Strong model: gpt-4o → gpt-4.1 → gpt-4.1-mini fallback chain via env
    defaultModel: process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL_STRONG || 'gpt-4o',
    fastModel:    process.env.OPENAI_MODEL_FAST || process.env.DEFAULT_MODEL_MINI || 'gpt-4o-mini',
    embedModel:   process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    buildClient(apiKey) {
      const oa = new OpenAI({ apiKey, timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000') });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const res = await oa.chat.completions.create({
            model:       opts.model,
            messages,
            temperature: opts.temperature ?? 0.7,
            ...buildTokenLimitOptions(opts.model, opts.max_tokens ?? 2048),
          });
          return {
            content: res.choices[0]?.message?.content ?? '',
            usage:   res.usage,
          };
        },
      };
    },
  },

  // ── OpenRouter (multi-model gateway) ──────────────────────────────────
  openrouter: {
    envKey:       'OPENROUTER_API_KEY',
    envModel:     'OPENROUTER_MODEL',
    defaultModel: 'openai/gpt-4o',
    fastModel:    'openai/gpt-4o-mini',
    buildClient(apiKey) {
      const oa = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: { 'HTTP-Referer': 'https://botsquad.app', 'X-Title': 'BotSquad' },
        timeout: 90000,
      });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const res = await oa.chat.completions.create({
            model: opts.model, messages,
            max_tokens: opts.max_tokens ?? 2048, temperature: opts.temperature ?? 0.7,
          });
          return { content: res.choices[0]?.message?.content ?? '', usage: res.usage };
        },
      };
    },
  },

  // ── Anthropic (Claude) ─────────────────────────────────────────────────
  anthropic: {
    envKey:       'ANTHROPIC_API_KEY',
    envModel:     'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-6',
    fastModel:    'claude-haiku-4-5-20251001',
    buildClient(apiKey) {
      // Uses OpenAI-compatible API via proxy — replace with @anthropic-ai/sdk when ready
      const oa = new OpenAI({ apiKey, baseURL: 'https://api.anthropic.com/v1', timeout: 90000,
        defaultHeaders: { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey } });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const res = await oa.chat.completions.create({
            model: opts.model, messages,
            max_tokens: opts.max_tokens ?? 2048, temperature: opts.temperature ?? 0.7,
          });
          return { content: res.choices[0]?.message?.content ?? '', usage: res.usage };
        },
      };
    },
  },

  // ── Groq (ultra-fast inference) ────────────────────────────────────────
  groq: {
    envKey:       'GROQ_API_KEY',
    envModel:     'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    fastModel:    'llama-3.1-8b-instant',
    buildClient(apiKey) {
      const oa = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1', timeout: 30000 });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const res = await oa.chat.completions.create({
            model: opts.model, messages,
            max_tokens: opts.max_tokens ?? 2048, temperature: opts.temperature ?? 0.7,
          });
          return { content: res.choices[0]?.message?.content ?? '', usage: res.usage };
        },
      };
    },
  },

  // ── Gemini via OpenAI-compatible endpoint ──────────────────────────────
  gemini: {
    envKey:       'GEMINI_API_KEY',
    envModel:     'GEMINI_MODEL',
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    fastModel:    process.env.GEMINI_MODEL_FAST || 'gemma-3-27b-it',
    buildClient(apiKey) {
      const oa = new OpenAI({
        apiKey,
        baseURL: `https://generativelanguage.googleapis.com/v1beta/openai`,
        timeout: 90000,
      });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const model = opts.model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
          const msgs = model.startsWith('gemma')
            ? messages.map(m => (
                m.role === 'system'
                  ? { role: 'user', content: `[Instrução do sistema]: ${m.content}` }
                  : m
              ))
            : messages;
          const res = await oa.chat.completions.create({
            model, messages: msgs,
            max_tokens: opts.max_tokens ?? 2048, temperature: opts.temperature ?? 0.7,
          });
          return { content: res.choices[0]?.message?.content ?? '', usage: res.usage };
        },
      };
    },
  },

  // ── Ollama local / self-hosted ────────────────────────────────────────
  ollama: {
    envKey:       'OLLAMA_HOST',
    envModel:     'OLLAMA_MODEL',
    defaultModel: process.env.OLLAMA_MODEL || 'gemma3:27b',
    fastModel:    process.env.OLLAMA_MODEL_FAST || 'gemma3:12b',
    buildClient(hostOrKey) {
      const host = (hostOrKey && !hostOrKey.startsWith('sk-') && hostOrKey.length > 3)
        ? hostOrKey.replace(/\/$/, '')
        : (process.env.OLLAMA_HOST || 'http://localhost:11434');
      const oa = new OpenAI({
        apiKey: 'ollama',
        baseURL: `${host}/v1`,
        timeout: 120000,
      });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const model = opts.model || process.env.OLLAMA_MODEL || 'gemma3:27b';
          const msgs = messages.map(m => (
            m.role === 'system'
              ? { role: 'user', content: `[Sistema]: ${m.content}` }
              : m
          ));
          const res = await oa.chat.completions.create({
            model, messages: msgs,
            max_tokens: opts.max_tokens ?? 2048,
            temperature: opts.temperature ?? 0.7,
          });
          return { content: res.choices[0]?.message?.content ?? '', usage: res.usage };
        },
      };
    },
  },

  // ── xAI / Grok ────────────────────────────────────────────────────────
  xai: {
    envKey:       'XAI_API_KEY',
    envModel:     'XAI_MODEL',
    defaultModel: 'grok-3',
    fastModel:    'grok-3-mini',
    buildClient(apiKey) {
      const oa = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 60000 });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const res = await oa.chat.completions.create({
            model: opts.model, messages,
            max_tokens: opts.max_tokens ?? 2048, temperature: opts.temperature ?? 0.7,
          });
          return { content: res.choices[0]?.message?.content ?? '', usage: res.usage };
        },
      };
    },
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────
  deepseek: {
    envKey:       'DEEPSEEK_API_KEY',
    envModel:     'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
    fastModel:    'deepseek-chat',
    buildClient(apiKey) {
      const oa = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1', timeout: 60000 });
      return {
        raw: oa,
        async completions(messages, opts = {}) {
          const res = await oa.chat.completions.create({
            model: opts.model, messages,
            max_tokens: opts.max_tokens ?? 2048, temperature: opts.temperature ?? 0.7,
          });
          return { content: res.choices[0]?.message?.content ?? '', usage: res.usage };
        },
      };
    },
  },
};

// ── Per-user key cache ─────────────────────────────────────────────────────
// Map<userId → { provider, keys: [{apiKey, model, keyIndex}], activeIdx, builtAt }>
const _userCache = new Map();

// Prune stale cache entries every 15 minutes — prevents anonymous-call leaks
// (null userId entries would otherwise live forever since no explicit invalidation)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _userCache) {
    if (now - entry.builtAt >= CACHE_TTL_MS) {
      _userCache.delete(key);
    }
  }
}, 15 * 60 * 1000).unref(); // .unref() so this timer doesn't keep the process alive

// Invalidate on key update
export function invalidateClientCache(userId) {
  _userCache.delete(userId);
  logger.debug(`[ProviderManager] Cache invalidated for user=${userId}`);
}

// ── Load all keys for a user from DB ──────────────────────────────────────
async function _loadUserKeys(userId) {
  if (!userId) return [];
  try {
    const { rows } = await query(
      `SELECT k.provider, k.api_key, k.model, k.key_slot
       FROM user_api_keys k
       LEFT JOIN user_providers p
         ON p.user_id = k.user_id AND p.provider = k.provider
       WHERE k.user_id = $1
         AND k.verified = TRUE
         AND COALESCE(p.active, TRUE) = TRUE
       ORDER BY COALESCE(p.priority, 0) DESC, k.provider, k.key_slot ASC`,
      [userId],
    );
    return rows.map(r => ({
      provider: r.provider,
      apiKey:   decrypt(r.api_key),
      model:    r.model,
      slot:     r.key_slot ?? 0,
    }));
  } catch {
    return [];
  }
}

// ── Resolve provider + key for a user request ─────────────────────────────
// Returns { providerName, client, model, keyIndex }
async function _resolveClient(userId, preferredProvider) {
  // Determine provider precedence:
  //   1. explicitly requested by caller (opts.provider)
  //   2. first provider the user has a key for
  //   3. openai (env fallback)
  const cached = _userCache.get(userId);
  if (cached
    && Date.now() - cached.builtAt < CACHE_TTL_MS
    && (!preferredProvider || cached.providerName === preferredProvider)) {
    return cached;
  }

  const userKeys = userId ? await _loadUserKeys(userId) : [];

  // Group keys by provider
  const byProvider = {};
  for (const k of userKeys) {
    (byProvider[k.provider] ??= []).push(k);
  }

  // Pick provider
  const providerName = preferredProvider
    || Object.keys(byProvider)[0]
    || 'openai';

  const providerDef = PROVIDERS[providerName] || PROVIDERS.openai;

  // Collect candidate keys for this provider
  const dbKeys = (byProvider[providerName] || []).map(k => ({ apiKey: k.apiKey, model: k.model }));

  // Env fallback key
  const envModel = process.env[providerDef.envModel] || providerDef.defaultModel;
  const envKeys = [];

  if (providerName === 'ollama') {
    envKeys.push({ apiKey: process.env.OLLAMA_HOST || 'http://localhost:11434', model: envModel });
  } else {
    const primaryEnvKey = process.env[providerDef.envKey] || '';
    if (primaryEnvKey) envKeys.push({ apiKey: primaryEnvKey, model: envModel });

    if (providerName === 'openai') {
      const firstNumbered = process.env.OPENAI_API_KEY_1 || '';
      if (firstNumbered) envKeys.push({ apiKey: firstNumbered, model: envModel });
      for (let i = 2; i <= 10; i++) {
        const extra = process.env[`OPENAI_API_KEY_${i}`] || '';
        if (extra) envKeys.push({ apiKey: extra, model: envModel });
        else break;
      }
    }
  }

  const allKeys  = [...dbKeys, ...envKeys];

  if (!allKeys.length) {
    throw new Error(`Chave de API não configurada para "${providerName}". Adicione sua chave em Configurações.`);
  }

  // Round-robin index (persisted in cache, not DB — resets on restart, which is fine)
  const prevIdx = cached?.activeIdx ?? 0;
  const activeIdx = prevIdx % allKeys.length;
  const { apiKey, model } = allKeys[activeIdx];

  const built = PROVIDERS[providerName].buildClient(apiKey);

  const entry = {
    providerName,
    client:    built,
    model:     model || envModel,
    activeIdx: (activeIdx + 1) % allKeys.length, // advance for next call
    allKeys,
    builtAt:   Date.now(),
    // Expose raw OpenAI client for callers that need it (visual agent, video agent)
    raw:       built.raw,
  };

  _userCache.set(userId, entry);
  return entry;
}

// Kept for backward compat with existing callers (visualAgent, videoAgent)
export async function getClientForUser(userId) {
  const resolved = await _resolveClient(userId, null);
  return { client: resolved.raw, model: resolved.model };
}

// ── Retry logic ───────────────────────────────────────────────────────────
function _shouldRetry(err) {
  return err?.status === 429 || err?.status >= 500
    || /rate_limit|ECONNRESET|ETIMEDOUT|timeout/i.test(err?.message || '');
}

async function _callWithFallback(userId, preferredProvider, messages, opts = {}) {
  let entry = await _resolveClient(userId, preferredProvider);
  const startKey = entry.activeIdx;

  // Try each key (with retry) — rotate on failure
  for (let keyAttempt = 0; keyAttempt < entry.allKeys.length; keyAttempt++) {
    let lastErr;
    for (let retry = 1; retry <= MAX_RETRIES; retry++) {
      try {
        const callOpts = {
          model:       opts.model ?? entry.model,
          max_tokens:  opts.max_tokens  ?? opts.maxTokens ?? 2048,
          temperature: opts.temperature ?? 0.7,
        };
        // Check daily quota before spending tokens
        if (userId) {
          const quota = checkQuota(userId);
          if (!quota.allowed) {
            throw Object.assign(
              new Error(`Daily token limit reached (${quota.used.toLocaleString()}/${quota.limit.toLocaleString()}). Resets at midnight UTC.`),
              { status: 429 }
            );
          }
        }

        const result = await entry.client.completions(messages, callOpts);

        const tokens = result.usage?.total_tokens ?? 0;
        logger.debug(
          `[PM] provider=${entry.providerName} model=${callOpts.model} ` +
          `user=${userId} tokens=${tokens} key=${entry.activeIdx}`,
        );

        // Record usage asynchronously (never blocks response)
        recordUsage(userId, tokens, entry.providerName, callOpts.model).catch(() => {});

        return result.content;

      } catch (err) {
        lastErr = err;
        if (!_shouldRetry(err)) break;
        const delay = BASE_DELAY * Math.pow(2, retry - 1) + Math.random() * 400;
        logger.warn(`[PM] Retry ${retry}/${MAX_RETRIES} in ${Math.round(delay)}ms — ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Key exhausted — rotate to next key
    if (keyAttempt + 1 < entry.allKeys.length) {
      logger.warn(`[PM] Key ${entry.activeIdx} failed, rotating → next key`);
      entry.activeIdx = (entry.activeIdx + 1) % entry.allKeys.length;
      const { apiKey, model } = entry.allKeys[entry.activeIdx];
      const newBuilt = PROVIDERS[entry.providerName].buildClient(apiKey);
      entry.client = newBuilt;
      entry.model  = model || entry.model;
    } else {
      throw lastErr;
    }
  }
  // FIX #2: loop exited without returning (allKeys empty after rotation) — should never
  // happen because _resolveClient throws when allKeys.length===0, but guard anyway
  throw new Error('All API keys exhausted without response or error');
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Main chat completion.
 * opts: { userId, provider, model, temperature, max_tokens, maxTokens }
 */
export async function chat(messages, opts = {}) {
  const userId   = opts.userId   ?? null;
  const provider = opts.provider ?? null;
  return _callWithFallback(userId, provider, messages, opts);
}

/**
 * Fast (cheaper) model variant.
 */
export async function chatFast(messages, opts = {}) {
  const userId       = opts.userId ?? null;
  const entry        = await _resolveClient(userId, opts.provider ?? null);
  const provDef      = PROVIDERS[entry.providerName] || PROVIDERS.openai;
  const fastModel    = provDef.fastModel;
  return _callWithFallback(userId, opts.provider ?? null, messages, { ...opts, model: fastModel });
}

/**
 * Strong alias — same as chat, used by openai-advanced compat layer.
 */
export const openaiStrong = chat;
export const openaiFast   = chatFast;

/**
 * Text embedding — OpenAI only for now (other providers can be added).
 */
export async function embed(text, userId = null) {
  const { client } = await getClientForUser(userId);
  const res = await client.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

/**
 * Whisper transcription — OpenAI only.
 */
export async function transcribe(fileStream, filename = 'audio.wav', userId = null) {
  const { client } = await getClientForUser(userId);
  const res = await client.audio.transcriptions.create({ model: 'whisper-1', file: fileStream, filename });
  return res.text;
}

/**
 * DALL-E image generation — OpenAI only.
 */
export async function generateImage(prompt, opts = {}) {
  const { client } = await getClientForUser(opts.userId ?? null);
  const res = await client.images.generate({
    model:   'dall-e-3',
    prompt,
    size:    opts.size    ?? '1024x1024',
    quality: opts.quality ?? 'standard',
    n:       1,
  });
  return res.data[0].url;
}

/**
 * List available models for a given provider + key.
 * Used by settings route to replace the hardcoded model list.
 */
export async function listModels(apiKey, providerName = 'openai') {
  const provDef = PROVIDERS[providerName];
  if (!provDef) throw new Error(`Unknown provider: ${providerName}`);

  if (providerName === 'ollama') {
    const host = (apiKey && apiKey.length > 3 && !apiKey.startsWith('sk-'))
      ? apiKey.replace(/\/$/, '')
      : (process.env.OLLAMA_HOST || 'http://localhost:11434');
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return (data.models || []).map(m => m.name).sort();
  }

  const built = provDef.buildClient(apiKey);
  // OpenAI-compatible providers all support /models
  const res = await built.raw.models.list();
  return res.data
    .map(m => m.id)
    .filter(id => /gpt-|claude-|llama|gemini|gemma|grok|deepseek|mistral|mixtral/i.test(id))
    .sort();
}

/**
 * Verify a key is valid for a given provider.
 * Returns { valid, model, providerName }
 */
export async function verifyKey(apiKey, providerName = 'openai') {
  const provDef = PROVIDERS[providerName];
  if (!provDef) throw new Error(`Unknown provider: ${providerName}`);

  if (providerName === 'ollama') {
    try {
      const host = (apiKey && apiKey.length > 3 && !apiKey.startsWith('sk-'))
        ? apiKey.replace(/\/$/, '')
        : (process.env.OLLAMA_HOST || 'http://localhost:11434');
      const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Ollama respondeu ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map(m => m.name);
      const gemmaModels = models.filter(m => /gemma/i.test(m));
      const model = gemmaModels[0] || models[0] || provDef.defaultModel;
      return {
        valid: true,
        model,
        info: gemmaModels.length
          ? `Gemma encontrado: ${gemmaModels.join(', ')}`
          : 'Nenhum modelo Gemma instalado. Execute: ollama pull gemma3:27b',
      };
    } catch (err) {
      return { valid: false, error: `Ollama não acessível: ${err.message}` };
    }
  }

  try {
    const built  = provDef.buildClient(apiKey);
    const models = await built.raw.models.list();
    const ids    = models.data.map(m => m.id);
    // Pick best default model
    const preferred = ['gpt-4o', 'claude-sonnet-4-6', 'llama-3.3-70b-versatile',
                       'gemini-2.5-pro', 'gemma-3-27b-it', 'gemini-2.0-flash',
                       'grok-3', 'deepseek-chat'];
    const model = preferred.find(p => ids.includes(p)) || ids[0] || provDef.defaultModel;
    return { valid: true, model };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Return all supported providers with their metadata.
 * Used by the frontend provider catalog.
 */
export function getProviderCatalog() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    defaultModel: p.defaultModel,
    fastModel:    p.fastModel,
    envKey:       p.envKey,
    available:    id === 'ollama'
      ? true
      : id === 'openai'
        ? !!(process.env[p.envKey] || process.env.OPENAI_API_KEY_1 || process.env.OPENAI_API_KEY_2)
        : !!(process.env[p.envKey]),
    isLocal:      id === 'ollama',
    label:        id === 'ollama' ? 'Ollama (Gemma Local)' : undefined,
  }));
}

export default {
  chat, chatFast, embed, transcribe, generateImage,
  getClientForUser, invalidateClientCache,
  openaiStrong, openaiFast,
  listModels, verifyKey, getProviderCatalog,
};

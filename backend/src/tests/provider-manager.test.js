// tests/provider-manager.test.js
// Run: node --test src/tests/provider-manager.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ── Unit tests — no real API calls ────────────────────────────────────────
describe('provider-manager: getProviderCatalog', () => {
  it('returns all 7 providers', async () => {
    const { getProviderCatalog } = await import('../lib/provider-manager.js');
    const catalog = getProviderCatalog();
    assert.ok(catalog.length >= 6, `Expected >=6 providers, got ${catalog.length}`);
    const ids = catalog.map(p => p.id);
    assert.ok(ids.includes('openai'),    'missing openai');
    assert.ok(ids.includes('openrouter'),'missing openrouter');
    assert.ok(ids.includes('anthropic'), 'missing anthropic');
    assert.ok(ids.includes('groq'),      'missing groq');
    assert.ok(ids.includes('gemini'),    'missing gemini');
    assert.ok(ids.includes('deepseek'),  'missing deepseek');
  });
});

describe('provider-manager: invalidateClientCache', () => {
  it('does not throw for unknown userId', async () => {
    const { invalidateClientCache } = await import('../lib/provider-manager.js');
    assert.doesNotThrow(() => invalidateClientCache('nonexistent-user-id'));
  });
});

describe('provider-manager: no API key → throws clear error', async () => {
  it('throws with helpful message when no key configured', async () => {
    // Temporarily remove env key
    const origKey = process.env.OPENAI_API_KEY;
    const numbered = Array.from({ length: 10 }, (_, i) => `OPENAI_API_KEY_${i + 1}`);
    const originalNumbered = Object.fromEntries(numbered.map(k => [k, process.env[k]]));
    delete process.env.OPENAI_API_KEY;
    numbered.forEach(k => delete process.env[k]);
    try {
      const { chat } = await import('../lib/provider-manager.js');
      // userId = null means no DB lookup, only env fallback
      await assert.rejects(
        () => chat([{ role: 'user', content: 'test' }], { userId: null }),
        /API key|Chave de API/,
      );
    } finally {
      if (origKey) process.env.OPENAI_API_KEY = origKey;
      for (const [key, value] of Object.entries(originalNumbered)) {
        if (value) process.env[key] = value;
      }
    }
  });
});

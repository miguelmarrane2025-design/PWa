// tests/routes.test.js
// Basic HTTP route smoke tests using Node's built-in test runner.
// Requires the server to be running on TEST_PORT (default: 4001).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = `http://localhost:${process.env.TEST_PORT || 4000}`;

async function get(path, token) {
  const r = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: r.status, body: await r.json() };
}

describe('GET /health', () => {
  it('returns 200 + ok status', async () => {
    const { status, body } = await get('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(body.version, 'should have version');
  });
});

describe('GET /video/health', () => {
  it('returns ffmpeg status (no auth required)', async () => {
    const { status, body } = await get('/video/health');
    assert.equal(status, 200);
    assert.ok('ffmpeg' in body, 'should have ffmpeg field');
  });
});

describe('GET /auth/me without token', () => {
  it('returns 401', async () => {
    const { status } = await get('/auth/me');
    assert.equal(status, 401);
  });
});

describe('GET /settings/providers without token', () => {
  it('returns 401', async () => {
    const { status } = await get('/settings/providers');
    assert.equal(status, 401);
  });
});

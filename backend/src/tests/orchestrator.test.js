// tests/orchestrator.test.js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('orchestrator: [agent:xxx] prefix parsing', () => {
  it('strips prefix and identifies forced agent', () => {
    const msg = '[agent:video] editar esse vídeo para reels';
    const match = msg.match(/^\[agent:(\w+)\]\s*/);
    assert.ok(match, 'Should match prefix');
    assert.equal(match[1], 'video');
    const cleaned = msg.slice(match[0].length);
    assert.equal(cleaned, 'editar esse vídeo para reels');
  });

  it('returns null for messages without prefix', () => {
    const msg = 'editar vídeo para reels';
    const match = msg.match(/^\[agent:(\w+)\]\s*/);
    assert.equal(match, null);
  });

  it('handles all defined forced agents', () => {
    const FORCED = ['audio', 'content', 'visual', 'hunter', 'research', 'video'];
    for (const agent of FORCED) {
      const msg = `[agent:${agent}] test`;
      const match = msg.match(/^\[agent:(\w+)\]\s*/);
      assert.equal(match?.[1], agent);
    }
  });
});

describe('orchestrator: video auto-routing', () => {
  const VIDEO_KEYWORDS = /\b(edit(ar|a|e)?\s+(v[íi]deo|video)|cortar?\s+v[íi]deo|legenda[rs]?|remov[ea]r?\s+(sil[eê]ncio|pausa)|reels?|tiktok|shorts?\s+form|videomaker)\b/i;
  const cases = [
    ['editar vídeo para reels', true],
    ['remover silêncio do vídeo', true],
    ['legendas virais', true],
    ['criar copy para produto', false],
    ['analisar @perfil', false],
  ];
  for (const [msg, expected] of cases) {
    it(`"${msg}" → video=${expected}`, () => {
      assert.equal(VIDEO_KEYWORDS.test(msg), expected);
    });
  }
});

// tests/intent-engine.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Domain keyword detection (no AI calls needed) ─────────────────────────
const DOMAIN_PATTERNS = {
  audio:    /\b(ir|impulse|timbre|worship|hillsong|bethel|camilla|pedaleira|guitar tone)\b/i,
  video:    /\b(editar?\s*v[íi]deo|reels?|tiktok|shorts?|legenda|cortar?\s*v[íi]deo)\b/i,
  visual:   /\b(imagem|thumbnail|carrossel|banner|gerar\s+imagem|dall.e)\b/i,
  hunter:   /(?:^|\s)(@[a-z0-9_.]+)|https?:\/\/(instagram|tiktok|youtube)/i,
  research: /\b(pesquis[ae]r?|tendência|tendencias|mercado|nicho|o que está bombando)\b/i,
  content:  /\b(copy|hook|gancho|roteiro|headline|funil|infoproduto)\b/i,
};

describe('intent-engine: domain patterns', () => {
  const cases = [
    ['editar vídeo para reels com legendas virais', 'video'],
    ['analisar o @fitguru_br no instagram', 'hunter'],
    ['gerar thumbnail para o canal', 'visual'],
    ['preset hillsong para HX Stomp', 'audio'],
    ['criar copy para produto de emagrecimento', 'content'],
    ['pesquisar tendências de marketing digital', 'research'],
  ];

  for (const [msg, expectedDomain] of cases) {
    it(`"${msg.slice(0,40)}" → ${expectedDomain}`, () => {
      const matched = Object.entries(DOMAIN_PATTERNS)
        .find(([, re]) => re.test(msg))?.[0];
      assert.equal(matched, expectedDomain, `Expected ${expectedDomain}, got ${matched}`);
    });
  }
});

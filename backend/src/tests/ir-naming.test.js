import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateIRDisplayName, generateIRFileName } from '../audio/irNaming.js';

describe('IR naming', () => {
  it('generates fallback names for legacy default jobs', () => {
    assert.equal(generateIRDisplayName({ preset: 'default', sampleRate: 48000 }), 'Default · Generic · 48k');
    assert.equal(generateIRFileName({ preset: 'default', sampleRate: 48000 }), 'Default_Generic_48k.wav');
  });

  it('generates professional blend names with preset and mics', () => {
    const config = {
      ampA: 'Vox AC30',
      ampB: 'Matchless DC30',
      preset: 'worship_balanced',
      microphones: ['sm57', 'r121'],
      sampleRate: 48000,
    };

    assert.equal(
      generateIRDisplayName(config),
      'Vox AC30 + Matchless DC30 · Worship Balanced · SM57 + R121 · 48k',
    );
    assert.equal(
      generateIRFileName(config),
      'Vox_AC30+Matchless_DC30_Blend_WorshipBalanced_SM57-R121_48k.wav',
    );
  });
});

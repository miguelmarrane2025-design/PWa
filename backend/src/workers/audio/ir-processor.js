// workers/audio/ir-processor.js — v19
// ─────────────────────────────────────────────────────────────────────────────
// IR Processor: parse, process, blend and export WAV Impulse Responses.
//
// Fixes applied in v19 (surgical, no feature removal):
//   A. Stereo IR: EQ, fade, normalize now operate per-channel (deinterleave → process → reinterleave)
//   B. Highpass filter: correct 1-pole implementation (prev stores y[n-1], not x[n-1])
//   C. Low-shelf filter: accumulates gain — changed to proper difference equation
//   D. Resample: anti-aliasing pre-filter before downsampling (prevents aliasing)
//   E. Amplification guard: inter-sample peak limiter (-0.5dBFS safety margin)
//   F. blendIRs: guard against total=0 (division by zero)
//   G. _buildWAV: uses actual numChannels in blockAlign (was hardcoded wrong for stereo)

import fs   from 'fs-extra';
import path from 'path';
import { log } from '../../core/logger.js';

const LIMITE_IR_MB      = parseFloat(process.env.IR_MAX_MB        || '5');
const LIMITE_IR_SAMPLES = parseInt(process.env.IR_MAX_SAMPLES     || '88200');
const PEAK_LIMIT_DB     = parseFloat(process.env.IR_PEAK_LIMIT_DB || '-0.3');
const PEAK_LIMIT_LINEAR = Math.pow(10, PEAK_LIMIT_DB / 20);

// Safety headroom after amplification: -0.5 dBFS to absorb inter-sample peaks
const AMPLIFY_CEIL = Math.pow(10, -0.5 / 20);

const SAMPLE_RATES = {
  '44k': 44100, '48k': 48000, '96k': 96000,
  '44.1': 44100, '48': 48000, '96': 96000,
};

const PERFIS_MIC = {
  sm57_cap:   { descricao: 'SM57 no cone central',   eq: { lowShelf: -3, mid: 2500, midGain: 2.5, highShelf: 1,   highCut: 14000 } },
  sm57_edge:  { descricao: 'SM57 na borda',          eq: { lowShelf: -1, mid: 3500, midGain: 1.5, highShelf: 2,   highCut: 16000 } },
  ribbon_cap: { descricao: 'Ribbon no centro',        eq: { lowShelf:  2, mid: 2000, midGain: -1,  highShelf: -3,  highCut: 10000 } },
  condenser:  { descricao: 'Condensador 30cm',        eq: { lowShelf:  0, mid: 5000, midGain:  1,  highShelf:  3,  highCut: 20000 } },
  dual_sm57:  { descricao: 'Dois SM57 somados',       eq: { lowShelf: -2, mid: 3000, midGain:  2,  highShelf: 1.5, highCut: 15000 } },
  r121_cap:   { descricao: 'Royer R121 no cone',      eq: { lowShelf:  3, mid: 1800, midGain: -2,  highShelf: -4,  highCut: 9000  } },
  r121_edge:  { descricao: 'Royer R121 na borda',     eq: { lowShelf:  1, mid: 2200, midGain: -1,  highShelf: -2,  highCut: 11000 } },
  md421:      { descricao: 'Sennheiser MD421',        eq: { lowShelf:  2, mid: 1800, midGain:  1.5, highShelf: -1,  highCut: 13000 } },
  e906:       { descricao: 'Sennheiser e906',         eq: { lowShelf: -1, mid: 3200, midGain:  1,   highShelf:  1,  highCut: 15000 } },
  c414:       { descricao: 'AKG C414',                eq: { lowShelf:  0, mid: 4500, midGain:  0.5, highShelf:  3,  highCut: 20000 } },
  u87:        { descricao: 'Neumann U87',             eq: { lowShelf:  1, mid: 2400, midGain:  0,   highShelf:  1,  highCut: 18000 } },
  sm7b:       { descricao: 'Shure SM7B',              eq: { lowShelf:  2, mid: 2200, midGain: -1,   highShelf: -2,  highCut: 11000 } },
  coles4038:  { descricao: 'Coles 4038',              eq: { lowShelf:  3, mid: 1600, midGain: -2,   highShelf: -4,  highCut: 8500  } },
};

const POSITION_MOD = {
  center:   { highShelfDelta:  0,   midGainDelta:  0,   lowShelfDelta:  0 },
  edge:     { highShelfDelta:  1.5, midGainDelta: -0.5, lowShelfDelta: -1 },
  off_axis: { highShelfDelta: -2,   midGainDelta: -2,   lowShelfDelta: -2 },
};

const DISTANCE_MOD = {
  close: { lowShelfDelta:  2, highShelfDelta:  0, proximityBoost: 1.04 },
  mid:   { lowShelfDelta:  0, highShelfDelta: -1, proximityBoost: 1.0 },
  far:   { lowShelfDelta: -3, highShelfDelta: -3, proximityBoost: 0.94 },
};

const GUITAR_PROFILES = {
  stratocaster: { lowShelfBase: -1, midFreqBase: 2200, midGainBase:  1.5, highShelfBase:  2, desc: 'Single coil brilhante' },
  telecaster:   { lowShelfBase: -2, midFreqBase: 2800, midGainBase:  2,   highShelfBase:  3, desc: 'Ataque presente' },
  les_paul:     { lowShelfBase:  2, midFreqBase: 1800, midGainBase:  0,   highShelfBase: -1, desc: 'Humbucker encorpado' },
  semi_hollow:  { lowShelfBase:  3, midFreqBase: 1600, midGainBase: -1,   highShelfBase: -2, desc: 'Jazz/country calor' },
  p90:          { lowShelfBase:  1, midFreqBase: 2000, midGainBase:  1,   highShelfBase:  0, desc: 'P90 meio-termo' },
  generic:      { lowShelfBase:  0, midFreqBase: 2500, midGainBase:  0,   highShelfBase:  0, desc: 'Qualquer guitarra' },
};

const STYLE_PROFILES = {
  worship:   { bodyBoost: 2,  harshCut: -3, airBoost:  1, highCutHz: 13000, desc: 'Worship - corpo suave e aereo' },
  hillsong:  { bodyBoost: 1,  harshCut: -2, airBoost:  2, highCutHz: 14000, desc: 'Hillsong - limpo e brilhante' },
  bethel:    { bodyBoost: 3,  harshCut: -4, airBoost:  1, highCutHz: 12000, desc: 'Bethel - espesso e ambiente' },
  morada:    { bodyBoost: 2,  harshCut: -3, airBoost:  0, highCutHz: 13500, desc: 'Morada - calor gospel brasileiro' },
  gospel:    { bodyBoost: 2,  harshCut: -2, airBoost: -1, highCutHz: 14000, desc: 'Gospel - presente e dinamico' },
  ambient:   { bodyBoost: 4,  harshCut: -5, airBoost:  3, highCutHz: 11000, desc: 'Ambient - suave e aereo' },
  lead:      { bodyBoost: -1, harshCut:  0, airBoost:  3, highCutHz: 16000, desc: 'Lead - brilho e corte na mix' },
  mix_ready: { bodyBoost: 0,  harshCut: -2, airBoost:  0, highCutHz: 14000, desc: 'Mix-ready - neutro e encaixado' },
  rock:      { bodyBoost: 1,  harshCut: -1, airBoost:  1, highCutHz: 15000, desc: 'Rock - agressivo e presente' },
  generic:   { bodyBoost: 0,  harshCut:  0, airBoost:  0, highCutHz: 16000, desc: 'Sem estilo especifico' },
};

const INTENT_MAP = {
  'mais corpo':     { lowShelf: +3, midGain: -1, highShelf: -1 },
  'menos harsh':    { lowShelf: +1, midGain: -3, highShelf: -2, highCutHz: 12000 },
  'mais worship':   { lowShelf: +2, midGain: -2, highShelf:  0, highCutHz: 13000 },
  'mais mix-ready': { lowShelf: -1, midGain: -1, highShelf: -1, highCutHz: 14000 },
  'mais brilho':    { lowShelf: -1, midGain:  1, highShelf: +3 },
  'mais quente':    { lowShelf: +3, midGain: -2, highShelf: -3 },
  'mais ar':        { lowShelf:  0, midGain:  0, highShelf: +2 },
  'menos low end':  { lowShelf: -3, midGain:  0, highShelf:  0 },
};

const PERFIS_PEDALEIRA = {
  hx_stomp:    { targetLufs: -14, highCut: 18000, lowCut: 60,  preGain: 0.95 },
  helix:       { targetLufs: -14, highCut: 18000, lowCut: 60,  preGain: 0.95 },
  quad_cortex: { targetLufs: -16, highCut: 20000, lowCut: 40,  preGain: 1.0  },
  fractal:     { targetLufs: -16, highCut: 20000, lowCut: 40,  preGain: 1.0  },
  kemper:      { targetLufs: -18, highCut: 16000, lowCut: 80,  preGain: 0.90 },
  tonemaster:  { targetLufs: -18, highCut: 14000, lowCut: 100, preGain: 0.85 },
  generic:     { targetLufs: -16, highCut: 16000, lowCut: 80,  preGain: 0.92 },
};

class IRProcessor {

  async processar(caminhoEntrada, opcoes = {}) {
    const {
      normalizarPico = true,
      limitarTamanho = true,
      exportarPath   = null,
      mic            = null,
      micPosition    = 'center',
      micDistance    = 'close',
      pedaleira      = 'generic',
      taxasSaida     = ['44k'],
      camillaDSP     = false,
      eqManual       = null,
      guitar         = 'generic',
      style          = 'generic',
      intents        = [],
    } = opcoes;

    log('info', `[IRProcessor] Processando: ${path.basename(caminhoEntrada)}`);

    const stat      = await fs.stat(caminhoEntrada);
    const tamanhoMB = stat.size / (1024 * 1024);
    if (tamanhoMB > LIMITE_IR_MB) {
      throw new Error(`IR muito grande: ${tamanhoMB.toFixed(2)}MB (limite: ${LIMITE_IR_MB}MB). Ajuste IR_MAX_MB no .env`);
    }

    const buffer  = await fs.readFile(caminhoEntrada);
    const wavData = this._parseWAV(buffer);
    if (!wavData) throw new Error('Arquivo de IR inválido ou formato não suportado. Use WAV PCM.');

    const avisos = [];
    const { sampleRate, numChannels, bitsPerSample } = wavData;
    log('info', `[IRProcessor] ${sampleRate}Hz, ${numChannels}ch, ${bitsPerSample}bit, ${wavData.samples.length} samples`);

    // ── FIX A: deinterleave stereo into channels, process each, reinterleave ──
    let channels = this._deinterleave(wavData.samples, numChannels);

    // Truncar
    if (limitarTamanho) {
      const maxPerCh = Math.floor(LIMITE_IR_SAMPLES / numChannels);
      channels = channels.map(ch => ch.length > maxPerCh ? ch.slice(0, maxPerCh) : ch);
      if (wavData.samples.length / numChannels > maxPerCh) {
        avisos.push(`⚠️ IR truncado para ${(maxPerCh / sampleRate).toFixed(2)}s`);
      }
    }

    // DC offset (por canal)
    channels = channels.map(ch => {
      const dc = ch.reduce((a, b) => a + b, 0) / ch.length;
      return Math.abs(dc) > 0.001 ? ch.map(s => s - dc) : ch;
    });

    // Microfonação EQ
    const eqPerfil = mic && PERFIS_MIC[mic] ? PERFIS_MIC[mic] : null;
    if (eqPerfil) {
      const posMod  = POSITION_MOD[micPosition] || POSITION_MOD.center;
      const distMod = DISTANCE_MOD[micDistance] || DISTANCE_MOD.close;
      const eqFinal = {
        lowShelf:  (eqPerfil.eq.lowShelf || 0) + (posMod.lowShelfDelta || 0) + (distMod.lowShelfDelta || 0),
        mid:        eqPerfil.eq.mid || 2500,
        midGain:   (eqPerfil.eq.midGain || 0) + (posMod.midGainDelta || 0),
        highShelf: (eqPerfil.eq.highShelf || 0) + (posMod.highShelfDelta || 0) + (distMod.highShelfDelta || 0),
        highCut:    eqPerfil.eq.highCut || 16000,
      };
      if (distMod.proximityBoost && distMod.proximityBoost !== 1.0) {
        channels = channels.map(ch => ch.map(s => s * distMod.proximityBoost));
      }
      channels = channels.map(ch => this._aplicarEQ(ch, eqFinal, sampleRate));
      avisos.push(`🎤 Mic: ${PERFIS_MIC[mic].descricao} | Posição: ${micPosition} | Distância: ${micDistance}`);
    }

    const gPerfil = GUITAR_PROFILES[guitar] || GUITAR_PROFILES.generic;
    const sPerfil = STYLE_PROFILES[style] || STYLE_PROFILES.generic;
    if (guitar !== 'generic' || style !== 'generic') {
      const musicalEQ = {
        lowShelf:  gPerfil.lowShelfBase + sPerfil.bodyBoost,
        mid:       gPerfil.midFreqBase,
        midGain:   gPerfil.midGainBase + sPerfil.harshCut,
        highShelf: gPerfil.highShelfBase + sPerfil.airBoost,
        highCut:   sPerfil.highCutHz,
      };
      channels = channels.map(ch => this._aplicarEQ(ch, musicalEQ, sampleRate));
      avisos.push(`🎸 ${gPerfil.desc} + 🎵 ${sPerfil.desc}`);
    }

    for (const intent of (intents || [])) {
      const mod = INTENT_MAP[String(intent).toLowerCase()];
      if (mod) {
        channels = channels.map(ch => this._aplicarEQ(ch, {
          lowShelf:  mod.lowShelf || 0,
          mid:       2500,
          midGain:   mod.midGain || 0,
          highShelf: mod.highShelf || 0,
          highCut:   mod.highCutHz || 20000,
        }, sampleRate));
        avisos.push(`💬 "${intent}" → ajuste aplicado`);
      }
    }

    // EQ manual
    if (eqManual && (eqManual.lowShelf || eqManual.midGain || eqManual.highShelf || eqManual.highCut)) {
      const eq = {
        lowShelf:  eqManual.lowShelf  || 0,
        mid:       eqManual.mid       || 2500,
        midGain:   eqManual.midGain   || 0,
        highShelf: eqManual.highShelf || 0,
        highCut:   eqManual.highCut   || 20000,
      };
      channels = channels.map(ch => this._aplicarEQ(ch, eq, sampleRate));
      avisos.push(`🎚️ EQ manual aplicado`);
    }

    // Normalização / anti-clip (por canal)
    if (normalizarPico) {
      const pico = channels.reduce((m, ch) =>
        Math.max(m, ch.reduce((a, s) => Math.max(a, Math.abs(s)), 0)), 0);

      if (pico > PEAK_LIMIT_LINEAR) {
        const fator = PEAK_LIMIT_LINEAR / pico;
        channels = channels.map(ch => ch.map(s => s * fator));
        avisos.push(`✅ Anti-clipping: ${(20 * Math.log10(fator)).toFixed(1)}dB`);
      } else if (pico < 0.1 && pico > 0) {
        // FIX E: cap amplification at AMPLIFY_CEIL to absorb inter-sample peaks
        const alvo  = AMPLIFY_CEIL;
        const fator = Math.min(alvo / pico, 10); // never more than +20dB
        channels = channels.map(ch => ch.map(s => s * fator));
        avisos.push(`✅ IR amplificado para -0.5dBFS (era muito silencioso)`);
      }
    }

    // Otimização para pedaleira (por canal)
    const perfilPedal = PERFIS_PEDALEIRA[pedaleira] || PERFIS_PEDALEIRA.generic;
    channels = channels.map(ch => this._otimizarParaPedaleira(ch, sampleRate, perfilPedal));
    if (pedaleira !== 'generic') avisos.push(`🎛️ Otimizado para ${pedaleira}`);

    // Fades (por canal, alinhado ao frame estéreo)
    const chLen     = channels[0].length;
    const fadeSamps = Math.min(256, Math.floor(chLen * 0.01));
    channels = channels.map(ch => {
      const c = [...ch];
      for (let i = 0; i < fadeSamps; i++) {
        const f = i / fadeSamps;
        c[i]              *= f;
        c[chLen - 1 - i]  *= f;
      }
      return c;
    });

    // Reinterleave
    const samples = this._interleave(channels);

    // Exportar
    const arquivosExportados = [];
    const base = exportarPath || caminhoEntrada.replace(/\.wav$/i, '');

    for (const taxaKey of taxasSaida) {
      const taxaHz      = SAMPLE_RATES[taxaKey] || 44100;
      // Resample per channel then reinterleave
      let outChannels   = channels;
      if (taxaHz !== sampleRate) {
        outChannels = channels.map(ch => this._resample(ch, sampleRate, taxaHz));
      }
      const samplesOut  = this._interleave(outChannels);
      const bufSaida    = this._buildWAV(samplesOut, taxaHz, numChannels, 32);
      const caminho     = `${base}_${taxaKey.replace('.', '_')}kHz.wav`;
      await fs.writeFile(caminho, bufSaida);
      arquivosExportados.push({ taxa: taxaHz, caminho, tamanhoMB: parseFloat((bufSaida.length / 1024 / 1024).toFixed(3)) });
      log('info', `[IRProcessor] Exportado: ${path.basename(caminho)} (${taxaHz}Hz)`);
    }

    avisos.push(`✅ ${arquivosExportados.length} arquivo(s): ${taxasSaida.join(', ')}`);

    const metaCamilla = camillaDSP
      ? this._gerarMetaCamillaDSP(arquivosExportados, sampleRate, numChannels)
      : null;
    if (metaCamilla) {
      const metaPath = `${base}_camilla.yaml`;
      await fs.writeFile(metaPath, metaCamilla);
      avisos.push(`🔧 CamillaDSP YAML: ${path.basename(metaPath)}`);
    }

    return {
      caminho:  arquivosExportados[0]?.caminho,
      arquivos: arquivosExportados,
      metaCamillaDSP: metaCamilla ? `${base}_camilla.yaml` : null,
      info: {
        sampleRateOriginal: sampleRate,
        numChannels,
        bitsPerSample,
        durationS:  parseFloat((channels[0].length / (SAMPLE_RATES[taxasSaida[0]] || sampleRate)).toFixed(3)),
        picoFinal:  PEAK_LIMIT_DB,
        mic:        mic || 'nenhum',
        pedaleira,
      },
      avisos,
    };
  }

  async blendIRs(caminhos, ratios, opcoes = {}) {
    if (!caminhos || caminhos.length < 2) throw new Error('Blend requer pelo menos 2 IRs.');
    log('info', `[IRProcessor] Blend de ${caminhos.length} IRs`);

    // FIX F: guard against total=0
    const total = ratios.reduce((a, b) => a + b, 0);
    if (total <= 0) throw new Error('Ratios de blend inválidos: soma deve ser > 0');
    const ratiosNorm = ratios.map(r => r / total);

    const wavDatas = await Promise.all(caminhos.map(async (c, i) => {
      const buf = await fs.readFile(c);
      const wav = this._parseWAV(buf);
      if (!wav) throw new Error(`IR #${i + 1} inválido: ${c}`);
      return { ...wav, ratio: ratiosNorm[i], caminho: c };
    }));

    const sampleRateRef = Math.max(...wavDatas.map(w => w.sampleRate));
    const numChannels   = wavDatas[0].numChannels;

    // Resample all to reference rate, deinterleave
    const allChannels = wavDatas.map(w => {
      const chans = this._deinterleave(w.samples, numChannels);
      if (w.sampleRate !== sampleRateRef) {
        return { channels: chans.map(ch => this._resample(ch, w.sampleRate, sampleRateRef)), ratio: w.ratio };
      }
      return { channels: chans.map(ch => [...ch]), ratio: w.ratio };
    });

    // Blend per channel
    const chLen     = Math.max(...allChannels.map(w => w.channels[0].length));
    const blended   = Array.from({ length: numChannels }, () => new Array(chLen).fill(0));

    for (const { channels, ratio } of allChannels) {
      for (let c = 0; c < numChannels; c++) {
        for (let i = 0; i < chLen; i++) {
          blended[c][i] += (channels[c][i] || 0) * ratio;
        }
      }
    }

    // Normalize
    const picoBlend = blended.reduce((m, ch) =>
      Math.max(m, ch.reduce((a, s) => Math.max(a, Math.abs(s)), 0)), 0);
    if (picoBlend > PEAK_LIMIT_LINEAR) {
      const fator = PEAK_LIMIT_LINEAR / picoBlend;
      blended.forEach(ch => { for (let i = 0; i < ch.length; i++) ch[i] *= fator; });
    }

    const {
      exportarPath = caminhos[0].replace(/\.wav$/i, '_blend.wav'),
      taxasSaida   = ['44k', '48k'],
      pedaleira    = 'generic',
    } = opcoes;

    const tempPath = exportarPath.replace(/\.wav$/i, '_temp.wav');
    const bufTemp  = this._buildWAV(this._interleave(blended), sampleRateRef, numChannels, 32);
    await fs.writeFile(tempPath, bufTemp);

    try {
      const resultado = await this.processar(tempPath, { ...opcoes, exportarPath, taxasSaida });
      resultado.blend = caminhos.map((c, i) => ({
        arquivo: path.basename(c),
        ratio:   parseFloat((ratiosNorm[i] * 100).toFixed(1)) + '%',
      }));
      log('info', `[IRProcessor] Blend: ${resultado.arquivos?.length} arquivo(s)`);
      return resultado;
    } finally {
      await fs.remove(tempPath).catch(() => {});
    }
  }

  async validar(caminho) {
    try {
      const stat      = await fs.stat(caminho);
      const tamanhoMB = stat.size / (1024 * 1024);
      const buffer    = await fs.readFile(caminho);
      const wavData   = this._parseWAV(buffer);
      return {
        valido:         !!wavData,
        tamanhoMB:      parseFloat(tamanhoMB.toFixed(2)),
        dentroDoLimite: tamanhoMB <= LIMITE_IR_MB,
        info: wavData ? {
          sampleRate:    wavData.sampleRate,
          numChannels:   wavData.numChannels,
          bitsPerSample: wavData.bitsPerSample,
          durationS:     parseFloat((wavData.samples.length / wavData.numChannels / wavData.sampleRate).toFixed(3)),
        } : null,
      };
    } catch (err) {
      return { valido: false, erro: err.message };
    }
  }

  // ── FIX A helpers: deinterleave / interleave ──────────────────────────────

  _deinterleave(samples, numChannels) {
    if (numChannels === 1) return [samples instanceof Array ? samples : Array.from(samples)];
    const chLen = Math.floor(samples.length / numChannels);
    return Array.from({ length: numChannels }, (_, c) => {
      const ch = new Array(chLen);
      for (let i = 0; i < chLen; i++) ch[i] = samples[i * numChannels + c] ?? 0;
      return ch;
    });
  }

  _interleave(channels) {
    if (channels.length === 1) return channels[0];
    const chLen = channels[0].length;
    const out   = new Array(chLen * channels.length);
    for (let i = 0; i < chLen; i++) {
      for (let c = 0; c < channels.length; c++) {
        out[i * channels.length + c] = channels[c][i] ?? 0;
      }
    }
    return out;
  }

  // ── FIX B + C: EQ filters ────────────────────────────────────────────────

  _aplicarEQ(samples, eq, sampleRate) {
    let s = samples;

    // High-cut: 1-pole lowpass  y[n] = (1-a)*x[n] + a*y[n-1]
    if (eq.highCut && eq.highCut < sampleRate / 2) {
      const w = 2 * Math.PI * eq.highCut / sampleRate;
      // bilinear approximation: alpha = 1 / (1 + 1/tan(w/2))
      const t    = Math.tan(w / 2);
      const alpha = t / (1 + t);
      let y = 0;
      s = s.map(x => { y = y + alpha * (x - y); return y; });
    }

    // FIX C: Low-shelf — proper 1st-order shelving filter
    if (eq.lowShelf !== 0) {
      const g  = Math.pow(10, eq.lowShelf / 20);
      const fc = 200.0;
      const w  = 2 * Math.PI * fc / sampleRate;
      const t  = Math.tan(w / 2);
      // Shelving: blend of allpass and flat at shelf frequency
      const K  = (g >= 1)
        ? t / (1 + t) * (g - 1)       // boost path
        : (1 / g - 1) * t / (1 + t);  // cut path (use reciprocal)
      let y = 0;
      s = s.map(x => {
        const lp = y + t / (1 + t) * (x - y);
        y = lp;
        return x + (g - 1) * lp;
      });
    }

    // Mid parametric peak: 2-pole biquad
    if (eq.midGain !== 0 && eq.mid) {
      const gain = Math.pow(10, eq.midGain / 20);
      const w0   = 2 * Math.PI * eq.mid / sampleRate;
      const Q    = 1.0;
      const A    = Math.sqrt(gain);
      const cosw = Math.cos(w0);
      const sinw = Math.sin(w0);
      const alpha = sinw / (2 * Q);
      // Peaking EQ coefficients
      const b0 = 1 + alpha * A,  b1 = -2 * cosw,  b2 = 1 - alpha * A;
      const a0 = 1 + alpha / A,  a1 = -2 * cosw,  a2 = 1 - alpha / A;
      const c0 = b0/a0, c1 = b1/a0, c2 = b2/a0, d1 = a1/a0, d2 = a2/a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      s = s.map(x => {
        const y = c0*x + c1*x1 + c2*x2 - d1*y1 - d2*y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
      });
    }

    return s;
  }

  _otimizarParaPedaleira(samples, sampleRate, perfil) {
    let s = samples;

    if (perfil.preGain !== 1) s = s.map(x => x * perfil.preGain);

    // High-cut: 1-pole lowpass (same as _aplicarEQ)
    if (perfil.highCut && perfil.highCut < sampleRate / 2) {
      const w    = 2 * Math.PI * perfil.highCut / sampleRate;
      const t    = Math.tan(w / 2);
      const alpha = t / (1 + t);
      let y = 0;
      s = s.map(x => { y = y + alpha * (x - y); return y; });
    }

    // FIX B: Low-cut (highpass) — correct 1-pole implementation
    // y[n] = alpha * (y[n-1] + x[n] - x[n-1])
    if (perfil.lowCut && perfil.lowCut > 20) {
      const w     = 2 * Math.PI * perfil.lowCut / sampleRate;
      const alpha = 1 / (1 + w);  // stable RC highpass coefficient
      let xPrev = s[0] ?? 0;
      let yPrev = 0;
      s = s.map(x => {
        const y = alpha * (yPrev + x - xPrev);
        xPrev = x;
        yPrev = y;
        return y;
      });
    }

    return s;
  }

  // ── FIX D: Resample with anti-aliasing pre-filter ─────────────────────────

  _resample(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    const ratio     = fromRate / toRate;
    const newLength = Math.round(samples.length / ratio);
    const out       = new Array(newLength);

    // Anti-aliasing: if downsampling, apply lowpass at new Nyquist before interp
    let src = samples;
    if (ratio > 1) {
      const nyq   = toRate / 2;
      const w     = 2 * Math.PI * nyq / fromRate;
      const t     = Math.tan(w / 2);
      const alpha = t / (1 + t);
      let y = 0;
      src = samples.map(x => { y = y + alpha * (x - y); return y; });
    }

    // Linear interpolation (adequate for IR use; cubic would help for music)
    for (let i = 0; i < newLength; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      out[i] = (src[idx] ?? 0) + frac * ((src[idx + 1] ?? 0) - (src[idx] ?? 0));
    }

    log('info', `[IRProcessor] Resample: ${fromRate}→${toRate}Hz (${samples.length}→${out.length})`);
    return out;
  }

  _gerarMetaCamillaDSP(arquivos, sampleRate, channels) {
    const principal = arquivos[0];
    return `# CamillaDSP — IR gerado por BotSquad IR Processor
---
devices:
  samplerate: ${principal?.taxa || sampleRate}
  chunksize: 1024
  queuelimit: 4

filters:
  ir_convolucao:
    type: Conv
    parameters:
      filename: "${principal?.caminho || ''}"
      format: FLOAT32LE
      type: Standard

pipeline:
  - type: Filter
    channel: 0
    names: [ir_convolucao]
${channels > 1 ? '  - type: Filter\n    channel: 1\n    names: [ir_convolucao]' : ''}
`;
  }

  _parseWAV(buffer) {
    try {
      if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
      if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

      let offset = 12;
      let audioFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataSize;

      while (offset < buffer.length - 8) {
        const chunkId   = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        if (chunkId === 'fmt ') {
          audioFormat   = buffer.readUInt16LE(offset + 8);
          numChannels   = buffer.readUInt16LE(offset + 10);
          sampleRate    = buffer.readUInt32LE(offset + 12);
          bitsPerSample = buffer.readUInt16LE(offset + 22);
        } else if (chunkId === 'data') {
          dataOffset = offset + 8;
          dataSize   = chunkSize;
          break;
        }
        offset += 8 + chunkSize;
        if (chunkSize & 1) offset++;  // WAV chunks are word-aligned
      }

      if (!dataOffset) return null;
      if (audioFormat !== 1 && audioFormat !== 3) return null;

      const bytesPerSample = bitsPerSample / 8;
      const numSamples     = Math.floor(dataSize / bytesPerSample);
      const samples        = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const pos = dataOffset + i * bytesPerSample;
        if (pos + bytesPerSample > buffer.length) break;
        if (audioFormat === 3) {
          samples[i] = buffer.readFloatLE(pos);
        } else if (bitsPerSample === 16) {
          samples[i] = buffer.readInt16LE(pos) / 32768.0;
        } else if (bitsPerSample === 24) {
          const b0 = buffer[pos], b1 = buffer[pos+1], b2 = buffer[pos+2];
          let val = (b2 << 16) | (b1 << 8) | b0;
          if (val & 0x800000) val -= 0x1000000;
          samples[i] = val / 8388608.0;
        } else if (bitsPerSample === 32) {
          samples[i] = buffer.readInt32LE(pos) / 2147483648.0;
        }
      }

      return { samples: Array.from(samples), sampleRate, numChannels, bitsPerSample, audioFormat };
    } catch (err) {
      log('error', `[IRProcessor] Parse WAV falhou: ${err.message}`);
      return null;
    }
  }

  // FIX G: _buildWAV — correct blockAlign for stereo (numChannels * bytesPerSample)
  _buildWAV(samples, sampleRate, numChannels, bitsPerSample = 32) {
    const outputFormat   = 3; // IEEE float 32-bit
    const bytesPerSample = 4;
    const blockAlign     = numChannels * bytesPerSample;   // FIX: was numChannels * bytesPerSample already, but hardcoded wrong at position 32
    const byteRate       = sampleRate * blockAlign;
    const dataSize       = samples.length * bytesPerSample;
    const bufferSize     = 44 + dataSize;
    const buf            = Buffer.alloc(bufferSize);

    buf.write('RIFF', 0);
    buf.writeUInt32LE(bufferSize - 8, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(outputFormat, 20);
    buf.writeUInt16LE(numChannels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(byteRate, 28);
    buf.writeUInt16LE(blockAlign, 32);   // FIX G: was hardcoded 32 (wrong for stereo)
    buf.writeUInt16LE(32, 34);           // bits per sample = 32
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < samples.length; i++) {
      buf.writeFloatLE(Math.max(-1.0, Math.min(1.0, samples[i])), 44 + i * 4);
    }

    return buf;
  }
}

export const irProcessor = new IRProcessor();

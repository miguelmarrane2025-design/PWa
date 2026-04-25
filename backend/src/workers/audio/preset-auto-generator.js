// workers/audio/preset-auto-generator.js
// Geração automática de presets por estilo musical com sugestão via IA.
// Suporta: worship, gospel, ambient, rock leve, lead, rhythm (e mais).

import { log } from '../../core/logger.js';
import { parseJsonSafe } from '../../core/json-validator.js';

// Base de presets por estilo (valores iniciais antes da IA refinar)
const PRESETS_BASE = {
  worship: {
    nome: 'Worship Clean',
    descricao: 'Som limpo e cristalino para adoração contemporânea',
    amp: { gain: 2.5, bass: 6, mid: 5, treble: 6.5, presence: 5.5, volume: 7 },
    reverb: { tipo: 'hall', mix: 35, decay: 2.8, pre_delay: 25 },
    delay: { tipo: 'digital', time: '1/4', feedback: 30, mix: 22 },
    eq: { low_cut: 90, high_cut: 8000, mid_boost: { freq: 3200, gain: 2 } },
    compressor: { threshold: -18, ratio: 3, attack: 25, release: 120 },
    ir_sugerida: 'Clean American 2x12',
    notas: 'Ideal para Stratocaster com captadores single-coil. Evite gain acima de 3.'
  },

  gospel: {
    nome: 'Gospel Drive',
    descricao: 'Drive médio com attack definido para gospel urbano',
    amp: { gain: 5.5, bass: 5.5, mid: 6, treble: 6, presence: 6, volume: 7 },
    reverb: { tipo: 'plate', mix: 20, decay: 1.8, pre_delay: 15 },
    delay: { tipo: 'analog', time: '3/16', feedback: 25, mix: 18 },
    eq: { low_cut: 100, high_cut: 9000, mid_boost: { freq: 1200, gain: 1.5 } },
    compressor: { threshold: -14, ratio: 4, attack: 10, release: 80 },
    ir_sugerida: 'British 4x12 V30',
    notas: 'Funciona bem com humbucker. Aumente o mid para cortar na mixagem.'
  },

  ambient: {
    nome: 'Ambient Pad',
    descricao: 'Som etéreo e espacial para texturas de fundo',
    amp: { gain: 1.8, bass: 5, mid: 4, treble: 7, presence: 4.5, volume: 6 },
    reverb: { tipo: 'shimmer', mix: 65, decay: 6.0, pre_delay: 40 },
    delay: { tipo: 'reverse', time: '1/2d', feedback: 55, mix: 40 },
    eq: { low_cut: 120, high_cut: 7000, mid_boost: { freq: 5000, gain: 1 } },
    compressor: { threshold: -22, ratio: 2, attack: 50, release: 300 },
    ir_sugerida: 'Small Room Ribbon',
    notas: 'Volume de entrada baixo para maior sustain. Combine com volume swell.'
  },

  rock_leve: {
    nome: 'Light Rock',
    descricao: 'Crunch leve com punch e clareza',
    amp: { gain: 6.5, bass: 6, mid: 5.5, treble: 6.5, presence: 6.5, volume: 7.5 },
    reverb: { tipo: 'room', mix: 15, decay: 1.2, pre_delay: 10 },
    delay: { tipo: 'tape', time: '1/4', feedback: 20, mix: 12 },
    eq: { low_cut: 80, high_cut: 10000, mid_boost: { freq: 800, gain: -1 } },
    compressor: { threshold: -12, ratio: 5, attack: 8, release: 60 },
    ir_sugerida: 'American 1x12 Alnico',
    notas: 'Humbucker no braço para rhythm, ponte para lead. Reduza mid para menos nasal.'
  },

  lead: {
    nome: 'Lead Sustain',
    descricao: 'Lead com sustain longo e presença na mixagem',
    amp: { gain: 7.5, bass: 5, mid: 7, treble: 6, presence: 7, volume: 7 },
    reverb: { tipo: 'spring', mix: 18, decay: 1.5, pre_delay: 8 },
    delay: { tipo: 'digital', time: '1/4t', feedback: 35, mix: 20 },
    eq: { low_cut: 100, high_cut: 9500, mid_boost: { freq: 2400, gain: 3 } },
    compressor: { threshold: -10, ratio: 6, attack: 5, release: 50 },
    ir_sugerida: 'British 2x12 Greenback',
    notas: 'Mid boost em 2.4kHz é essencial para o lead "cantar". Ajuste presence conforme sala.'
  },

  rhythm: {
    nome: 'Tight Rhythm',
    descricao: 'Rhythm definido e tight com ataque rápido',
    amp: { gain: 7, bass: 4.5, mid: 5, treble: 7, presence: 7, volume: 8 },
    reverb: { tipo: 'room', mix: 8, decay: 0.8, pre_delay: 5 },
    delay: { tipo: null, time: null, feedback: 0, mix: 0 },
    eq: { low_cut: 110, high_cut: 11000, mid_boost: { freq: 700, gain: -2 } },
    compressor: { threshold: -8, ratio: 8, attack: 3, release: 40 },
    ir_sugerida: 'Mesa 4x12 Modern',
    notas: 'Corte de low-mid em 700Hz evita embarralhamento na mixagem com bumbo.'
  }
};

class PresetAutoGenerator {

  /**
   * Gera preset completo para um estilo, guitarra e contexto.
   * @param {object} params - { estilo, guitarra, captador, pedaleira, contexto, ajustes }
   * @param {function} openaiStrong - Função de chamada IA
   * @returns {object} Preset completo com configurações e notas
   */
  async gerar(params, openaiStrong) {
    const {
      estilo = 'worship',
      guitarra = null,
      captador = null,
      pedaleira = null,
      contexto = 'igreja',
      ajustes = []
    } = params;

    log('info', `[PresetAutoGenerator] Gerando preset: ${estilo} / ${guitarra || 'guitarra genérica'}`);

    // 1. Carrega base do estilo (ou cria genérica se estilo desconhecido)
    const base = this._obterBase(estilo);

    // 2. Se IA disponível, refina com contexto específico
    if (openaiStrong) {
      return await this._refinarComIA(base, params, openaiStrong);
    }

    // 3. Fallback: aplica ajustes manuais sem IA
    return this._aplicarAjustes(base, params);
  }

  /**
   * Refina preset via IA com contexto específico de instrumento e ambiente.
   */
  async _refinarComIA(base, params, openaiStrong) {
    const { estilo, guitarra, captador, pedaleira, contexto, ajustes } = params;

    const prompt = `Você é um técnico de som especialista em guitarras para ${contexto}.
Ajuste este preset base para o estilo "${estilo}" considerando o equipamento específico.

PRESET BASE:
${JSON.stringify(base, null, 2)}

EQUIPAMENTO:
- Guitarra: ${guitarra || 'não especificada'}
- Captadores: ${captador || 'não especificados'}
- Pedaleira/Amp: ${pedaleira || 'não especificada'}
- Contexto: ${contexto}
- Ajustes solicitados: ${ajustes.join(', ') || 'nenhum'}

Retorne APENAS JSON válido com o preset refinado, mantendo a mesma estrutura do base.
Adicione um campo "justificativa" explicando as principais mudanças feitas.
Adicione "compatibilidade" com score 0-10 indicando adequação deste estilo para o equipamento.`;

    try {
      const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
      const presetRefinado = parseJsonSafe(resposta, null);

      if (!presetRefinado || !presetRefinado.amp) {
        log('warn', '[PresetAutoGenerator] IA retornou preset inválido, usando base');
        return this._aplicarAjustes(base, params);
      }

      log('info', `[PresetAutoGenerator] Preset refinado por IA (compatibilidade: ${presetRefinado.compatibilidade}/10)`);
      return { ...presetRefinado, geradoPor: 'ia', estilo, guitarra, pedaleira };

    } catch (err) {
      log('error', `[PresetAutoGenerator] Erro IA: ${err.message}, usando base`);
      return this._aplicarAjustes(base, params);
    }
  }

  /**
   * Aplica ajustes sem IA baseado em regras pré-definidas.
   */
  _aplicarAjustes(base, params) {
    const { guitarra = '', captador = '', ajustes = [] } = params;
    const preset = JSON.parse(JSON.stringify(base)); // deep clone

    // Ajustes por tipo de guitarra
    if (guitarra.toLowerCase().includes('strato') || captador.toLowerCase().includes('single')) {
      preset.amp.gain = Math.max(preset.amp.gain - 1, 1);
      preset.amp.treble = Math.min(preset.amp.treble + 0.5, 10);
      preset.notas += ' | Single-coil: gain reduzido, treble aumentado.';
    }

    if (guitarra.toLowerCase().includes('les paul') || captador.toLowerCase().includes('hum')) {
      preset.amp.mid = Math.min(preset.amp.mid + 0.5, 10);
      preset.amp.bass = Math.max(preset.amp.bass - 0.5, 0);
      preset.notas += ' | Humbucker: mid aumentado, bass reduzido para clareza.';
    }

    // Ajustes por objetivos tonais
    if (ajustes.includes('menos_harsh') || ajustes.includes('mais_suave')) {
      preset.amp.treble = Math.max(preset.amp.treble - 1, 0);
      preset.amp.presence = Math.max(preset.amp.presence - 1, 0);
      preset.eq.high_cut = Math.min(preset.eq.high_cut - 500, 7000);
    }

    if (ajustes.includes('mais_brilho') || ajustes.includes('mais_presenca')) {
      preset.amp.treble = Math.min(preset.amp.treble + 1, 10);
      preset.amp.presence = Math.min(preset.amp.presence + 1, 10);
    }

    if (ajustes.includes('mais_graves') || ajustes.includes('mais_corpo')) {
      preset.amp.bass = Math.min(preset.amp.bass + 1, 10);
      preset.eq.low_cut = Math.max(preset.eq.low_cut - 20, 40);
    }

    if (ajustes.includes('mais_definicao') || ajustes.includes('mais_tight')) {
      preset.amp.gain = Math.max(preset.amp.gain - 0.5, 1);
      preset.compressor.ratio = Math.min(preset.compressor.ratio + 2, 10);
      preset.compressor.attack = Math.max(preset.compressor.attack - 5, 1);
    }

    preset.geradoPor = 'regras';
    preset.estilo = params.estilo;
    return preset;
  }

  /**
   * Retorna base do estilo ou um preset genérico se não encontrado.
   */
  _obterBase(estilo) {
    const chave = estilo.toLowerCase().replace(/\s+/g, '_');
    if (PRESETS_BASE[chave]) return JSON.parse(JSON.stringify(PRESETS_BASE[chave]));

    // Genérico: baseado em worship como padrão mais seguro
    log('warn', `[PresetAutoGenerator] Estilo desconhecido: ${estilo}, usando base genérica`);
    const generico = JSON.parse(JSON.stringify(PRESETS_BASE.worship));
    generico.nome = `Preset ${estilo}`;
    generico.descricao = `Preset base para ${estilo}`;
    return generico;
  }

  /**
   * Lista todos os estilos disponíveis com descrições.
   */
  listarEstilos() {
    return Object.entries(PRESETS_BASE).map(([chave, preset]) => ({
      id: chave,
      nome: preset.nome,
      descricao: preset.descricao,
      ir_sugerida: preset.ir_sugerida
    }));
  }

  /**
   * Formata preset para exibição no Telegram.
   */
  formatarTexto(preset) {
    let texto = `🎸 *${preset.nome || 'Preset'}*\n`;
    texto += `_${preset.descricao || ''}_\n\n`;

    if (preset.amp) {
      texto += `🔊 *Amp:*\n`;
      texto += `• Gain: ${preset.amp.gain} | Bass: ${preset.amp.bass} | Mid: ${preset.amp.mid}\n`;
      texto += `• Treble: ${preset.amp.treble} | Presence: ${preset.amp.presence}\n\n`;
    }

    if (preset.reverb?.tipo) {
      texto += `🌊 *Reverb:* ${preset.reverb.tipo} — Mix: ${preset.reverb.mix}% | Decay: ${preset.reverb.decay}s\n`;
    }

    if (preset.delay?.tipo) {
      texto += `⏱ *Delay:* ${preset.delay.tipo} — ${preset.delay.time} | FB: ${preset.delay.feedback}% | Mix: ${preset.delay.mix}%\n`;
    }

    if (preset.ir_sugerida) {
      texto += `\n📦 *IR Sugerida:* ${preset.ir_sugerida}\n`;
    }

    if (preset.notas) {
      texto += `\n💡 *Notas:* ${preset.notas}\n`;
    }

    if (preset.justificativa) {
      texto += `\n🤖 *Ajuste IA:* ${preset.justificativa}\n`;
    }

    if (preset.compatibilidade !== undefined) {
      texto += `\n⭐ Compatibilidade: ${preset.compatibilidade}/10\n`;
    }

    return texto;
  }
}

export const presetAutoGenerator = new PresetAutoGenerator();

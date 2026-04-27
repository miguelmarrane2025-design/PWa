// agents/audio/audioGearSquad.js
// Squad completo de áudio/gear: GearRecognition → PedalConfig → PresetDesigner → DeviceCompat → ToneReview
// Provider: OpenAI via chat/chatFast. Nunca Anthropic.

import { chat, chatFast } from '../../lib/llm.js';
import { runWithReview } from '../../core/runWithReview.js';
import { agentMemoryService } from '../../memory/agentMemoryService.js';
import { logger } from '../../lib/logger.js';

// ── Catálogos de equipamentos suportados ──────────────────────────────────────
const KNOWN_DEVICES = {
  'M-Vave Tank-G':    { blocks: 6, hasIR: true,  irSlots: 2, cabSim: true,  note: 'IR interno de baixa resolução. Suporta IR externo WAV 48k/mono.' },
  'M-Vave BlackBox':  { blocks: 5, hasIR: true,  irSlots: 1, cabSim: true,  note: 'Interface + efeitos. Bom para home studio.' },
  'Zoom G1 Four':     { blocks: 5, hasIR: false, irSlots: 0, cabSim: true,  note: 'Sem IR nativo. Simulação de cab interna.' },
  'Line 6 HX Stomp':  { blocks: 6, hasIR: true,  irSlots: 4, cabSim: true,  note: 'Processador premium. Suporta IR de alta qualidade.' },
  'Line 6 HX Effects':{ blocks: 9, hasIR: false, irSlots: 0, cabSim: false, note: 'Apenas efeitos. Sem amp/cab.' },
  'Boss GT-1':        { blocks: 6, hasIR: false, irSlots: 0, cabSim: true,  note: 'Sem IR. Simulações internas.' },
};

const MIC_CATALOG = ['SM57','R121','MD421','E906','C414','U87','SM7B','Coles 4038'];
const POSITIONS   = ['cap_center','cap_edge','cone','edge','off_axis','room_close','room_far'];

const WORSHIP_STYLES = {
  'worship ambient':        { gain: 'limpo', reverb: 'hall longo', delay: 'dotted 8th', comp: 'leve', eq: 'cortar 300-500Hz, realçar 3-5kHz' },
  'worship balanced':       { gain: 'baixo', reverb: 'room médio', delay: 'quarter',    comp: 'médio', eq: 'cortar 200Hz, realçar 2-4kHz' },
  'lead emocional':         { gain: 'médio', reverb: 'plate',      delay: 'dotted 8th', comp: 'leve',  eq: 'cortar 100-300Hz, realçar 1-2kHz' },
  'base limpa':             { gain: 'zero',  reverb: 'nenhum',     delay: 'nenhum',     comp: 'forte', eq: 'cortar abaixo de 100Hz, flat médios' },
  'Morada / Hillsong':      { gain: 'baixo', reverb: 'hall',       delay: 'dotted 8th', comp: 'médio', eq: 'bright, cortar 400Hz' },
  'Bethel / Jesus Culture': { gain: 'médio', reverb: 'verb longo', delay: 'ping pong',  comp: 'leve',  eq: 'vintage, realçar 800Hz e 4kHz' },
};

// ── GearRecognitionAgent ──────────────────────────────────────────────────────
export async function gearRecognitionAgent({ message, imageDescription, userId }) {
  logger.info(`[GearRecognition] userId=${userId}`);

  // Check known devices first
  for (const [name, spec] of Object.entries(KNOWN_DEVICES)) {
    if (message?.toLowerCase().includes(name.toLowerCase())) {
      return { device: name, confidence: 0.95, specs: spec, identified: true };
    }
  }

  const prompt = `Você é um especialista em pedaleiras e processadores de guitarra.
Identifique o equipamento mencionado e retorne as especificações técnicas.

MENSAGEM: ${message || ''}
${imageDescription ? `DESCRIÇÃO DA IMAGEM: ${imageDescription}` : ''}

EQUIPAMENTOS CONHECIDOS: ${Object.keys(KNOWN_DEVICES).join(', ')}

Retorne JSON:
{
  "device": "nome exato do equipamento",
  "confidence": 0.0,
  "hasIR": false,
  "irSlots": 0,
  "cabSim": false,
  "blocks": 0,
  "limitations": ["limitação 1"],
  "identified": true,
  "notes": "observações técnicas"
}
Se não identificar, retorne identified: false e device: "desconhecido".`;

  const raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 600 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return { ...JSON.parse(m[0]), raw };
  } catch {}
  return { device: 'desconhecido', identified: false, confidence: 0, raw };
}

// ── PresetDesignerAgent ───────────────────────────────────────────────────────
export async function presetDesignerAgent({ device, deviceSpecs, style, guitar, userId }) {
  logger.info(`[PresetDesigner] device=${device} style=${style}`);

  const styleGuide = WORSHIP_STYLES[style?.toLowerCase()] || WORSHIP_STYLES['worship balanced'];
  const ctx = await agentMemoryService.loadAgentContext('audio-gear');
  const goodRef = ctx.goodExamples.slice(-2).map(e => e.output?.chain || '').filter(Boolean).join(' | ');

  const prompt = `Você é um designer de presets especialista em guitarra worship.

PEDALEIRA: ${device}
SPECS: ${JSON.stringify(deviceSpecs || {})}
ESTILO: ${style || 'worship balanced'}
GUITARRA: ${guitar || 'Stratocaster/Telecaster'}
GUIA DE ESTILO: ${JSON.stringify(styleGuide)}
${goodRef ? `REFERÊNCIAS APROVADAS: ${goodRef}` : ''}

Crie um preset profissional e realista para esta pedaleira.

REGRAS:
- Respeite os blocos disponíveis (${deviceSpecs?.blocks || 5} blocos máximo)
- ${deviceSpecs?.hasIR ? 'Pode usar IR' : 'Sem IR — use cab sim disponível'}
- Cadeia essencial: gate → comp → amp → cab/IR → EQ → modulação → delay → reverb
- Priorize encaixe na mix worship (cortar graves embolados, controle de médios)
- Não invente parâmetros que a pedaleira não suporta

Retorne JSON:
{
  "presetName": "nome do preset",
  "style": "${style}",
  "device": "${device}",
  "chain": [
    { "block": 1, "type": "Noise Gate", "params": { "threshold": "-60dB", "decay": "fast" } }
  ],
  "irRecommended": "nome sugerido de IR",
  "micRecommended": "${MIC_CATALOG[0]}",
  "mixTips": ["dica 1 para encaixar na mix"],
  "notes": "observações de uso"
}`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 2000 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? { ...JSON.parse(m[0]), raw } : { presetName: style, raw };
  } catch { return { presetName: style, raw }; }
}

// ── DeviceCompatibilityAgent ──────────────────────────────────────────────────
export async function deviceCompatibilityAgent({ preset, deviceSpecs, userId }) {
  logger.info(`[DeviceCompat] checking compatibility`);

  if (!deviceSpecs || preset?.compatible !== false) return { ...preset, compatible: true, adaptations: [] };

  const prompt = `Você é um especialista em compatibilidade de pedaleiras.
Adapte este preset para funcionar corretamente na pedaleira.

PRESET: ${JSON.stringify(preset)}
SPECS DA PEDALEIRA: ${JSON.stringify(deviceSpecs)}

Se algum bloco não é suportado, substitua por alternativa compatível.
Se IR não é suportado, use cab sim.
Se poucos blocos, priorize: gate → amp → cab → delay → reverb.

Retorne JSON com o preset adaptado, adicionando campo "adaptations": ["mudança 1"].`;

  const raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 1500 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? { ...JSON.parse(m[0]), raw } : preset;
  } catch { return preset; }
}

// ── ToneReviewAgent ───────────────────────────────────────────────────────────
export async function toneReviewAgent({ preset, style, userId }) {
  logger.info(`[ToneReview] reviewing preset`);

  const prompt = `Você é um engenheiro de som especialista em mixagem worship.
Revise este preset e avalie se o timbre vai encaixar bem na mix.

PRESET: ${JSON.stringify(preset)}
ESTILO ALVO: ${style || 'worship'}

Avalie:
- Grave: vai embolhar com baixo/bumbo? (cortar abaixo de 80-100Hz)
- Médio-baixo: está congestionando? (300-500Hz crítico)
- Médio: presença e corpo (800Hz-2kHz)
- Agudo: brilho sem ser abelhudo (4-8kHz)
- Sustain e dinâmica: compressor adequado?
- Reverb/delay: espaço adequado sem poluir?

Retorne JSON:
{
  "score": 0,
  "passed": false,
  "notes": ["nota específica"],
  "eqAdjustments": { "80Hz": "-3dB", "300Hz": "-2dB" },
  "mixTips": ["dica prática"],
  "verdict": "aprovado/precisa ajuste/reprovar"
}`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 1000 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      return { ...parsed, score: Math.max(0, Math.min(100, parseInt(parsed.score ?? 70))) };
    }
  } catch {}
  return { score: 70, passed: true, notes: [], eqAdjustments: {}, mixTips: [] };
}

async function presetRefinerAgent({ device, deviceSpecs, style, guitar, userId }, draft, notes) {
  const currentPreset = draft?.content ?? draft ?? {};
  const prompt = `Refine este preset de guitarra com base nas observacoes do revisor.

PEDALEIRA: ${device}
SPECS: ${JSON.stringify(deviceSpecs || {})}
ESTILO: ${style || 'worship balanced'}
GUITARRA: ${guitar || 'Stratocaster/Telecaster'}
PRESET ATUAL: ${JSON.stringify(currentPreset)}
CRITICAS:
${(notes || []).map((note, index) => `${index + 1}. ${note}`).join('\n') || 'Nenhuma critica objetiva'}

Retorne APENAS JSON no mesmo formato do preset original, corrigindo os pontos criticados.`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 1800 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? { content: JSON.parse(m[0]), raw } : draft;
  } catch {
    return draft;
  }
}

// ── Fluxo principal ───────────────────────────────────────────────────────────
export async function runAudioGearFlow({ message, imageDescription, style, guitar, userId }) {
  logger.info(`[AudioGearSquad] start userId=${userId}`);

  // 1. Identificar equipamento
  const gearInfo = await gearRecognitionAgent({ message, imageDescription, userId });

  if (!gearInfo.identified) {
    return {
      content: `❓ **Equipamento não identificado**\n\nNão consegui identificar a pedaleira pela mensagem. Por favor, informe o modelo exato (ex: "M-Vave Tank-G", "Zoom G1 Four", "HX Stomp").\n\n**Equipamentos com suporte completo:** ${Object.keys(KNOWN_DEVICES).join(', ')}`,
      agent: 'audio-gear-squad',
      metadata: { gearInfo },
    };
  }

  const deviceSpecs = KNOWN_DEVICES[gearInfo.device] || gearInfo;
  const normalizedStyle = style || 'worship balanced';

  // 2. Criar + revisar + refinar preset
  const reviewed = await runWithReview({
    specialist: async () => {
      const preset = await presetDesignerAgent({ device: gearInfo.device, deviceSpecs, style: normalizedStyle, guitar, userId });
      const compatible = await deviceCompatibilityAgent({ preset, deviceSpecs, userId });
      return { content: compatible, raw: JSON.stringify(compatible) };
    },
    reviewer: async (input, draft) => {
      const preset = draft?.content ?? draft;
      return toneReviewAgent({ preset, style: normalizedStyle, userId });
    },
    refiner: async (input, draft, notes) => {
      const refined = await presetRefinerAgent({
        device: gearInfo.device,
        deviceSpecs,
        style: normalizedStyle,
        guitar,
        userId,
      }, draft, notes);
      const compatible = await deviceCompatibilityAgent({ preset: refined?.content ?? refined, deviceSpecs, userId });
      return { content: compatible, raw: JSON.stringify(compatible) };
    },
    input: { message, style: normalizedStyle, guitar, device: gearInfo.device },
    minScore: 80,
    maxAttempts: 3,
    memoryKey: 'audio-gear',
    userId,
  });

  const preset = reviewed.output?.content ?? reviewed.output ?? {};
  const review = {
    score: reviewed.qualityScore,
    passed: reviewed.passed,
    notes: reviewed.reviewNotes || [],
  };

  // 5. Formatar resposta
  const chain = preset.chain?.map((b, i) => `  **${i + 1}. ${b.type}**${b.params ? ': ' + Object.entries(b.params).map(([k,v]) => `${k}=${v}`).join(', ') : ''}`).join('\n') || '';

  const lines = [
    `🎸 **Preset ${preset.presetName || style} — ${gearInfo.device}**`,
    ``,
    `**Equipamento:** ${gearInfo.device}`,
    deviceSpecs.note ? `_${deviceSpecs.note}_` : '',
    ``,
    `**Cadeia de sinal:**`,
    chain,
    ``,
    preset.irRecommended ? `**IR recomendado:** ${preset.irRecommended}` : '',
    preset.micRecommended ? `**Microfone:** ${preset.micRecommended}` : '',
    ``,
    preset.mixTips?.length ? `**Dicas de mix:**\n${preset.mixTips.map(t => `• ${t}`).join('\n')}` : '',
    ``,
    review.score >= 75 ? `✅ **Timbre aprovado** (score ${review.score}/100)` : `⚠️ **Atenção ao timbre** (score ${review.score}/100)`,
    review.notes?.length ? review.notes.map(n => `• ${n}`).join('\n') : '',
    review.eqAdjustments && Object.keys(review.eqAdjustments).length ? `\n**Ajustes de EQ sugeridos:** ${JSON.stringify(review.eqAdjustments)}` : '',
    preset.notes ? `\n💡 ${preset.notes}` : '',
  ].filter(Boolean).join('\n');

  return { content: lines, agent: 'audio-gear-squad', metadata: { gearInfo, preset, review, reviewLoop: reviewed } };
}

export default { runAudioGearFlow, gearRecognitionAgent, presetDesignerAgent, toneReviewAgent };

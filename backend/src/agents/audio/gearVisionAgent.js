// agents/audio/gearVisionAgent.js
// Reconhece imagens de pedaleiras, pedais, amp modelers, plugins.
// Usa visão via provider-manager (OpenAI vision). Nunca chama provider direto.
// Integra com audioGearSquad para criar presets compatíveis.

import { chat }          from '../../lib/llm.js';
import { chatFast }      from '../../lib/llm.js';
import { logger }        from '../../lib/logger.js';
import { readFile }      from 'fs/promises';

// Catálogo de equipamentos prioritários com capacidades reais
const GEAR_CATALOG = {
  // Budget
  'M-Vave Tank-G':      { tier: 'budget',   hasIR: true,  irSlots: 2, blocks: 6,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: ['IR de baixa res', 'Sem MIDI avançado', 'Sem snapshots'] },
  'M-Vave BlackBox':    { tier: 'budget',   hasIR: true,  irSlots: 1, blocks: 5,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: ['Interface combo', 'Latência em IR carregado'] },
  'Cube Baby':          { tier: 'budget',   hasIR: false, irSlots: 0, blocks: 4,  cabSim: true,  sampleRates: ['44100'],           limitations: ['Sem IR externo', 'Sem MIDI'] },
  'Valeton GP-100':     { tier: 'budget',   hasIR: true,  irSlots: 1, blocks: 7,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: ['IR básico'] },
  'Zoom G1 Four':       { tier: 'budget',   hasIR: false, irSlots: 0, blocks: 5,  cabSim: true,  sampleRates: ['44100'],           limitations: ['Sem IR nativo', 'Cab Sim interno', 'Máx 5 blocos simultâneos'] },
  'Zoom G3n':           { tier: 'mid',      hasIR: false, irSlots: 0, blocks: 7,  cabSim: true,  sampleRates: ['44100'],           limitations: ['Sem IR externo'] },
  'NUX MG-30':          { tier: 'mid',      hasIR: true,  irSlots: 4, blocks: 8,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: [] },
  // Mid
  'Mooer GE200':        { tier: 'mid',      hasIR: true,  irSlots: 1, blocks: 8,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: ['Apenas 1 slot IR'] },
  'Boss GT-1':          { tier: 'mid',      hasIR: false, irSlots: 0, blocks: 6,  cabSim: true,  sampleRates: ['44100'],           limitations: ['Sem IR externo'] },
  'Boss ME-80':         { tier: 'mid',      hasIR: false, irSlots: 0, blocks: 8,  cabSim: true,  sampleRates: ['44100'],           limitations: ['Sem IR'] },
  'Hotone Ampero':      { tier: 'mid',      hasIR: true,  irSlots: 4, blocks: 7,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: [] },
  'Line 6 POD Go':      { tier: 'mid',      hasIR: true,  irSlots: 4, blocks: 8,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: ['4 blocos processamento simultâneo'] },
  // Pro
  'Line 6 HX Stomp':   { tier: 'pro',      hasIR: true,  irSlots: 4, blocks: 6,  cabSim: true,  sampleRates: ['44100','48000'],    limitations: ['Máx 6 blocos ativos'] },
  'Line 6 HX Effects': { tier: 'pro',      hasIR: false, irSlots: 0, blocks: 9,  cabSim: false, sampleRates: ['44100','48000'],    limitations: ['Apenas efeitos, sem amp/cab'] },
  'Line 6 Helix':      { tier: 'high_end', hasIR: true,  irSlots: 8, blocks: 32, cabSim: true,  sampleRates: ['44100','48000','96000'], limitations: [] },
  'Boss GT-1000':      { tier: 'pro',      hasIR: true,  irSlots: 2, blocks: 10, cabSim: true,  sampleRates: ['44100','48000'],    limitations: [] },
  // High-end
  'Headrush MX5':       { tier: 'pro',      hasIR: true,  irSlots: 6, blocks: 14, cabSim: true,  sampleRates: ['44100','48000'],    limitations: [] },
  'Fractal FM3':        { tier: 'high_end', hasIR: true,  irSlots: 128, blocks: 12, cabSim: true, sampleRates: ['44100','48000','96000'], limitations: [] },
  'Fractal FM9':        { tier: 'high_end', hasIR: true,  irSlots: 128, blocks: 12, cabSim: true, sampleRates: ['44100','48000','96000'], limitations: [] },
  'Fractal Axe-Fx III': { tier: 'high_end', hasIR: true,  irSlots: 512, blocks: 24, cabSim: true, sampleRates: ['44100','48000','96000'], limitations: [] },
  'Neural DSP Quad Cortex': { tier: 'high_end', hasIR: true, irSlots: 1024, blocks: 8, cabSim: true, sampleRates: ['44100','48000'], limitations: [] },
  'Kemper Profiler':    { tier: 'high_end', hasIR: true,  irSlots: 512, blocks: 8, cabSim: true, sampleRates: ['44100','48000'],    limitations: [] },
  'Strymon Iridium':    { tier: 'high_end', hasIR: true,  irSlots: 3,  blocks: 3, cabSim: true, sampleRates: ['44100','48000'],    limitations: ['Apenas amp+cab+room, sem multi-fx'] },
  'UAFX Ruby':          { tier: 'high_end', hasIR: false, irSlots: 0,  blocks: 1, cabSim: true, sampleRates: ['44100','48000'],    limitations: ['Pedal único de amp sim'] },
};

const VISION_SYSTEM = `Você é o GearVisionAgent do BotSquad.
Analise imagens de equipamentos de guitarra e retorne um JSON detalhado.

REGRAS CRÍTICAS:
1. NÃO invente valores que não são visíveis.
2. SEPARE claramente: visto (visible), inferido (inferred), não identificável (unreadable).
3. Se a imagem estiver borrada ou cortada, coloque em questionsForUser.
4. Se o equipamento não for reconhecido, liste candidatos prováveis em device.candidates.
5. Informe limitações REAIS do equipamento reconhecido.
6. Não dependa só de OCR — use contexto visual + catálogo.

Retorne APENAS JSON (sem markdown):
{
  "recognized": true,
  "confidence": 0.0,
  "device": {
    "brand": "",
    "model": "",
    "category": "multi_fx|ir_loader|amp_modeler|plugin|audio_interface|pedal|unknown",
    "tier": "budget|mid|pro|high_end",
    "knownLimitations": [],
    "candidates": []
  },
  "visibleSettings": {
    "chain": [],
    "amp": {},
    "cab": {},
    "ir": {},
    "eq": {},
    "compressor": {},
    "noiseGate": {},
    "drive": {},
    "modulation": {},
    "delay": {},
    "reverb": {},
    "output": {},
    "global": {}
  },
  "unreadableFields": [],
  "inferred": [],
  "warnings": [],
  "presetRecommendations": [],
  "questionsForUser": []
}`;

// ── Main Agent ────────────────────────────────────────────────────────────────
export async function gearVisionAgent({ imagePath, imageBase64, context = '', targetStyle = '', knownDevice = '', userId }) {
  logger.info(`[GearVisionAgent] userId=${userId} imagePath=${imagePath} knownDevice=${knownDevice}`);

  // Se knownDevice informado, enriquece com catálogo
  if (knownDevice) {
    for (const [name, spec] of Object.entries(GEAR_CATALOG)) {
      if (knownDevice.toLowerCase().includes(name.toLowerCase())) {
        return {
          recognized: true,
          confidence: 0.95,
          device: {
            brand: name.split(' ').slice(0, -1).join(' ') || name,
            model: name,
            category: spec.hasIR ? 'multi_fx' : 'multi_fx',
            tier: spec.tier,
            knownLimitations: spec.limitations,
            candidates: [],
          },
          visibleSettings: { chain: [], amp: {}, cab: {}, ir: { slots: spec.irSlots }, eq: {}, compressor: {}, noiseGate: {}, drive: {}, modulation: {}, delay: {}, reverb: {}, output: {}, global: { sampleRates: spec.sampleRates } },
          unreadableFields: ['Valores de parâmetros não visíveis — envie print da tela ou foto dos knobs'],
          inferred: [`Equipamento tem ${spec.blocks} blocos`, spec.hasIR ? `Suporta IR externo (${spec.irSlots} slots)` : 'Sem suporte a IR externo'],
          warnings: spec.limitations,
          presetRecommendations: [`Criar preset ${targetStyle || 'worship'} compatível com ${name}`],
          questionsForUser: ['Quais parâmetros do amp estão configurados atualmente?', 'Qual o estilo de timbre desejado?'],
        };
      }
    }
  }

  // Sem imagem real disponível — análise textual
  if (!imagePath && !imageBase64) {
    const raw = await chatFast(
      [
        { role: 'system', content: VISION_SYSTEM },
        { role: 'user', content: `Analise o equipamento descrito:\n${context || 'Pedido sem contexto'}\nEstilo alvo: ${targetStyle || 'worship'}` },
      ],
      { userId, max_tokens: 1200 }
    );
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch {}
    return { recognized: false, confidence: 0, device: { brand: '', model: '', category: 'unknown', tier: 'unknown', knownLimitations: [], candidates: [] }, visibleSettings: {}, unreadableFields: [], inferred: [], warnings: ['Sem imagem fornecida'], presetRecommendations: [], questionsForUser: ['Por favor envie uma foto ou print do equipamento'] };
  }

  // Com imagem — usar vision via chat (OpenAI vision)
  let imageContent;
  try {
    if (imageBase64) {
      imageContent = { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } };
    } else {
      const buf    = await readFile(imagePath);
      const b64    = buf.toString('base64');
      const ext    = imagePath.split('.').pop().toLowerCase();
      const mime   = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      imageContent = { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } };
    }
  } catch (err) {
    logger.warn(`[GearVisionAgent] image read error: ${err.message}`);
    return { recognized: false, confidence: 0, warnings: [`Não foi possível ler a imagem: ${err.message}`], questionsForUser: ['Por favor reenvie a imagem'] };
  }

  const userContent = [
    imageContent,
    { type: 'text', text: `${context ? `Contexto: ${context}\n` : ''}Estilo alvo: ${targetStyle || 'worship balanced'}\nIdentifique o equipamento e retorne JSON conforme instrução.` },
  ];

  // Usar chat padrão — provider-manager gerencia o modelo
  const raw = await chat(
    [
      { role: 'system', content: VISION_SYSTEM },
      { role: 'user', content: userContent },
    ],
    { userId, max_tokens: 1500 }
  );

  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      // Enriquecer com catálogo se reconhecido
      const modelName = parsed.device?.model || '';
      for (const [name, spec] of Object.entries(GEAR_CATALOG)) {
        if (modelName.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(modelName.toLowerCase())) {
          parsed.device.knownLimitations = [...(parsed.device.knownLimitations || []), ...spec.limitations].filter((v, i, a) => a.indexOf(v) === i);
          if (!parsed.visibleSettings.ir) parsed.visibleSettings.ir = {};
          parsed.visibleSettings.ir.slots = spec.irSlots;
          parsed.inferred = [...(parsed.inferred || []), `${spec.blocks} blocos disponíveis`, spec.hasIR ? `Suporta IR: ${spec.irSlots} slots` : 'Sem IR externo'];
          break;
        }
      }
      return parsed;
    }
  } catch {}

  return { recognized: false, confidence: 0, warnings: ['Não foi possível identificar o equipamento'], questionsForUser: ['Pode descrever o modelo ou enviar uma foto mais nítida?'] };
}

// ── Integração com AudioGearSquad ─────────────────────────────────────────────
export async function createPresetFromImage({ imagePath, imageBase64, targetStyle, knownDevice, context, userId }) {
  logger.info(`[GearVisionAgent] createPresetFromImage style=${targetStyle}`);

  const vision = await gearVisionAgent({ imagePath, imageBase64, targetStyle, knownDevice, context, userId });

  if (!vision.recognized && vision.questionsForUser?.length) {
    return {
      content: `🔍 **Gear Vision Agent**\n\nNão foi possível identificar o equipamento com certeza.\n\n**Perguntas:**\n${vision.questionsForUser.map(q => `- ${q}`).join('\n')}\n\n${vision.warnings?.length ? `⚠️ **Avisos:** ${vision.warnings.join(', ')}` : ''}`,
      agent:   'gear_vision',
    };
  }

  // Encaminhar para audioGearSquad com contexto do vision
  const deviceCtx = `Equipamento: ${vision.device?.model || 'desconhecido'} (${vision.device?.tier})
Limitações: ${(vision.device?.knownLimitations || []).join(', ') || 'nenhuma conhecida'}
Inferências: ${(vision.inferred || []).join(', ')}
Configurações visíveis: ${JSON.stringify(vision.visibleSettings || {}).slice(0, 500)}`;

  try {
    const { runAudioGearFlow } = await import('./audioGearSquad.js');
    const preset = await runAudioGearFlow({
      message:  `Crie um preset ${targetStyle || 'worship'} para ${vision.device?.model || 'este equipamento'}. ${deviceCtx}`,
      style:    targetStyle || 'worship balanced',
      userId,
    });

    const visionSummary = `🔍 **Gear Vision** | Dispositivo: **${vision.device?.brand} ${vision.device?.model}** | Confiança: ${Math.round((vision.confidence || 0) * 100)}%
${vision.warnings?.length ? `\n⚠️ ${vision.warnings.join(' | ')}` : ''}
${vision.questionsForUser?.length ? `\n❓ ${vision.questionsForUser[0]}` : ''}`;

    return {
      content:  `${visionSummary}\n\n${preset?.content || 'Preset gerado.'}`,
      agent:    'gear_vision + audio_gear_squad',
      metadata: { vision, preset: preset?.metadata },
    };
  } catch (err) {
    logger.warn(`[GearVisionAgent] audioGearSquad failed: ${err.message}`);
    return {
      content:  `🔍 **Gear Vision**\n\nEquipamento identificado: **${vision.device?.brand} ${vision.device?.model}**\n\n${deviceCtx}\n\n⚠️ Não foi possível gerar o preset automático. Tente: \`[agent:audio]\` com o nome do equipamento.`,
      agent:    'gear_vision',
      metadata: { vision },
    };
  }
}

export default { gearVisionAgent, createPresetFromImage };

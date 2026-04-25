export const MICROPHONES = [
  { id: 'sm57', name: 'Shure SM57', type: 'dynamic', tone: 'médio agressivo, presença, ataque', bestFor: ['rock', 'worship lead', 'mix cutting'] },
  { id: 'r121', name: 'Royer R-121', type: 'ribbon', tone: 'grave cheio, agudo suave, corpo', bestFor: ['worship', 'ambient', 'clean'] },
  { id: 'md421', name: 'Sennheiser MD421', type: 'dynamic', tone: 'médio-grave forte, punch', bestFor: ['base', 'rock', 'corpo'] },
  { id: 'e906', name: 'Sennheiser e906', type: 'dynamic', tone: 'direto, moderno, presença controlada', bestFor: ['live', 'pedaleira', 'guitarra moderna'] },
  { id: 'c414', name: 'AKG C414', type: 'condenser', tone: 'aberto, detalhado, hi-fi', bestFor: ['clean', 'studio', 'ambient'] },
  { id: 'u87', name: 'Neumann U87', type: 'condenser', tone: 'rico, balanceado, tridimensional', bestFor: ['premium studio', 'clean', 'lead emocional'] },
  { id: 'sm7b', name: 'Shure SM7B', type: 'dynamic', tone: 'escuro, controlado, encorpado', bestFor: ['timbre agressivo suavizado'] },
  { id: 'coles4038', name: 'Coles 4038', type: 'ribbon', tone: 'vintage, macio, grave bonito', bestFor: ['vintage', 'worship warm', 'jazz/blues'] },
];

export const MIC_POSITIONS = [
  { id: 'cap_center', name: 'Centro do falante', tone: 'mais brilho, ataque, presença' },
  { id: 'cap_edge', name: 'Borda da calota', tone: 'equilíbrio entre brilho e corpo' },
  { id: 'cone', name: 'Cone', tone: 'mais corpo, menos agressividade' },
  { id: 'edge', name: 'Borda do falante', tone: 'mais grave, menos agudo' },
  { id: 'off_axis', name: 'Off-axis', tone: 'agudos suavizados, menos aspereza' },
  { id: 'room_close', name: 'Room curto', tone: 'leve ambiência sem embolar' },
  { id: 'room_far', name: 'Room distante', tone: 'ambiência maior, bom para textura' },
];

export const IR_BLEND_PRESETS = [
  { id: 'worship_balanced', name: 'Worship Balanced', mics: [{ mic: 'sm57', position: 'cap_edge', blend: 55 }, { mic: 'r121', position: 'cone', blend: 45 }], description: 'Presença com corpo, bom para worship moderno' },
  { id: 'vox_chime', name: 'Vox Chime', mics: [{ mic: 'sm57', position: 'cap_edge', blend: 45 }, { mic: 'c414', position: 'off_axis', blend: 35 }, { mic: 'r121', position: 'cone', blend: 20 }], description: 'Brilho Vox com suavidade' },
  { id: 'matchless_open', name: 'Matchless Open', mics: [{ mic: 'e906', position: 'cap_edge', blend: 40 }, { mic: 'r121', position: 'cone', blend: 40 }, { mic: 'u87', position: 'room_close', blend: 20 }], description: 'Som aberto, tridimensional e premium' },
  { id: 'live_safe', name: 'Live Safe Mix', mics: [{ mic: 'sm57', position: 'cap_edge', blend: 60 }, { mic: 'md421', position: 'cone', blend: 40 }], description: 'Corta na mix sem ficar abelhudo' },
  { id: 'ambient_clean', name: 'Ambient Clean', mics: [{ mic: 'r121', position: 'cone', blend: 45 }, { mic: 'c414', position: 'room_close', blend: 35 }, { mic: 'coles4038', position: 'room_far', blend: 20 }], description: 'Limpo, largo e macio' },
  { id: 'lead_emotional', name: 'Lead Emotional', mics: [{ mic: 'sm57', position: 'cap_edge', blend: 50 }, { mic: 'u87', position: 'room_close', blend: 25 }, { mic: 'r121', position: 'cone', blend: 25 }], description: 'Lead presente com dimensão' },
];

const MIC_MAP = {
  sm57: 'sm57_cap',
  r121: 'r121_cap',
  condenser: 'condenser',
  md421: 'md421',
  e906: 'e906',
  c414: 'c414',
  u87: 'u87',
  sm7b: 'sm7b',
  coles4038: 'coles4038',
};

const POSITION_MAP = {
  center: 'center',
  cap_center: 'center',
  cap_edge: 'edge',
  cone: 'center',
  room_close: 'edge',
  room_far: 'off_axis',
  edge: 'edge',
  off_axis: 'off_axis',
  'off-axis': 'off_axis',
};

const DISTANCE_MAP = {
  close: 'close',
  mid: 'mid',
  far: 'far',
};

export function aplicarPerfilMic({ micA, micB, blend = 50 } = {}) {
  const a = normalizeMic(micA);
  const b = normalizeMic(micB);
  const amount = clamp(Number.parseFloat(blend), 0, 100, 50);

  return {
    primaryMic: amount >= 50 ? a : b,
    secondaryMic: amount >= 50 ? b : a,
    blend: amount,
    mic: amount >= 50 ? a : b,
  };
}

export function simularPosicao(position = 'center') {
  return POSITION_MAP[String(position).toLowerCase()] || 'center';
}

export function simularDistancia(distance = 'close') {
  return DISTANCE_MAP[String(distance).toLowerCase()] || 'close';
}

export function retornarParametrosPipeline(input = {}) {
  const micProfile = aplicarPerfilMic(input);
  const tone = {
    body: clamp(Number.parseFloat(input.body), -6, 6, 0),
    brightness: clamp(Number.parseFloat(input.brightness), -6, 6, 0),
    presence: clamp(Number.parseFloat(input.presence), -6, 6, 0),
    harshControl: clamp(Number.parseFloat(input.harshControl), 0, 6, 0),
  };

  return {
    mic: micProfile.mic,
    micA: micProfile.primaryMic,
    micB: micProfile.secondaryMic,
    micBlend: micProfile.blend,
    micPosition: simularPosicao(input.position),
    micDistance: simularDistancia(input.distance),
    eqManual: {
      lowShelf: tone.body,
      mid: 3200,
      midGain: tone.presence - tone.harshControl,
      highShelf: tone.brightness - (tone.harshControl * 0.5),
      highCut: tone.harshControl > 0 ? 14000 : 16000,
    },
  };
}

export function generateIRFileName({
  ampA = 'Vox AC30',
  ampB = '',
  cabinet = '',
  preset = '',
  microphones = [],
  sampleRate = '48k',
} = {}) {
  const amps = ampB ? `${cleanName(ampA)}+${cleanName(ampB)}_Blend` : cleanName(ampA);
  const cab = cabinet ? `_${cleanName(cabinet)}` : '';
  const presetName = preset ? `_${cleanName(preset)}` : '';
  const micName = microphones.length
    ? `_${microphones.map(m => {
      const mic = String(m.mic || m.id || '').toUpperCase().replace('R121', 'R121');
      const position = m.position ? `-${cleanName(m.position)}` : '';
      return `${mic}${position}`;
    }).join('_')}`
    : '';
  return `${amps}${cab}${presetName}${micName}_${sampleRate}.wav`.replace(/_+/g, '_');
}

function cleanName(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeMic(value) {
  return MIC_MAP[String(value || 'sm57').toLowerCase()] || 'sm57_cap';
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

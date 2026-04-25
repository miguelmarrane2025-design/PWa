const MIC_LABELS = {
  sm57: 'SM57',
  sm57_cap: 'SM57',
  sm57_edge: 'SM57',
  r121: 'R121',
  ribbon_cap: 'R121',
  md421: 'MD421',
  e906: 'E906',
  c414: 'C414',
  u87: 'U87',
  sm7b: 'SM7B',
  coles4038: 'COLES4038',
};

const POSITION_LABELS = {
  cap_center: 'CapCenter',
  cap_edge: 'CapEdge',
  cone: 'Cone',
  edge: 'Edge',
  off_axis: 'OffAxis',
  room_close: 'RoomClose',
  room_far: 'RoomFar',
  center: 'Center',
};

export function sanitizeFilePart(value) {
  return String(value || '')
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s+.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function compactPascal(value) {
  return humanize(value).replace(/\s+/g, '');
}

function humanize(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function sampleRateLabel(sampleRate) {
  if (sampleRate === 'BASE') return 'BASE';
  const raw = String(sampleRate || '').toLowerCase();
  if (raw === '44k' || raw === '44.1k' || raw === '44_1khz') return '44k';
  if (raw === '48k') return '48k';
  if (raw === '96k') return '96k';

  const sr = Number(sampleRate || 48000);
  if (sr === 44.1 || sr === 44100) return '44k';
  if (sr === 48 || sr === 48000) return '48k';
  if (sr === 96 || sr === 96000) return '96k';
  if (Number.isFinite(sr)) return `${Math.round(sr / (sr > 1000 ? 1000 : 1))}k`;
  return '48k';
}

function normalizeMicName(mic) {
  if (!mic) return null;
  const raw = typeof mic === 'string'
    ? mic
    : mic.name || mic.id || mic.mic || '';
  const key = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return MIC_LABELS[key] || String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizePositionName(mic) {
  if (!mic || typeof mic === 'string') return null;
  const position = mic.position || mic.micPosition;
  if (!position) return null;
  const key = String(position).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return POSITION_LABELS[key] || compactPascal(position);
}

function getPreset(config = {}) {
  return config.presetName || config.preset || config.configName || config.config_name;
}

function getMicrophones(config = {}) {
  const microphones = config.microphones || config.mics || [];
  return Array.isArray(microphones) ? microphones : [microphones];
}

export function generateIRBaseName(config = {}) {
  const ampA = config.ampA || config.amp || config.primaryAmp;
  const ampB = config.ampB || config.secondaryAmp;
  const preset = getPreset(config);

  if (ampA && ampB) {
    return `${sanitizeFilePart(ampA)}+${sanitizeFilePart(ampB)}_Blend`;
  }

  if (ampA) return sanitizeFilePart(ampA);
  if (preset) return sanitizeFilePart(compactPascal(preset));

  return 'Default';
}

export function generateIRFileName(config = {}) {
  const parts = [];
  const preset = getPreset(config);
  const ampA = config.ampA || config.amp || config.primaryAmp;
  const ampB = config.ampB || config.secondaryAmp;

  parts.push(generateIRBaseName(config));

  if (ampA || ampB) {
    parts.push(sanitizeFilePart(compactPascal(preset || 'Default')));
  } else {
    parts.push('Generic');
  }

  const micLabel = getMicrophones(config)
    .map(mic => {
      const micName = normalizeMicName(mic);
      const position = config.includePositions ? normalizePositionName(mic) : null;
      return micName && position ? `${micName}-${position}` : micName;
    })
    .filter(Boolean)
    .join('-');

  if (micLabel) parts.push(sanitizeFilePart(micLabel));
  parts.push(sampleRateLabel(config.sampleRate || 48000));

  return `${parts.filter(Boolean).join('_')}.wav`;
}

export function generateIRDisplayName(config = {}) {
  const ampA = config.ampA || config.amp || config.primaryAmp;
  const ampB = config.ampB || config.secondaryAmp;
  const preset = getPreset(config) || 'Default';
  const sampleRate = sampleRateLabel(config.sampleRate || 48000);

  const micLabel = getMicrophones(config)
    .map(normalizeMicName)
    .filter(Boolean)
    .join(' + ');

  const ampLabel = ampA && ampB
    ? `${humanize(ampA)} + ${humanize(ampB)}`
    : ampA
      ? humanize(ampA)
      : null;

  return ampLabel
    ? [ampLabel, humanize(preset), micLabel, sampleRate].filter(Boolean).join(' · ')
    : [humanize(preset), 'Generic', micLabel, sampleRate].filter(Boolean).join(' · ');
}

export function enrichIRJob(job = {}) {
  const config = {
    ...(job.config_json || job.config || {}),
    config_name: job.config_name,
    preset: job.preset || job.config_name,
  };
  const displayName = job.display_name || job.displayName || generateIRDisplayName(config);
  const fileName = job.file_name || job.fileName || job.output_file_name || generateIRFileName(config);
  const downloadName = job.download_name || job.downloadName || fileName;

  return {
    ...job,
    id: job.id,
    jobId: job.jobId || job.id,
    preset: job.preset || job.config_name || config.preset || 'default',
    displayName,
    fileName,
    downloadName,
    outputFileName: job.output_file_name || job.outputFileName || fileName,
    downloadUrl: `/api/audio/jobs/${job.id}/download`,
    config,
  };
}

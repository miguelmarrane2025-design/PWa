import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

const OUT_ROOT = path.join(config.storage.output, 'videos');
const TEMP_ROOT = path.join(config.storage.temp, 'video');

export async function processVideoJob({
  jobId = uuidv4(),
  videoId,
  inputPath,
  cutType = 'auto',
  platform = 'auto',
  captionStyle = 'classic',
  instruction = '',
  onProgress = async () => {},
}) {
  await onProgress({ progress: 5, message: 'Validando arquivo...' });
  await assertFile(inputPath);

  const outputDir = path.join(OUT_ROOT, jobId);
  const tempDir = path.join(TEMP_ROOT, jobId);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });

  await onProgress({ progress: 12, message: 'Lendo metadados com ffprobe...' });
  const probe = await ffprobe(inputPath);
  if (!probe.duration) throw new Error('Nao foi possivel ler a duracao do video.');

  await onProgress({ progress: 22, message: 'Extraindo audio...' });
  const wavPath = path.join(tempDir, `${videoId || jobId}.wav`);
  await extractAudio(inputPath, wavPath).catch(err => {
    logger.warn(`[VideoPipeline:${jobId}] audio extract failed: ${err.message}`);
  });

  await onProgress({ progress: 36, message: 'Detectando pausas...' });
  const silences = await detectSilence(inputPath);

  await onProgress({ progress: 52, message: 'Encontrando melhores momentos...' });
  const cuts = detectHotMoments({
    duration: probe.duration,
    silences,
    instruction,
    cutType,
    platform,
  });

  const outputs = [];
  const total = Math.max(1, cuts.length);
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    await onProgress({
      progress: 58 + Math.round((i / total) * 34),
      message: `Renderizando corte ${i + 1}/${cuts.length}...`,
    });
    const filename = `cut_${String(i + 1).padStart(2, '0')}_${slug(cut.title)}.mp4`;
    const outputPath = path.join(outputDir, filename);
    await renderClip({
      inputPath,
      start: cut.start,
      end: cut.end,
      outputPath,
      platform,
      captionStyle,
      probe,
    });
    outputs.push({
      title: cut.title,
      reason: cut.reason,
      start: cut.start,
      end: cut.end,
      file: filename,
      path: outputPath,
      url: `/video/download/${jobId}/${filename}`,
    });
  }

  const manifest = {
    jobId,
    videoId,
    inputPath,
    probe,
    cutType,
    platform,
    captionStyle,
    instruction,
    silences,
    cuts,
    outputs,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  await onProgress({ progress: 100, message: 'Finalizado' });
  return manifest;
}

export async function ffprobe(inputPath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);
  const data = JSON.parse(stdout || '{}');
  const video = (data.streams || []).find(s => s.codec_type === 'video') || {};
  const audio = (data.streams || []).find(s => s.codec_type === 'audio') || {};
  const fps = parseFps(video.avg_frame_rate || video.r_frame_rate);
  return {
    duration: Number.parseFloat(data.format?.duration || video.duration || 0),
    width: video.width || 0,
    height: video.height || 0,
    fps,
    videoCodec: video.codec_name || null,
    audioCodec: audio.codec_name || null,
    hasAudio: Boolean(audio.codec_name),
  };
}

export async function extractAudio(inputPath, outputPath) {
  await run('ffmpeg', ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outputPath], {
    timeout: 60 * 60 * 1000,
  });
  return outputPath;
}

export async function detectSilence(inputPath) {
  const result = await run('ffmpeg', ['-i', inputPath, '-af', 'silencedetect=n=-35dB:d=0.4', '-f', 'null', '-'], {
    timeout: 60 * 60 * 1000,
    allowFailure: true,
  });
  const text = `${result.stdout}\n${result.stderr}`;
  const starts = [];
  const silences = [];
  for (const line of text.split('\n')) {
    const start = line.match(/silence_start:\s*([0-9.]+)/);
    if (start) starts.push(Number.parseFloat(start[1]));
    const end = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (end) {
      silences.push({
        start: starts.shift() ?? Math.max(0, Number.parseFloat(end[1]) - Number.parseFloat(end[2])),
        end: Number.parseFloat(end[1]),
        duration: Number.parseFloat(end[2]),
      });
    }
  }
  return silences;
}

export function detectHotMoments({ duration, silences = [], instruction = '', cutType = 'auto', platform = 'auto' }) {
  const mode = cutType === 'auto'
    ? (/cenas?\s+quentes?|melhores?\s+momentos?|reten/i.test(instruction) || duration > 150 ? 'short_form' : 'long_form')
    : cutType;

  const speech = buildSpeechSegments(duration, silences);
  if (mode === 'long_form') {
    return [{
      title: 'Versao longa refinada',
      start: 0,
      end: round(duration),
      reason: 'Versao longa preservando o conteudo principal para limpeza e refinamento.',
    }];
  }

  const targetMin = 30;
  const targetMax = platform === 'youtube' ? 120 : 90;
  const candidates = speech
    .filter(s => s.end - s.start >= 8)
    .map((segment, index) => expandSegment(segment, duration, targetMin, targetMax, index))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));

  const cuts = [];
  for (const candidate of candidates) {
    if (cuts.some(c => overlaps(c, candidate))) continue;
    cuts.push({
      title: `Corte ${cuts.length + 1} - Momento Forte`,
      start: candidate.start,
      end: candidate.end,
      reason: /cenas?\s+quentes?/i.test(instruction)
        ? 'Trecho priorizado como cena quente: fala continua, pouca pausa e potencial de retencao.'
        : 'Trecho com fala continua e baixa concentracao de silencio.',
    });
    if (cuts.length >= 3) break;
  }

  if (!cuts.length) {
    const length = Math.min(targetMax, Math.max(targetMin, duration));
    cuts.push({
      title: 'Corte 1 - Momento Forte',
      start: 0,
      end: round(length),
      reason: 'Fallback inicial por falta de pausas detectaveis.',
    });
  }

  return cuts;
}

export async function renderClip({ inputPath, start, end, outputPath, platform = 'auto', probe = {} }) {
  const duration = Math.max(1, end - start);
  const vertical = ['tiktok', 'reels', 'shorts', 'auto'].includes(platform);
  const horizontal = (probe.width || 0) > (probe.height || 0);
  const complexVertical = vertical && horizontal;
  const filter = vertical
    ? horizontal
      ? '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:1[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]'
      : 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p'
    : 'scale=1920:-2:force_original_aspect_ratio=decrease,format=yuv420p';

  const args = [
    '-y',
    '-ss', String(start),
    '-t', String(duration),
    '-i', inputPath,
  ];
  if (complexVertical) {
    args.push('-filter_complex', filter, '-map', '[v]', '-map', '0:a?');
  } else {
    args.push('-vf', filter);
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    outputPath,
  );

  await run('ffmpeg', args, { timeout: 3 * 60 * 60 * 1000 });
}

function buildSpeechSegments(duration, silences) {
  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start - cursor > 1) segments.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (duration - cursor > 1) segments.push({ start: cursor, end: duration });
  return segments.length ? segments : [{ start: 0, end: duration }];
}

function expandSegment(segment, duration, minLen, maxLen, index) {
  const rawLen = segment.end - segment.start;
  const length = Math.min(maxLen, Math.max(minLen, rawLen));
  const start = Math.max(0, segment.start - Math.max(0, (length - rawLen) / 2));
  const end = Math.min(duration, start + length);
  return { start: round(Math.max(0, end - length)), end: round(end), index };
}

function overlaps(a, b) {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function parseFps(value = '') {
  const [a, b] = String(value).split('/').map(Number);
  if (!a) return 0;
  return b ? a / b : a;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function slug(value) {
  return String(value || 'clip').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
}

async function assertFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(`Arquivo de video nao encontrado: ${filePath}`);
  return stat;
}

function run(command, args, { timeout = 30 * 60 * 1000, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timeout`));
    }, timeout);
    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || allowFailure) return resolve({ stdout, stderr, code });
      reject(new Error(stderr.split('\n').slice(-8).join('\n') || `${command} exited with ${code}`));
    });
  });
}

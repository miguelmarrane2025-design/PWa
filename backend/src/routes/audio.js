// routes/audio.js  — Audio processing: upload, presets, EQ, blend, sample-rate export

import { Router }         from 'express';
import multer             from 'multer';
import path               from 'path';
import { promises as fs } from 'fs';
import { requireAuth }    from '../middleware/auth.js';
import { processAudio, checkCamilla } from '../integrations/camilla.js';
import { processAudioFile }           from '../integrations/audio-pipeline.js';
import { irProcessor }    from '../workers/audio/ir-processor.js';
import { query }          from '../db/index.js';
import { config }         from '../config/index.js';
import { logger }         from '../lib/logger.js';
import { v4 as uuidv4 }   from 'uuid';
import { IR_BLEND_PRESETS, MICROPHONES, MIC_POSITIONS, retornarParametrosPipeline } from '../audio/mic-sim.js';
import { enrichIRJob, generateIRDisplayName, generateIRFileName } from '../audio/irNaming.js';

const router = Router();

const upload = multer({
  dest:   config.storage.upload,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(wav|mp3|flac|ogg|aac|m4a)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only audio files are accepted'));
  },
});

// ── GET /audio/health ──────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const version = await checkCamilla();
    res.json({ camilla: true, version, status: 'ok' });
  } catch (err) {
    res.json({ camilla: false, error: err.message, status: 'degraded',
      note: 'ir-processor fallback is active' });
  }
});

// ── GET /audio/configs ─────────────────────────────────────────────────────
router.get('/configs', requireAuth, async (req, res) => {
  try {
    await fs.mkdir(config.camilla.configDir, { recursive: true });
    const files = await fs.readdir(config.camilla.configDir);
    const configs = files.filter(f => f.endsWith('.yml'))
      .map(f => ({ name: f.replace('.yml', ''), filename: f }));
    res.json(configs);
  } catch { res.json([]); }
});

router.get('/catalog', requireAuth, (req, res) => {
  res.json({ microphones: MICROPHONES, positions: MIC_POSITIONS, blendPresets: IR_BLEND_PRESETS });
});

// ── POST /audio/process ─────────────────────────────────────────────────────
// Standard process: upload WAV + pick preset + optional EQ + sample rate
//
// Body (multipart):
//   file        — audio file
//   config      — preset name (default / worship-clean / bethel-ambient …)
//   sampleRate  — '44k' | '48k' | '96k'  (default: '44k')
//   mic         — mic profile: sm57_cap | sm57_edge | ribbon_cap | condenser | dual_sm57
//   pedaleira   — hx_stomp | helix | quad_cortex | kemper | fractal | generic
//   eq_low      — low shelf dB  (-12 to +12, default 0)
//   eq_mid      — mid gain dB   (-12 to +12, default 0)
//   eq_mid_freq — mid center Hz (200–8000, default 2500)
//   eq_high     — high shelf dB (-12 to +12, default 0)
//   eq_high_cut — high cut Hz   (4000–20000, default 16000)
router.post('/process', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Audio file required' });

  await fs.mkdir(config.storage.output, { recursive: true }).catch(() => {});

  const configName  = req.body.config      || 'default';
  const sampleRate  = req.body.sampleRate  || '44k';
  const micSim      = retornarParametrosPipeline({
    micA: req.body.micA || req.body.mic,
    micB: req.body.micB || req.body.mic,
    blend: req.body.micBlend || 100,
    position: req.body.micPosition || req.body.position,
    distance: req.body.micDistance || req.body.distance,
    body: req.body.body,
    brightness: req.body.brightness,
    presence: req.body.presence,
    harshControl: req.body.harshControl,
  });
  const mic         = req.body.mic || micSim.mic || null;
  const micPosition = micSim.micPosition;
  const micDistance = micSim.micDistance;
  const pedaleira   = req.body.pedaleira   || 'generic';
  const guitar      = normalizeGuitar(req.body.guitar);
  const style       = normalizeStyle(req.body.style);
  const ampA        = req.body.ampA || 'Vox AC30';
  const ampB        = req.body.ampB || '';
  const cabinet     = req.body.cabinet || '';
  const blendPreset = req.body.blendPreset || '';
  const include96k  = String(req.body.include96k || '').toLowerCase() === 'true';
  const intents     = (() => {
    try { return JSON.parse(req.body.intents || '[]'); }
    catch { return []; }
  })();

  // Manual EQ params
  const manualEQ = {
    lowShelf:  parseFloat(req.body.eq_low)      || 0,
    mid:       parseInt(req.body.eq_mid_freq)    || 2500,
    midGain:   parseFloat(req.body.eq_mid)       || 0,
    highShelf: parseFloat(req.body.eq_high)      || 0,
    highCut:   parseInt(req.body.eq_high_cut)    || 16000,
  };
  const eq = mergeEq(manualEQ, micSim.eqManual);
  const hasManualEQ = eq.lowShelf !== 0 || eq.midGain !== 0 || eq.highShelf !== 0 || eq.highCut !== 16000;
  const jobConfig = buildIRConfig({
    configName, sampleRate, ampA, ampB, cabinet, blendPreset, style, guitar, pedaleira,
    micA: req.body.micA || req.body.mic || 'sm57',
    micB: req.body.micB || 'r121',
    micPosition: req.body.micPosition || req.body.position || 'cap_edge',
    micBPosition: req.body.micBPosition || 'cone',
  });
  const displayName = generateIRDisplayName(jobConfig);
  const fileName = generateIRFileName(jobConfig);

  // Create job record immediately and return jobId — process async
  const jobId = uuidv4();
  await query(
    `INSERT INTO audio_jobs
       (id, user_id, status, input_path, config_name, display_name, file_name, download_name, output_file_name, config_json)
     VALUES ($1,$2,'processing',$3,$4,$5,$6,$7,$8,$9)`,
    [jobId, req.user.id, req.file.path, configName, displayName, fileName, fileName, fileName, JSON.stringify(jobConfig)],
  ).catch(() => {});

  // Respond immediately with jobId — frontend polls /audio/jobs/:id
  res.status(202).json({ jobId, status: 'processing', sampleRate, displayName, fileName, downloadName: fileName });

  // Process in background
  (async () => {
    const inputFilePath = req.file.path;
    try {
      let outputPath;

      if (hasManualEQ || mic || pedaleira !== 'generic' || guitar !== 'generic' || style !== 'generic' || intents.length > 0) {
        const outputDir = path.join(config.storage.output, 'audio', 'ir', jobId);
        await fs.mkdir(outputDir, { recursive: true });
        const sampleRates = include96k ? ['44.1', '48', '96'] : ['44.1', '48'];
        const fileBase = generateIRFileName({ ...jobConfig, sampleRate: 'BASE' }).replace('_BASE.wav', '');
        const outputBase = path.join(outputDir, fileBase);
        const irResult = await irProcessor.processar(inputFilePath, {
          exportarPath: outputBase,
          mic, micPosition, micDistance,
          pedaleira,
          guitar, style, intents,
          taxasSaida: sampleRates,
          eqManual: hasManualEQ ? eq : null,
        });
        await writeIRDocs(outputDir, {
          ampA, ampB, cabinet, blendPreset, micSim, sampleRates, eq, style, guitar,
        });
        const exportedFiles = await renameIRExports(irResult.arquivos || [], outputDir, {
          ...jobConfig,
        });
        outputPath = exportedFiles[0] || irResult.arquivos?.[0]?.caminho || `${outputBase}_44.1kHz.wav`;
      } else {
        const pipeResult = await processAudioFile({
          inputPath: inputFilePath, userId: req.user.id, configName, jobId, recordJob: false,
          irOpts: { pedaleira, taxasSaida: [sampleRate] },
          namingConfig: jobConfig,
        });
        outputPath = pipeResult.outputPath;
      }

      const outputFileName = path.basename(outputPath || fileName);
      await query(
        `UPDATE audio_jobs
         SET status='done', output_path=$1, file_name=$2, download_name=$2, output_file_name=$2, updated_at=NOW()
         WHERE id=$3`,
        [outputPath, outputFileName, jobId],
      ).catch(() => {});

      logger.info(`[AudioRoute] Job ${jobId} done`);
    } catch (err) {
      logger.error(`[AudioRoute] Job ${jobId} failed: ${err.message}`);
      await query(
        `UPDATE audio_jobs SET status='error', error=$1, updated_at=NOW() WHERE id=$2`,
        [err.message, jobId],
      ).catch(() => {});
    } finally {
      // FIX #12: always delete the uploaded input file after processing (success or failure)
      await fs.unlink(inputFilePath).catch(() => {});
    }
  })();
});

function mergeEq(base, extra) {
  return {
    lowShelf:  (base.lowShelf || 0) + (extra?.lowShelf || 0),
    mid:       extra?.mid || base.mid || 2500,
    midGain:   (base.midGain || 0) + (extra?.midGain || 0),
    highShelf: (base.highShelf || 0) + (extra?.highShelf || 0),
    highCut:   Math.min(base.highCut || 16000, extra?.highCut || 16000),
  };
}

function normalizeGuitar(value = 'generic') {
  const map = {
    gretsch_duesenberg: 'semi_hollow',
    humbucker: 'les_paul',
    single_coil: 'stratocaster',
  };
  return map[value] || value || 'generic';
}

function normalizeStyle(value = 'generic') {
  const map = {
    jesus_culture: 'worship',
    rock_leve: 'rock',
    lead_emocional: 'lead',
    base_ritmica: 'mix_ready',
  };
  return map[value] || value || 'generic';
}

function buildIRConfig({
  configName,
  sampleRate,
  ampA,
  ampB,
  cabinet,
  blendPreset,
  style,
  guitar,
  pedaleira,
  micA,
  micB,
  micPosition,
  micBPosition,
} = {}) {
  return {
    ampA,
    ampB,
    amp: ampA,
    cabinet,
    preset: blendPreset || configName || style || 'default',
    presetName: blendPreset || configName || style || 'default',
    microphones: [
      { mic: micA || 'sm57', position: micPosition || 'cap_edge' },
      { mic: micB || 'r121', position: micBPosition || 'cone' },
    ].filter(m => m.mic),
    sampleRate,
    device: pedaleira,
    style,
    guitar,
  };
}

async function writeIRDocs(outputDir, { ampA, ampB, cabinet, blendPreset, micSim, sampleRates, eq, style, guitar }) {
  const settings = {
    amps: [ampA, ampB].filter(Boolean),
    cabinet,
    preset: blendPreset,
    guitar,
    style,
    mics: [
      { mic: micSim.primaryMic || micSim.mic, position: micSim.micPosition, blend: micSim.micBlend || micSim.blend },
      { mic: micSim.secondaryMic, position: micSim.micDistance, blend: micSim.micBlend != null ? 100 - micSim.micBlend : null },
    ].filter(m => m.mic),
    eq: {
      lowCut: 80,
      highCut: eq.highCut,
      presence: `${eq.midGain >= 0 ? '+' : ''}${eq.midGain}dB`,
      harshnessControl: eq.highShelf < 0 || eq.midGain < 0 ? 'enabled' : 'disabled',
    },
    sampleRates: sampleRates.map(s => ({ '44.1': 44100, '48': 48000, '96': 96000 }[s] || s)),
  };
  await fs.writeFile(path.join(outputDir, 'settings.json'), JSON.stringify(settings, null, 2));
  await fs.writeFile(path.join(outputDir, 'readme.txt'), [
    'BotSquad IR Export',
    `Amps: ${settings.amps.join(' + ') || 'N/D'}`,
    `Cabinet: ${cabinet || 'N/D'}`,
    `Preset: ${blendPreset || style || 'N/D'}`,
    `Sample rates: ${settings.sampleRates.join(', ')}`,
  ].join('\n'));
}

async function renameIRExports(files, outputDir, naming) {
  const renamed = [];
  for (const file of files) {
    const original = file.caminho;
    const label = file.taxa === 44100 ? '44k' : file.taxa === 48000 ? '48k' : file.taxa === 96000 ? '96k' : `${Math.round(file.taxa / 1000)}k`;
    const filename = generateIRFileName({ ...naming, sampleRate: label });
    const target = path.join(outputDir, filename);
    if (original && original !== target) await fs.rename(original, target).catch(async () => fs.copyFile(original, target));
    renamed.push(target);
  }
  return renamed;
}

// ── POST /audio/blend ───────────────────────────────────────────────────────
// Blend two uploaded IR files with ratio control
//
// Body (multipart):
//   ir_a       — first IR file
//   ir_b       — second IR file
//   ratio_a    — blend ratio for A (0.0–1.0, default 0.5)
//   ratio_b    — blend ratio for B (0.0–1.0, default 0.5)
//   sampleRate — output sample rate
//   pedaleira  — pedaleira profile
router.post('/blend', requireAuth, upload.fields([
  { name: 'ir_a', maxCount: 1 },
  { name: 'ir_b', maxCount: 1 },
]), async (req, res) => {
  const fileA = req.files?.ir_a?.[0];
  const fileB = req.files?.ir_b?.[0];

  if (!fileA || !fileB) {
    return res.status(400).json({ error: 'Both ir_a and ir_b files are required' });
  }

  await fs.mkdir(config.storage.output, { recursive: true }).catch(() => {});

  const ratioA    = Math.min(1, Math.max(0, parseFloat(req.body.ratio_a) || 0.5));
  const ratioB    = Math.min(1, Math.max(0, parseFloat(req.body.ratio_b) || 0.5));
  const sampleRate = req.body.sampleRate || '44k';
  const pedaleira  = req.body.pedaleira  || 'generic';
  const blendConfig = {
    preset: 'blend',
    presetName: 'Blend',
    sampleRate,
    device: pedaleira,
  };

  const jobId = uuidv4();
  const outputDir = path.join(config.storage.output, 'audio', 'ir', jobId);
  const outputBase = path.join(outputDir, generateIRFileName({ ...blendConfig, sampleRate: 'BASE' }).replace('_BASE.wav', ''));

  try {
    await fs.mkdir(outputDir, { recursive: true });
    const result = await irProcessor.blendIRs(
      [fileA.path, fileB.path],
      [ratioA, ratioB],
      {
        exportarPath: outputBase,
        pedaleira,
        taxasSaida: [sampleRate],
      },
    );

    const exported  = result.arquivos?.[0];
    const outputFileName = generateIRFileName(blendConfig);
    const outputPath = path.join(outputDir, outputFileName);
    if (exported?.caminho && exported.caminho !== outputPath) {
      await fs.rename(exported.caminho, outputPath).catch(async () => fs.copyFile(exported.caminho, outputPath));
    }

    await query(
      `INSERT INTO audio_jobs
         (id, user_id, status, input_path, output_path, config_name, display_name, file_name, download_name, output_file_name, config_json)
       VALUES ($1,$2,'done',$3,$4,'blend',$5,$6,$6,$6,$7)`,
      [jobId, req.user.id, fileA.path, outputPath, generateIRDisplayName(blendConfig), outputFileName, JSON.stringify(blendConfig)],
    ).catch(() => {});

    res.status(202).json({
      jobId,
      status: 'done',
      method: 'blend',
      sampleRate,
      ratioA,
      ratioB,
      displayName: generateIRDisplayName(blendConfig),
      fileName: outputFileName,
      downloadName: outputFileName,
    });
  } catch (err) {
    logger.error(`[AudioRoute] Blend error: ${err.message}`);
    res.status(500).json({ error: err.message?.includes('inválido') || err.message?.includes('Blend') ? err.message : 'Erro ao processar áudio.' });
  } finally {
    await Promise.allSettled([fileA.path, fileB.path].map(p => fs.unlink(p).catch(() => {})));
  }
});

// ── GET /audio/jobs ────────────────────────────────────────────────────────
router.get('/jobs', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, status, config_name, display_name, file_name, download_name, output_file_name,
            config_json, created_at, updated_at, error
     FROM audio_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id],
  );
  res.json(rows.map(enrichIRJob));
});

// ── GET /audio/jobs/:id ────────────────────────────────────────────────────
router.get('/jobs/:id', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM audio_jobs WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Job not found' });
  res.json(enrichIRJob(rows[0]));
});

// ── GET /audio/jobs/:id/download ──────────────────────────────────────────
router.get('/jobs/:id/download', requireAuth, async (req, res) => {
  const { rows } = await query(
    "SELECT * FROM audio_jobs WHERE id=$1 AND user_id=$2 AND status='done'",
    [req.params.id, req.user.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Job not ready or not found' });
  const job = enrichIRJob(rows[0]);
  try {
    await fs.access(rows[0].output_path);
    res.download(rows[0].output_path, job.downloadName || path.basename(rows[0].output_path));
  } catch {
    res.status(404).json({ error: 'Output file not found on disk' });
  }
});

export default router;

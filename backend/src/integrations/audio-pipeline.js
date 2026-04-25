// integrations/audio-pipeline.js
// Unified audio processing: CamillaDSP first, falls back to ir-processor.
// Safe top-level import without dynamic await.

import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { irProcessor } from '../workers/audio/ir-processor.js';
import { query } from '../db/index.js';
import { generateIRDisplayName, generateIRFileName } from '../audio/irNaming.js';

// Lazy-load camilla to avoid crashing if binary not present
let _camillaLoaded = false;
let _processAudio  = null;
let _checkCamilla  = null;

async function loadCamilla() {
  if (_camillaLoaded) return;
  _camillaLoaded = true;
  try {
    const mod = await import('./camilla.js');
    _processAudio = mod.processAudio;
    _checkCamilla = mod.checkCamilla;
    logger.info('[AudioPipeline] CamillaDSP module loaded');
  } catch (err) {
    logger.warn(`[AudioPipeline] CamillaDSP not available: ${err.message}`);
  }
}

/**
 * Process an audio file through DSP pipeline.
 * Tries CamillaDSP first; falls back to ir-processor on failure.
 *
 * @param {object} opts
 * @param {string} opts.inputPath    - input file path
 * @param {string} opts.userId       - user id for DB tracking
 * @param {string} [opts.configName] - camilla config name
 * @param {object} [opts.irOpts]     - ir-processor options
 * @param {string} [opts.jobId]      - existing job id to update
 * @param {boolean} [opts.recordJob] - create/update an audio_jobs record
 * @param {object} [opts.namingConfig] - visible/export file naming metadata
 * @returns {Promise<{jobId, outputPath, method, info}>}
 */
export async function processAudioFile({
  inputPath,
  userId,
  configName = 'default',
  irOpts = {},
  jobId: existingJobId = null,
  recordJob = true,
  namingConfig = null,
} = {}) {
  await loadCamilla();

  const jobId     = existingJobId || uuidv4();
  const naming = namingConfig || {
    preset: configName,
    presetName: configName,
    sampleRate: irOpts.taxasSaida?.[0] || 48000,
  };
  const fileName = generateIRFileName(naming);
  const displayName = generateIRDisplayName(naming);
  const outputDir = path.join(config.storage.output, 'audio', 'ir', jobId);
  const outputPath = path.join(outputDir, fileName);
  await fs.mkdir(outputDir, { recursive: true }).catch(() => {});

  if (recordJob && !existingJobId) {
    await query(
      `INSERT INTO audio_jobs
         (id, user_id, status, input_path, config_name, display_name, file_name, download_name, output_file_name, config_json)
       VALUES ($1, $2, 'processing', $3, $4, $5, $6, $6, $6, $7)`,
      [jobId, userId, inputPath, configName, displayName, fileName, JSON.stringify(naming)],
    ).catch(() => {});
  }

  try {
    let method = 'ir-processor';
    let info   = {};
    let usedCamilla = false;

    // ── Try CamillaDSP ──────────────────────────────────────────────────
    if (_processAudio && _checkCamilla) {
      try {
        await _checkCamilla();
        await _processAudio({ inputPath, outputPath, configName });
        method      = 'camilladsp';
        info        = { config: configName };
        usedCamilla = true;
        logger.info(`[AudioPipeline] ${jobId}: CamillaDSP OK`);
      } catch (err) {
        logger.warn(`[AudioPipeline] CamillaDSP failed (${err.message}), using ir-processor`);
      }
    }

    // ── Fallback: ir-processor ──────────────────────────────────────────
    if (!usedCamilla) {
      const pedaleira = irOpts.pedaleira   || 'generic';
      const mic       = irOpts.mic         || null;
      const taxas     = irOpts.taxasSaida  || ['44k'];

      const result = await irProcessor.processar(inputPath, {
        exportarPath: outputPath.replace(/\.wav$/, ''),
        pedaleira,
        mic,
        taxasSaida: taxas,
        camillaDSP: false,
      });

      // ir-processor writes e.g. base_44kHz.wav — use first exported file
      const exported = result.arquivos?.[0];
      if (exported?.caminho) {
        await fs.copyFile(exported.caminho, outputPath).catch(() => {});
      }

      method = 'ir-processor';
      info   = result.info ?? {};
      logger.info(`[AudioPipeline] ${jobId}: ir-processor OK`);
    }

    if (recordJob) {
      await query(
        `UPDATE audio_jobs
         SET status='done', output_path=$1, file_name=$2, download_name=$2, output_file_name=$2, updated_at=NOW()
         WHERE id=$3`,
        [outputPath, fileName, jobId],
      ).catch(() => {});
    }

    return { jobId, outputPath, method, info };

  } catch (err) {
    logger.error(`[AudioPipeline] ${jobId} failed: ${err.message}`);
    if (recordJob) {
      await query(
        `UPDATE audio_jobs SET status='error', error=$1, updated_at=NOW() WHERE id=$2`,
        [err.message, jobId],
      ).catch(() => {});
    }
    throw err;
  }
}

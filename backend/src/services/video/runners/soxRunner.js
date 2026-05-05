// soxRunner.js — SoX v14.4.2 via 'sox' (DISPONÍVEL)
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { promises as fs } from 'fs';
import { ensureStorageDir } from './runnerBase.js';

const execFileP = promisify(execFile);

export async function runSoxProcess({ jobId, inputPath, outputPath, effects = [], options = [] }) {
  const start = Date.now();
  const warnings = [];
  const errors = [];

  try {
    await ensureStorageDir(jobId);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const args = [...options, inputPath, outputPath, ...effects];
    await execFileP('sox', args, { timeout: 60000 });

    return {
      ok: true,
      tool: 'sox',
      available: true,
      used: true,
      data: { outputPath, effects, options },
      warnings,
      errors,
      latencyMs: Date.now() - start,
      artifactPaths: { output: outputPath },
    };
  } catch (err) {
    errors.push(err.message || String(err));
    return {
      ok: false,
      tool: 'sox',
      available: true,
      used: false,
      data: {},
      warnings,
      errors,
      latencyMs: Date.now() - start,
      artifactPaths: {},
    };
  }
}

export async function checkSoxAvailability() {
  try {
    await execFileP('sox', ['--version'], { timeout: 5000 });
    return {
      available: true,
      version: 'SoX v14.4.2',
      path: '/usr/bin/sox',
    };
  } catch {
    return {
      available: false,
      version: null,
      path: null,
    };
  }
}

export async function normalizeAudioWithSox({ jobId, inputPath, outputPath }) {
  return runSoxProcess({
    jobId,
    inputPath,
    outputPath,
    effects: ['norm', '-3', 'compand', '0.3,1', '6:-70,-60,-20', '-5', '-90', '0.2'],
  });
}

export async function applyVoiceCleanWithSox({ jobId, inputPath, outputPath }) {
  return runSoxProcess({
    jobId,
    inputPath,
    outputPath,
    effects: ['highpass', '-f', '100', 'lowpass', '-f', '8000', 'norm', '-3'],
  });
}

export default { runSoxProcess, checkSoxAvailability, normalizeAudioWithSox, applyVoiceCleanWithSox };

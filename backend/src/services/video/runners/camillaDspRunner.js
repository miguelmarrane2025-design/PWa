// camillaDspRunner.js — CamillaDSP v4.1.3 via 'camilladsp' (DISPONÍVEL)
// CamillaDSP processa áudio via pipeline de filtros definido em YAML.
// Para uso como efeito de áudio no pipeline de vídeo, use soxRunner para efeitos simples
// e camilladsp apenas quando preset exigir DSP avançado.
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { promises as fs } from 'fs';
import { ensureStorageDir } from './runnerBase.js';

const execFileP = promisify(execFile);

export async function checkCamillaDspAvailability() {
  try {
    await execFileP('camilladsp', ['--version'], { timeout: 5000 });
    return {
      available: true,
      version: 'CamillaDSP 4.1.3',
      path: '/usr/local/bin/camilladsp',
    };
  } catch {
    return {
      available: false,
      version: null,
      path: null,
    };
  }
}

export async function runCamillaDsp({ jobId, configPath, inputPath, outputPath }) {
  const start = Date.now();
  const warnings = [];
  const errors = [];

  try {
    await ensureStorageDir(jobId);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Verify config file exists
    await fs.access(configPath);

    const args = [configPath, '-i', inputPath, '-o', outputPath];
    await execFileP('camilladsp', args, { timeout: 120000 });

    return {
      ok: true,
      tool: 'camilladsp',
      available: true,
      used: true,
      data: { outputPath, configPath },
      warnings,
      errors,
      latencyMs: Date.now() - start,
      artifactPaths: { output: outputPath },
    };
  } catch (err) {
    errors.push(err.message || String(err));
    return {
      ok: false,
      tool: 'camilladsp',
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

export default { checkCamillaDspAvailability, runCamillaDsp };

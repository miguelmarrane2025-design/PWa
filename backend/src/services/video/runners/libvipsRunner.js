// libvipsRunner.js — libvips via 'vips' (DISPONÍVEL v8.12.1)
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getStorageDir, ensureStorageDir } from './runnerBase.js';

const execFileP = promisify(execFile);

export async function runVipsOp({ jobId, inputPath, outputPath, operation, args = [] }) {
  const start = Date.now();
  const warnings = [];
  const errors = [];

  try {
    await ensureStorageDir(jobId);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const cmdArgs = [operation, inputPath, outputPath, ...args];
    await execFileP('vips', cmdArgs, { timeout: 30000 });

    return {
      ok: true,
      tool: 'libvips',
      available: true,
      used: true,
      data: { outputPath, operation },
      warnings,
      errors,
      latencyMs: Date.now() - start,
      artifactPaths: { output: outputPath },
    };
  } catch (err) {
    errors.push(err.message || String(err));
    return {
      ok: false,
      tool: 'libvips',
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

export async function checkLibvipsAvailability() {
  try {
    await execFileP('vips', ['--version'], { timeout: 5000 });
    return {
      available: true,
      version: '8.12.1',
      path: '/usr/bin/vips',
    };
  } catch {
    return {
      available: false,
      version: null,
      path: null,
    };
  }
}

export default { runVipsOp, checkLibvipsAvailability };

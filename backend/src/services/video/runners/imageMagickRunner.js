// imageMagickRunner.js — ImageMagick 6 via 'convert' (DISPONÍVEL)
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getStorageDir, ensureStorageDir } from './runnerBase.js';

const execFileP = promisify(execFile);

export async function runImageMagickOp({ jobId, inputPath, outputPath, operation, args = [] }) {
  const start = Date.now();
  const warnings = [];
  const errors = [];

  try {
    await ensureStorageDir(jobId);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const cmdArgs = [inputPath, ...args, outputPath];
    await execFileP('convert', cmdArgs, { timeout: 30000 });

    return {
      ok: true,
      tool: 'imagemagick',
      available: true,
      used: true,
      data: { outputPath },
      warnings,
      errors,
      latencyMs: Date.now() - start,
      artifactPaths: { output: outputPath },
    };
  } catch (err) {
    errors.push(err.message || String(err));
    return {
      ok: false,
      tool: 'imagemagick',
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

export async function checkImageMagickAvailability() {
  try {
    await execFileP('convert', ['--version'], { timeout: 5000 });
    return {
      available: true,
      version: 'ImageMagick 6.9.11',
      path: '/usr/bin/convert',
    };
  } catch {
    return {
      available: false,
      version: null,
      path: null,
    };
  }
}

export async function addTextOverlay({ jobId, inputPath, outputPath, text, x = 50, y = 50, fontSize = 32, color = 'white', font = 'DejaVu-Sans-Bold' }) {
  const start = Date.now();
  const errors = [];

  try {
    await ensureStorageDir(jobId);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const args = [
      inputPath,
      '-gravity', 'NorthWest',
      '-font', font,
      '-pointsize', String(fontSize),
      '-fill', color,
      '-annotate', `+${x}+${y}`, text,
      outputPath,
    ];

    await execFileP('convert', args, { timeout: 30000 });

    return {
      ok: true,
      tool: 'imagemagick',
      available: true,
      used: true,
      data: { outputPath, text, x, y, fontSize, color },
      warnings: [],
      errors: [],
      latencyMs: Date.now() - start,
      artifactPaths: { output: outputPath },
    };
  } catch (err) {
    errors.push(err.message || String(err));
    return {
      ok: false,
      tool: 'imagemagick',
      available: true,
      used: false,
      data: {},
      warnings: [],
      errors,
      latencyMs: Date.now() - start,
      artifactPaths: {},
    };
  }
}

export default { runImageMagickOp, checkImageMagickAvailability, addTextOverlay };

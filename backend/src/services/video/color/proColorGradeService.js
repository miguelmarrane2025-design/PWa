// proColorGradeService.js — Color grading tipo DaVinci Resolve
// Aplica LUT, color presets e ajustes via FFmpeg + ImageMagick
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../../lib/logger.js';

const execFileP = promisify(execFile);

const COLOR_PROFILES = {
  cinematic_high_contrast: {
    ffmpegEq: 'eq=contrast=1.25:saturation=0.85:brightness=-0.02:gamma=0.95',
    vignette: 'vignette=PI/4',
    unsharp: 'unsharp=5:5:0.6',
    lut: null,
  },
  sports_hype_contrast: {
    ffmpegEq: 'eq=contrast=1.2:saturation=1.3:brightness=0.02:gamma=1.0',
    vignette: null,
    unsharp: 'unsharp=3:3:0.4',
    lut: null,
  },
  worship_soft_film: {
    ffmpegEq: 'eq=contrast=1.05:saturation=1.1:brightness=0.015:gamma=1.05',
    vignette: 'vignette=PI/5',
    unsharp: null,
    lut: null,
  },
  documentary_neutral: {
    ffmpegEq: 'eq=contrast=1.03:saturation=1.0:brightness=0.0:gamma=1.0',
    vignette: null,
    unsharp: null,
    lut: null,
  },
  product_premium: {
    ffmpegEq: 'eq=contrast=1.08:saturation=1.05:brightness=0.01:gamma=1.02',
    vignette: 'vignette=PI/6',
    unsharp: 'unsharp=3:3:0.3',
    lut: null,
  },
  viral_punchy_mobile: {
    ffmpegEq: 'eq=contrast=1.12:saturation=1.15:brightness=0.02:gamma=1.0',
    vignette: null,
    unsharp: 'unsharp=3:3:0.35',
    lut: null,
  },
  podcast_clean_color: {
    ffmpegEq: 'eq=contrast=1.04:saturation=1.02:brightness=0.005:gamma=1.01',
    vignette: null,
    unsharp: null,
    lut: null,
  },
  warm_church_stage: {
    ffmpegEq: 'eq=contrast=1.06:saturation=1.08:brightness=0.02:gamma=1.03',
    vignette: 'vignette=PI/5',
    unsharp: null,
    lut: null,
  },
  neon_tech_red: {
    ffmpegEq: 'eq=contrast=1.2:saturation=1.4:brightness=-0.01:gamma=0.97',
    vignette: 'vignette=PI/3.5',
    unsharp: 'unsharp=5:5:0.5',
    lut: null,
  },
  before_after_dramatic: {
    ffmpegEq: 'eq=contrast=1.3:saturation=0.8:brightness=-0.03:gamma=0.92',
    vignette: 'vignette=PI/4',
    unsharp: 'unsharp=5:5:0.7',
    lut: null,
  },
};

function buildColorFilter(profile) {
  const parts = [profile.ffmpegEq];
  if (profile.vignette) parts.push(profile.vignette);
  if (profile.unsharp) parts.push(profile.unsharp);
  return parts.filter(Boolean).join(',');
}

export async function applyColorGrade({ inputPath, outputPath, colorPresetId = 'viral_punchy_mobile', lutPath = null, engineProfile = 'pro' }) {
  const start = Date.now();
  const profile = COLOR_PROFILES[colorPresetId] || COLOR_PROFILES.viral_punchy_mobile;
  const effectiveLut = lutPath || profile.lut;
  const usedTools = ['ffmpeg'];
  const warnings = [];
  const filtersUsed = [];

  if (effectiveLut) {
    // Check if LUT file exists
    const lutExists = await fs.access(effectiveLut).then(() => true).catch(() => false);
    if (lutExists) {
      usedTools.push('lut');
      filtersUsed.push(`lut3d=${effectiveLut}`);
    } else {
      if (engineProfile === 'full_studio') {
        return { ok: false, error: `LUT file not found: ${effectiveLut}`, blocked: true, colorGradeApplied: false, usedTools, filtersUsed, latencyMs: Date.now() - start };
      }
      warnings.push(`LUT não encontrado: ${effectiveLut} — usando filtros FFmpeg`);
    }
  }

  const colorFilter = buildColorFilter(profile);
  if (colorFilter) filtersUsed.push(colorFilter);

  const vfFilter = filtersUsed.join(',');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const args = ['-y', '-i', inputPath];
  if (vfFilter) args.push('-vf', vfFilter);
  args.push('-c:a', 'copy', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', outputPath);

  try {
    await execFileP('ffmpeg', args, { timeout: 120000 });
    return {
      ok: true,
      colorGradeApplied: true,
      colorPresetId,
      filtersUsed,
      lutUsed: effectiveLut || null,
      usedTools,
      fallbackUsed: !effectiveLut && Boolean(profile.lut),
      outputPath,
      latencyMs: Date.now() - start,
      warnings,
    };
  } catch (err) {
    logger.error('[ProColorGrade] ' + err.message);
    return { ok: false, colorGradeApplied: false, error: err.message, usedTools, filtersUsed, latencyMs: Date.now() - start };
  }
}

export function listColorProfiles() {
  return Object.entries(COLOR_PROFILES).map(([id, p]) => ({
    id,
    ffmpegEq: p.ffmpegEq,
    hasLut: Boolean(p.lut),
    hasVignette: Boolean(p.vignette),
    hasUnsharp: Boolean(p.unsharp),
  }));
}

export function getColorProfile(id) {
  return COLOR_PROFILES[id] || COLOR_PROFILES.viral_punchy_mobile;
}

export default { applyColorGrade, listColorProfiles, getColorProfile };

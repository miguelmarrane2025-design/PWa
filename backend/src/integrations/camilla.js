import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";

/**
 * Validate a CamillaDSP config file by doing a dry-run.
 * @param {string} configPath
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateConfig(configPath) {
  return new Promise((resolve) => {
    const proc = spawn(config.camilla.bin, ["-c", configPath, "--wait"], {
      timeout: 5000,
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => resolve({ valid: false, error: err.message }));
    proc.on("close", (code) => {
      if (code === 0) resolve({ valid: true });
      else resolve({ valid: false, error: stderr.trim() });
    });
    // Camilla with --wait needs a SIGINT to exit cleanly after validation
    setTimeout(() => proc.kill("SIGINT"), 2000);
  });
}

/**
 * Run CamillaDSP on a raw PCM file.
 * Converts input WAV → raw PCM → process → raw PCM → output WAV.
 *
 * @param {object} opts
 * @param {string} opts.inputPath    - Path to input WAV
 * @param {string} opts.outputPath   - Path for output WAV
 * @param {string} [opts.configName] - Config name in camilla-configs/ (without .yml)
 * @param {number} [opts.samplerate] - Override samplerate
 * @param {number} [opts.channels]   - Override channels
 * @returns {Promise<void>}
 */
export async function processAudio({
  inputPath,
  outputPath,
  configName = "default",
  samplerate = 44100,
  channels = 2,
}) {
  const jobId = uuidv4();
  const tempIn = path.join(config.storage.temp, `${jobId}_in.raw`);
  const tempOut = path.join(config.storage.temp, `${jobId}_out.raw`);
  const camillaConfig = path.join(config.camilla.configDir, `${configName}.yml`);

  // Verify config exists
  await fs.access(camillaConfig).catch(() => {
    throw new Error(`CamillaDSP config not found: ${camillaConfig}`);
  });

  try {
    // Step 1: WAV → raw PCM
    await ffmpegConvert(inputPath, tempIn, { toRaw: true, samplerate, channels });

    // Step 2: Run CamillaDSP
    await runCamilla(camillaConfig, tempIn, tempOut);

    // Step 3: raw PCM → WAV
    await ffmpegConvert(tempOut, outputPath, { toRaw: false, samplerate, channels });

    logger.info(`Audio job ${jobId} complete: ${outputPath}`);
  } finally {
    // Clean up temp files
    for (const f of [tempIn, tempOut]) {
      await fs.unlink(f).catch(() => {});
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ffmpegConvert(input, output, { toRaw, samplerate, channels }) {
  return new Promise((resolve, reject) => {
    const args = toRaw
      ? ["-y", "-i", input, "-f", "s16le", "-ar", String(samplerate), "-ac", String(channels), output]
      : ["-y", "-f", "s16le", "-ar", String(samplerate), "-ac", String(channels), "-i", input, output];

    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

function runCamilla(configPath, inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    // Patch the config's capture/playback filenames at runtime via env override
    const env = {
      ...process.env,
      CAMILLA_INPUT: inputFile,
      CAMILLA_OUTPUT: outputFile,
    };

    const proc = spawn(config.camilla.bin, ["-c", configPath], { env });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`camilladsp exited ${code}: ${stderr.slice(-500)}`));
    });

    // Camilla runs until input EOF or SIGTERM
    // For file mode it will exit naturally when input is consumed
    setTimeout(() => proc.kill("SIGTERM"), 60_000); // safety timeout 60s
  });
}

/**
 * Check that camilladsp binary is available and working.
 * @returns {Promise<string>} version string
 */
export async function checkCamilla() {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.camilla.bin, ["--version"]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`camilladsp --version exited ${code}`));
    });
  });
}

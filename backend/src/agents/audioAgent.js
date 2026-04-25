import path               from 'path';
import { promises as fs } from 'fs';
import { chat }           from '../lib/llm.js';
import { processAudioFile } from '../integrations/audio-pipeline.js';
import { config }         from '../config/index.js';
import { logger }         from '../lib/logger.js';

const SYSTEM = `You are BotSquad's audio specialist and guitar tone expert. Help with:
- IR (Impulse Response) analysis and recommendations
- Worship/Gospel guitar tone (Hillsong, Bethel, Jesus Culture)
- CamillaDSP and pedalboard configuration
- Preset creation (HX Stomp, Helix, Quad Cortex, Kemper)
- EQ, compression, reverb, delay settings
Respond in the user's language. Be technical and practical.`;

function detectPreset(message) {
  const l = message.toLowerCase();
  if (/hillsong/.test(l))                               return 'hillsong';
  if (/bethel|ambient|cinematic/.test(l))               return 'bethel-ambient';
  if (/worship.*clean|clean.*worship/.test(l))          return 'worship-clean';
  if (/lead|solo|overdrive/.test(l))                    return 'lead';
  return 'default';
}

export async function audioAgent({ userId, message, context = [], files = [] }) {
  const audioFiles = files.filter(f => /\.(wav|mp3|flac|ogg|aac|m4a)$/i.test(f.originalname ?? ''));
  if (audioFiles.length > 0) return processAudioFiles({ userId, message, audioFiles, context });
  const content = await chat(
    [{ role: 'system', content: SYSTEM }, ...context, { role: 'user', content: message }],
    { userId, max_tokens: 2000 },
  );
  return { type: 'text', content };
}

async function processAudioFiles({ userId, message, audioFiles, context }) {
  const configName = detectPreset(message);
  await fs.mkdir(config.storage.output, { recursive: true }).catch(() => {});
  const results = [];

  for (const file of audioFiles) {
    try {
      const { jobId, method } = await processAudioFile({ inputPath: file.path, userId, configName });
      results.push({ jobId, filename: file.originalname, status: 'done', method, configUsed: configName });
      logger.info(`[AudioAgent] Job ${jobId} done user=${userId}`);
    } catch (err) {
      results.push({ filename: file.originalname, status: 'error', error: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'done');
  const summary = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Processed ${ok.length}/${audioFiles.length} files. Preset: ${configName}. Results: ${JSON.stringify(results)}. Request: "${message}". Summarize briefly.` },
  ], { userId });

  return { type: 'audio_result', content: summary, jobs: ok };
}

// memory/agentMemoryService.js
// Serviço de memória centralizado para todos os agentes.
// Local-first. Drive como camada opcional (via driveMemoryProvider).

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';

const MEM_BASE = process.env.AGENT_MEMORY_BASE || 'storage/memory/agents';

// ── helpers ──────────────────────────────────────────────────────────────────
function agentDir(agentId) { return path.join(MEM_BASE, agentId); }
function agentFile(agentId, type) { return path.join(agentDir(agentId), `${type}.json`); }

async function readArray(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); } catch { return []; }
}
async function writeArray(filePath, arr) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(arr, null, 2));
}
function newEntry(data) {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`, ts: new Date().toISOString(), ...data };
}

// ── API pública ───────────────────────────────────────────────────────────────
export const agentMemoryService = {
  async saveGoodExample(agentId, data) {
    const f = agentFile(agentId, 'good_examples');
    const arr = await readArray(f);
    const entry = newEntry({ type: 'good_example', ...data });
    arr.push(entry);
    await writeArray(f, arr);
    logger.info(`[AgentMemory] good_example saved agent=${agentId}`);
    return entry;
  },

  async saveBadExample(agentId, data) {
    const f = agentFile(agentId, 'bad_examples');
    const arr = await readArray(f);
    const entry = newEntry({ type: 'bad_example', ...data });
    arr.push(entry);
    await writeArray(f, arr);
    return entry;
  },

  async saveFeedback(agentId, data) {
    const f = agentFile(agentId, 'feedback');
    const arr = await readArray(f);
    const entry = newEntry({ type: 'feedback', ...data });
    arr.push(entry);
    await writeArray(f, arr);
    return entry;
  },

  async saveApprovedOutput(agentId, data) {
    const f = agentFile(agentId, 'approved_outputs');
    const arr = await readArray(f);
    const entry = newEntry({ type: 'approved', ...data });
    arr.push(entry); if (arr.length > 200) arr.shift();
    await writeArray(f, arr);
    return entry;
  },

  async saveRejectedOutput(agentId, data) {
    const f = agentFile(agentId, 'rejected_outputs');
    const arr = await readArray(f);
    const entry = newEntry({ type: 'rejected', ...data });
    arr.push(entry); if (arr.length > 100) arr.shift();
    await writeArray(f, arr);
    return entry;
  },

  /** Carrega contexto de aprendizado: últimos 5 bons + últimas notas ruins */
  async loadAgentContext(agentId, limit = 5) {
    const [good, bad, feedback] = await Promise.all([
      readArray(agentFile(agentId, 'good_examples')),
      readArray(agentFile(agentId, 'bad_examples')),
      readArray(agentFile(agentId, 'feedback')),
    ]);
    return {
      goodExamples: good.slice(-limit),
      badExamples:  bad.slice(-limit),
      recentFeedback: feedback.slice(-limit),
      hasContext: good.length + bad.length + feedback.length > 0,
    };
  },

  /** Sumário do agente para o painel Training */
  async getSummary(agentId) {
    const files = ['good_examples','bad_examples','feedback','approved_outputs','rejected_outputs'];
    const result = {};
    for (const f of files) {
      const arr = await readArray(agentFile(agentId, f));
      result[f] = arr.length;
    }
    return result;
  },
};

export default agentMemoryService;

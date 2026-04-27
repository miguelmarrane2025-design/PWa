// src/memory/driveMemoryProvider.js
// Camada de memória híbrida: local-first + Google Drive opcional.
// O Drive é SEMPRE opcional — o sistema funciona 100% sem ele.
//
// Variáveis de ambiente:
//   DRIVE_MEMORY_ENABLED=true        habilita sync com Drive
//   DRIVE_MEMORY_ROOT_FOLDER_ID=...  ID da pasta raiz no Drive
//   DRIVE_MEMORY_LOCAL_MIRROR=storage/drive-memory

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';

const LOCAL_BASE    = process.env.DRIVE_MEMORY_LOCAL_MIRROR || path.join(process.cwd(), 'storage', 'memory');
const DRIVE_ENABLED = process.env.DRIVE_MEMORY_ENABLED === 'true';

// ── Tipos de memória suportados ───────────────────────────────────────────────
const VALID_TYPES = [
  'good_example', 'bad_example', 'feedback',
  'reference', 'style_reference', 'prompt_pack', 'evaluation',
];

// ── Helpers de arquivo local ──────────────────────────────────────────────────
function localPath(agentId, type) {
  return path.join(LOCAL_BASE, 'agents', agentId, `${type}s.json`);
}

async function readLocalArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalArray(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Salva um item na memória do agente (local + Drive se habilitado).
 * @param {string} agentId   ex: 'carousel-image-prompt-director'
 * @param {string} type      ex: 'good_example'
 * @param {Object} data      qualquer objeto serializável
 */
async function saveAgentMemory(agentId, type, data) {
  if (!VALID_TYPES.includes(type)) {
    logger.warn(`[DriveMemory] Unknown type: ${type}`);
    return { ok: false, error: 'invalid_type' };
  }

  const fPath = localPath(agentId, type);
  const arr   = await readLocalArray(fPath);
  const entry = { id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`, ts: new Date().toISOString(), ...data };
  arr.push(entry);
  await writeLocalArray(fPath, arr);
  logger.info(`[DriveMemory] saved agent=${agentId} type=${type} id=${entry.id}`);

  // Drive sync (fase futura — placeholder)
  if (DRIVE_ENABLED) {
    await _syncEntryToDrive(agentId, type, entry).catch(e =>
      logger.warn(`[DriveMemory] drive sync failed: ${e.message}`)
    );
  }

  return { ok: true, entry };
}

/**
 * Carrega todos os itens de um tipo para um agente.
 */
async function loadAgentMemory(agentId, type) {
  const fPath = localPath(agentId, type);
  return readLocalArray(fPath);
}

/**
 * Lista todos os tipos disponíveis para um agente.
 */
async function listAgentMemory(agentId) {
  const agentDir = path.join(LOCAL_BASE, 'agents', agentId);
  try {
    const files = await fs.readdir(agentDir);
    const result = {};
    for (const f of files.filter(f => f.endsWith('.json'))) {
      const type = f.replace('s.json', '');
      const arr  = await readLocalArray(path.join(agentDir, f));
      result[type] = arr.length;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Sincroniza local → Drive (placeholder — implementar com Google Drive API).
 */
async function syncLocalToDrive() {
  if (!DRIVE_ENABLED) return { ok: false, reason: 'drive_disabled' };
  logger.info('[DriveMemory] syncLocalToDrive — not yet implemented (Drive API pending)');
  return { ok: false, reason: 'not_implemented' };
}

/**
 * Sincroniza Drive → local (placeholder).
 */
async function syncDriveToLocal() {
  if (!DRIVE_ENABLED) return { ok: false, reason: 'drive_disabled' };
  logger.info('[DriveMemory] syncDriveToLocal — not yet implemented (Drive API pending)');
  return { ok: false, reason: 'not_implemented' };
}

// ── Placeholder Drive sync ────────────────────────────────────────────────────
async function _syncEntryToDrive(_agentId, _type, _entry) {
  // TODO: implementar com googleapis quando DRIVE_MEMORY_ROOT_FOLDER_ID estiver configurado.
  // Por agora, apenas espelha no diretório local drive-memory.
  const mirrorPath = path.join(
    process.cwd(), 'storage', 'drive-memory',
    'agents', _agentId, `${_type}s.json`
  );
  const arr = await readLocalArray(mirrorPath);
  arr.push(_entry);
  await writeLocalArray(mirrorPath, arr);
}

export const driveMemoryProvider = {
  saveAgentMemory,
  loadAgentMemory,
  listAgentMemory,
  syncLocalToDrive,
  syncDriveToLocal,
};

// agents/agency/workOrderManager.js
// Gerencia Work Orders — criação, leitura, atualização de status.
// Provider: OpenAI via llm.js. Nunca chama provider direto.

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync }                 from 'fs';
import { join }                       from 'path';
import { randomUUID }                 from 'crypto';
import { logger }                     from '../../lib/logger.js';

// Path seguro via config central — fallback relativo à raiz do projeto
let JOBS_DIR;
try {
  const { default: config } = await import('../../config/index.js').catch(() => ({ default: null }));
  JOBS_DIR = config?.storage?.workOrders || join(process.cwd(), 'storage', 'jobs', 'work-orders');
} catch {
  JOBS_DIR = join(process.cwd(), 'storage', 'jobs', 'work-orders');
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

export async function createWorkOrder({
  userRequest,
  objective,
  niche,
  targetAudience,
  platforms = [],
  desiredOutput,
  primarySquad,
  supportSquads = [],
  approvalRequired = true,
}) {
  const workOrderId = randomUUID();
  const wo = {
    workOrderId,
    userRequest,
    objective:       objective  || 'general',
    niche:           niche      || null,
    targetAudience:  targetAudience || null,
    platforms,
    desiredOutput:   desiredOutput  || null,
    primarySquad:    primarySquad   || null,
    supportSquads,
    status:          'briefing',
    qualityScore:    0,
    reviewRequired:  true,
    approvalRequired,
    outputs:         [],
    memoryTags:      [],
    metricsToTrack:  [],
    createdAt:       new Date().toISOString(),
    updatedAt:       new Date().toISOString(),
  };

  const dir = join(JOBS_DIR, workOrderId);
  await ensureDir(dir);
  await writeFile(join(dir, 'work-order.json'), JSON.stringify(wo, null, 2));
  logger.info(`[WorkOrderManager] created workOrderId=${workOrderId} squad=${primarySquad}`);
  return wo;
}

export async function updateWorkOrder(workOrderId, updates) {
  const filePath = join(JOBS_DIR, workOrderId, 'work-order.json');
  try {
    const raw = await readFile(filePath, 'utf-8');
    const wo  = JSON.parse(raw);
    const updated = { ...wo, ...updates, updatedAt: new Date().toISOString() };
    await writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  } catch (err) {
    logger.warn(`[WorkOrderManager] updateWorkOrder failed: ${err.message}`);
    return null;
  }
}

export async function getWorkOrder(workOrderId) {
  try {
    const raw = await readFile(join(JOBS_DIR, workOrderId, 'work-order.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listWorkOrders() {
  try {
    await ensureDir(JOBS_DIR);
    const { readdir } = await import('fs/promises');
    const dirs = await readdir(JOBS_DIR);
    const results = await Promise.all(
      dirs.map(id => getWorkOrder(id).catch(() => null))
    );
    return results.filter(Boolean);
  } catch {
    return [];
  }
}

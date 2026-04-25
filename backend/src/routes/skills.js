// routes/skills.js
// REST API exposing the 37-skill system to the frontend.

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { skillManager } from '../skills/skill-manager.js';
import { workflowOrchestrator } from '../modules/workflow-orchestrator.js';
import { contextManager } from '../modules/context-manager.js';
import { config } from '../config/index.js';

const router = Router();
const upload = multer({ dest: config.storage.temp, limits: { fileSize: 100 * 1024 * 1024 } });

// ── GET /skills ──────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { domain } = req.query;
  res.json(skillManager.listarSkills(domain ? { dominio: domain } : {}));
});

// ── GET /skills/stats ────────────────────────────────────────────────────
router.get('/stats', requireAuth, (req, res) => {
  res.json(skillManager.stats());
});

// ── GET /skills/workflows ────────────────────────────────────────────────
router.get('/workflows', requireAuth, (req, res) => {
  res.json(workflowOrchestrator.listarWorkflows());
});

// ── POST /skills/:id/run ─────────────────────────────────────────────────
router.post('/:id/run', requireAuth, upload.array('files', 10), async (req, res) => {
  // Merge body (works for both JSON and multipart)
  const { id } = req.params;
  const params = { ...req.body };

  const sessao = {
    ultimoTexto: params.texto || params.message || '',
    nicho: params.nicho || null,
    estilo: params.estilo || null,
    ajustesTonais: params.ajustes ? JSON.parse(params.ajustes) : [],
    pedaleira: params.pedaleira || null,
    guitarra: params.guitarra || null,
    contexto: params.contexto || null,
    ultimoIR: req.files?.find(f => /\.(wav|mp3|flac)$/i.test(f.originalname))?.path ?? null,
    ultimaFoto: req.files?.find(f => /\.(jpg|png|webp)$/i.test(f.originalname))?.path ?? null,
    ultimoAudio: null,
    produto: null,
    amp: null,
  };

  const ctx = await contextManager.enriquecer(req.user.id, sessao);
  const resultado = await skillManager.executar(id, ctx, params);

  if (!resultado) return res.status(404).json({ error: `Skill '${id}' not found or failed` });

  const outputs = resultado.outputs ?? [];
  const text = outputs.filter(o => o.tipo === 'texto').map(o => o.conteudo).join('\n\n');

  res.json({ skill: id, text, data: resultado });
});

// ── POST /skills/workflows/:id/run ────────────────────────────────────────
router.post('/workflows/:id/run', requireAuth, async (req, res) => {
  const { id } = req.params;
  const params = req.body;

  const sessao = {
    ultimoTexto: params.texto || '',
    nicho: params.nicho || null,
    estilo: null, ajustesTonais: [], pedaleira: null, guitarra: null,
    contexto: null, produto: null, amp: null, ultimoIR: null, ultimaFoto: null, ultimoAudio: null,
  };

  const ctx = await contextManager.enriquecer(req.user.id, sessao);
  ctx.intencao = { domain: params.domain || 'content', task: params.task || 'create_product' };

  const resultado = await workflowOrchestrator.executarWorkflow(id, ctx);
  if (!resultado) return res.status(404).json({ error: `Workflow '${id}' not found` });

  const outputs = resultado.ctx?.outputs ?? [];
  const text = outputs.filter(o => o.tipo === 'texto').map(o => o.conteudo).join('\n\n');

  res.json({ workflow: id, text, sucesso: resultado.sucesso, steps: resultado.resultados });
});

export default router;

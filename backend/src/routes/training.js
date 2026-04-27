// routes/training.js
// API de treinamento dos agentes: feedback, exemplos bons/ruins, memória.

import { Router }    from 'express';
import { requireAuth } from '../middleware/auth.js';
import { driveMemoryProvider } from '../memory/driveMemoryProvider.js';
import { logger }    from '../lib/logger.js';

const router = Router();

// ── POST /training/feedback ───────────────────────────────────────────────────
// Salva feedback do usuário sobre um prompt ou saída gerada
router.post('/feedback', requireAuth, async (req, res) => {
  const { agentId, planId, slideIndex, type, reason, content } = req.body;

  if (!agentId || !type) {
    return res.status(400).json({ error: 'agentId e type são obrigatórios' });
  }

  const validTypes = ['good_example', 'bad_example', 'feedback'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type inválido. Use: ${validTypes.join(', ')}` });
  }

  const VALID_REASONS = [
    'genérico', 'pouco relacionado ao tema', 'imagem abstrata demais',
    'não parece real', 'faltou composição', 'título ruim', 'prompt fraco', 'outro',
  ];

  const entry = {
    userId:     req.user.id,
    agentId,
    planId:     planId || null,
    slideIndex: slideIndex ?? null,
    reason:     reason || null,
    content:    content || null,
    reasonValid: reason ? VALID_REASONS.includes(reason) : true,
  };

  const result = await driveMemoryProvider.saveAgentMemory(agentId, type, entry);
  logger.info(`[Training] feedback saved agent=${agentId} type=${type} user=${req.user.id}`);

  res.json({ ok: true, id: result.entry?.id });
});

// ── GET /training/memory/:agentId ─────────────────────────────────────────────
router.get('/memory/:agentId', requireAuth, async (req, res) => {
  const summary = await driveMemoryProvider.listAgentMemory(req.params.agentId);
  res.json(summary);
});

// ── GET /training/memory/:agentId/:type ──────────────────────────────────────
router.get('/memory/:agentId/:type', requireAuth, async (req, res) => {
  const items = await driveMemoryProvider.loadAgentMemory(req.params.agentId, req.params.type);
  res.json(items);
});

// ── POST /training/approve-prompt ────────────────────────────────────────────
// Atalho: aprovação de prompt salva como good_example automaticamente
router.post('/approve-prompt', requireAuth, async (req, res) => {
  const { agentId = 'carousel-image-prompt-director', promptPack, planId } = req.body;
  if (!promptPack) return res.status(400).json({ error: 'promptPack obrigatório' });

  const result = await driveMemoryProvider.saveAgentMemory(agentId, 'good_example', {
    userId: req.user.id,
    planId,
    promptPack,
    approvedAt: new Date().toISOString(),
  });

  res.json({ ok: true, id: result.entry?.id });
});

// ── POST /training/reject-prompt ─────────────────────────────────────────────
router.post('/reject-prompt', requireAuth, async (req, res) => {
  const { agentId = 'carousel-image-prompt-director', promptPack, planId, reasons = [] } = req.body;
  if (!promptPack) return res.status(400).json({ error: 'promptPack obrigatório' });

  const result = await driveMemoryProvider.saveAgentMemory(agentId, 'bad_example', {
    userId: req.user.id,
    planId,
    promptPack,
    reasons,
    rejectedAt: new Date().toISOString(),
  });

  res.json({ ok: true, id: result.entry?.id });
});

// ── GET /training/token-budget ────────────────────────────────────────────────
router.get('/token-budget', requireAuth, async (req, res) => {
  try {
    const { tokenBudgetManager } = await import('../ai/tokenBudgetManager.js');
    const summary = tokenBudgetManager.getSummary(req.user.id);
    res.json(summary);
  } catch (e) {
    res.json({ error: e.message });
  }
});

export default router;

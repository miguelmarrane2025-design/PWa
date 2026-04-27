import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listSystemAgents } from '../system/catalog.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const agents = await listSystemAgents();
  res.json({ agents, total: agents.length });
});

router.get('/:id', requireAuth, async (req, res) => {
  const agents = await listSystemAgents();
  const agent = agents.find(item => item.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

export default router;

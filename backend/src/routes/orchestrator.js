// routes/orchestrator.js
// Endpoint unificado para execução de agentes pelo frontend.
// POST /orchestrator/run → sempre retorna { output, meta }

import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { orchestrate } from '../agents/orchestrator.js';
import { logger }      from '../lib/logger.js';

const router = Router();

/**
 * POST /orchestrator/run
 * Body: { agent?, input, context? }
 * Returns: { output, meta: { agent, ms, provider? } }
 */
router.post('/run', requireAuth, async (req, res) => {
  const { agent, input, context = [] } = req.body;
  const userId = req.user?.id;

  if (!input?.trim?.()) {
    return res.status(400).json({ error: 'Campo "input" é obrigatório' });
  }

  const start = Date.now();
  logger.info(`[AGENT RUN] agent=${agent || 'auto'} user=${userId}`);

  try {
    // Montar mensagem — inclui agente solicitado no contexto se fornecido
    const message = agent
      ? `[agent:${agent}] ${input}`
      : input;

    const result = await orchestrate({
      userId,
      message,
      context: Array.isArray(context) ? context : [],
    });

    const ms = Date.now() - start;
    logger.info(`[AGENT RUN] ok agent=${agent || 'auto'} ms=${ms} user=${userId}`);

    // orchestrate pode retornar string ou objeto
    const output = typeof result === 'string'
      ? result
      : result?.content ?? result?.output ?? result?.result ?? JSON.stringify(result);

    return res.json({
      output,
      meta: {
        agent:    agent || 'auto',
        ms,
        provider: result?.provider ?? undefined,
        routedAgent: result?.agent ?? undefined,
      },
    });

  } catch (err) {
    const ms = Date.now() - start;
    logger.error(`[AGENT RUN] erro agent=${agent || 'auto'} user=${userId}: ${err.message}`);
    return res.status(500).json({
      error:  err.message || 'Erro ao executar agente',
      output: null,
      meta:   { agent: agent || 'auto', ms },
    });
  }
});

export default router;

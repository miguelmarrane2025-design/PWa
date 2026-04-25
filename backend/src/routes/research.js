// routes/research.js — Profile Investigator, Compare & Trend Radar
// ALL imports MUST be at the top in ESM — never inside or after route handlers

import { Router }   from 'express';
import { requireAuth } from '../middleware/auth.js';
import { chat }     from '../lib/provider-manager.js';
import { logger }   from '../lib/logger.js';
import { analyzeProfile } from '../integrations/social-apis.js';
import { analyseProfileIntelligent, detectTrends, getIntegrationStatus } from '../integrations/integrations-engine.js';

const router = Router();

// ── POST /research/analyze — LLM strategic analysis (always works) ─────────
router.post('/analyze', requireAuth, async (req, res) => {
  const { url, platform = 'youtube', period = '30d', notes = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'url é obrigatório' });

  // Try real social API first — enriches the LLM prompt with real data
  let realDataBlock = '';
  try {
    const identifier = url.replace(/.*\/([@]?[^/?#]+)\/?$/, '$1') || url;
    const realData   = await analyzeProfile({ platform, identifier, userId: req.user.id });
    if (realData && !realData.error) {
      const ch   = realData.channel || realData.profile || {};
      const vids = realData.recentVideos || [];
      realDataBlock = `\n\n## DADOS REAIS DA API:\n${JSON.stringify({ perfil: ch, videos_recentes: vids.slice(0, 3) }, null, 2)}\n`;
    }
  } catch (_) { /* sem dados reais — LLM faz análise estratégica */ }

  const prompt = `Você é um especialista em análise de perfis de redes sociais.

Analise o seguinte perfil de ${platform.toUpperCase()}:
URL: ${url}
Período: ${period}
${notes ? `Notas adicionais: ${notes}` : ''}${realDataBlock}

Produza:
1. Visão geral do perfil (nicho, posicionamento, tamanho)
2. Quais métricas rastrear: views, likes, comentários, shares, taxa de engajamento
3. Como identificar os melhores e piores conteúdos
4. Padrões de hooks, CTAs e formatos de sucesso
5. Oportunidades estratégicas baseadas no nicho/plataforma
6. 5 recomendações acionáveis

Retorne como JSON:
{
  "profile": { "platform": "", "estimated_niche": "", "url": "" },
  "analysis": {
    "posting_frequency": "",
    "dominant_formats": [],
    "common_hooks": [],
    "common_ctas": [],
    "best_content_type": "",
    "engagement_benchmark": ""
  },
  "opportunities": [],
  "recommendations": [],
  "action_plan": ""
}`;

  try {
    const result = await chat(
      [{ role: 'system', content: 'Você é um analista estratégico de redes sociais. Responda sempre em JSON válido.' },
       { role: 'user',   content: prompt }],
      { userId: req.user.id, max_tokens: 1500 },
    );

    let parsed;
    try {
      const m = result.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { raw: result };
    } catch { parsed = { raw: result }; }

    res.json({ success: true, data: parsed, platform, url });
  } catch (err) {
    logger.error('Research analyze error:', err);
    res.status(500).json({ error: err.message || 'Erro na análise' });
  }
});

// ── POST /research/profile — real social API with fallback chain ───────────
router.post('/profile', requireAuth, async (req, res) => {
  const { url, platform = 'youtube' } = req.body;
  if (!url) return res.status(400).json({ error: 'url é obrigatório' });

  const identifier = url.match(/[@]?([a-zA-Z0-9_.%-]+)\/?$/)?.[1] || url;

  try {
    const result = await analyseProfileIntelligent({ platform, identifier, userId: req.user.id });
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Research profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /research/compare — compare 2+ profiles ─────────────────────────
router.post('/compare', requireAuth, async (req, res) => {
  const { urls = [], platform = 'youtube' } = req.body;
  if (!urls.length || urls.length < 2)
    return res.status(400).json({ error: 'Envie pelo menos 2 URLs para comparar' });

  const prompt = `Compare os seguintes perfis de ${platform.toUpperCase()}:
${urls.map((u, i) => `Perfil ${i + 1}: ${u}`).join('\n')}

Faça uma comparação estratégica:
1. Frequência e consistência de postagem
2. Formatos dominantes
3. Estratégias de engajamento
4. Pontos fortes de cada um
5. O que adaptar para o usuário
6. Ranking de estratégias mais eficazes

Retorne JSON:
{ "profiles": [{ "url": "", "estimated_niche": "", "strength": "" }],
  "comparison": { "frequency": {}, "formats": {}, "engagement": {}, "hooks": {}, "ctas": {} },
  "winner_by_category": {},
  "action_items": [] }`;

  try {
    const result = await chat(
      [{ role: 'system', content: 'Analista de redes sociais. Responda em JSON válido.' },
       { role: 'user',   content: prompt }],
      { userId: req.user.id, max_tokens: 2000 },
    );
    let parsed;
    try { const m = result.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { raw: result }; }
    catch { parsed = { raw: result }; }
    res.json({ success: true, data: parsed, urls });
  } catch (err) {
    logger.error('Research compare error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /research/trends — trend detection via LLM ───────────────────────
router.post('/trends', requireAuth, async (req, res) => {
  const { niche = '', platform = 'youtube', period = '30d' } = req.body;

  const prompt = `Análise de tendências para:
Nicho: ${niche || 'criadores de conteúdo em geral'}
Plataforma: ${platform.toUpperCase()}
Período: ${period}

Identifique:
1. Formatos em alta (Shorts, Reels, carrosséis, etc.)
2. Temas com alta demanda
3. Hooks virais do momento
4. Formatos de edição em tendência
5. Hashtags relevantes
6. Oportunidades pouco exploradas
7. Erros que criadores evitam agora

Retorne JSON:
{ "trending_formats": [{ "format": "", "growth": "", "example": "" }],
  "hot_topics": [],
  "viral_hooks": [],
  "editing_trends": [],
  "hashtags": [],
  "opportunities": [],
  "avoid": [],
  "summary": "" }`;

  try {
    const result = await chat(
      [{ role: 'system', content: 'Especialista em tendências de conteúdo. Responda em JSON válido.' },
       { role: 'user',   content: prompt }],
      { userId: req.user.id, max_tokens: 1500 },
    );
    let parsed;
    try { const m = result.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { raw: result }; }
    catch { parsed = { raw: result }; }
    res.json({ success: true, data: parsed, niche, platform });
  } catch (err) {
    logger.error('Research trends error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /research/trends-detect — detailed trend detection ──────────────
router.post('/trends-detect', requireAuth, async (req, res) => {
  const { niche = '', platform = 'youtube' } = req.body;
  try {
    const text = await detectTrends({ niche, platform, userId: req.user.id });
    res.json({ success: true, analysis: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /research/status — which APIs are configured ─────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await getIntegrationStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

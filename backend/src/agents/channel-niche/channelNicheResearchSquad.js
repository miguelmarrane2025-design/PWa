// agents/channel-niche/channelNicheResearchSquad.js
//
// Pesquisa nichos específicos para CANAIS: YouTube, TikTok, Instagram/Reels,
// Kwai, canais dark/faceless. Avalia demanda, saturação, retenção, monetização,
// dificuldade de produção e potencial recorrente.
//
// NÃO substitui o Niche Visionary Squad.
// Niche Visionary → oportunidade ampla de mercado/produto/blue ocean.
// Channel Niche Research → oportunidade específica de canal, plataforma, formato.
//
// Provider: OpenAI via llm.js. Nunca chama provider direto.
// Todo output passa por channelNicheReviewerAgent antes de entregar.

import { chat }                    from '../../lib/llm.js';
import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

// Reaproveita agentes de growth existentes
async function tryImport(path) {
  try { return await import(path); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWER — channelNicheReviewerAgent
// ─────────────────────────────────────────────────────────────────────────────
const REVIEWER_SYSTEM = `Você é o ChannelNicheReviewerAgent do BotSquad.

Avalie a pesquisa de nicho para canal com rigor profissional.

CRITÉRIOS OBRIGATÓRIOS (1-10 cada):
1. Demanda real — o nicho tem audiência buscando esse conteúdo?
2. Conteúdo recorrente — dá para produzir por meses/anos sem repetir?
3. Potencial de retenção — o formato prende o espectador?
4. Monetização viável — AdSense, produto, afiliado, serviço ou comunidade?
5. Saturação — é possível se diferenciar ainda?
6. Diferencial — existe ângulo menos saturado claramente definido?
7. Funciona sem rosto — pode ser canal faceless/dark?
8. Plataforma adequada — o melhor fit de plataforma está claro?
9. Risco de copyright/strike — conteúdo original possível?
10. Dificuldade de produção — está dentro do alcance do criador?
11. Conexão com produto/oferta — pode gerar receita além de views?
12. Próximo passo claro — o criador sabe o que fazer agora?

Score 0-100:
- >= 85 → aprovado;
- 70-84 → refinar;
- < 70  → refazer.

NUNCA aprovar se:
- "first30VideoIdeas" estiver vazio;
- "monetizationPaths" estiver vazio;
- nicho for genérico demais ("vida saudável", "motivação");
- não houver análise de plataforma específica.

Retorne APENAS JSON (sem markdown):
{
  "approved": true,
  "score": 0,
  "strengths": [],
  "issues": [],
  "mustFix": [],
  "niceToHave": [],
  "refinementPrompt": "...",
  "memoryNotes": []
}`;

// ─────────────────────────────────────────────────────────────────────────────
// SPECIALIST — pesquisa completa de nicho para canal
// ─────────────────────────────────────────────────────────────────────────────
const SPECIALIST_SYSTEM = `Você é o ChannelNicheResearchSquad do BotSquad.

Sua função é pesquisar e recomendar nichos específicos para canais no YouTube,
TikTok, Instagram/Reels, Kwai e canais dark/faceless.

Você NÃO é o Niche Visionary Squad (que olha mercado/produto/blue ocean amplos).
Você olha especificamente: canal, plataforma, formato, retenção, produção e monetização de conteúdo.

NICHOS PRIORITÁRIOS DO USUÁRIO (tratar com atenção especial):
• Guitarra worship / timbre / pedaleiras / IRs
• Mix para músicos de igreja / worship e gospel
• Fé / histórias bíblicas / reflexões / desenvolvimento cristão
• Canais dark cristãos / narração
• Tecnologia / IA / automação de conteúdo
• Marketing / copy / infoprodutos
• Educação musical / curiosidades
• Histórias / biografias / true crime cristão

PARA CADA NICHO RECOMENDADO, entregue TODOS esses campos:

niche: nome do nicho
subniche: subnicho específico (nunca genérico)
channelType: faceless | personal_brand | hybrid | educational | authority | dark
bestPlatforms: lista com youtube_long, youtube_shorts, tiktok, reels, kwai (ordene por potencial)
audience: quem é a audiência exata
corePainOrDesire: dor ou desejo central que move essa audiência
contentDepthScore: 0-10 (10 = conteúdo infinito; 0 = esgota rápido)
retentionPotential: 0-10
monetizationPotential: 0-10
facelessPotential: 0-10
saturationRisk: 0-10 (10 = muito saturado)
productionDifficulty: 0-10 (10 = muito difícil)
copyrightRisk: 0-10 (10 = alto risco de strike)
differentiationAngle: o ângulo específico menos saturado para atacar
whyItCanWork: 3 razões concretas
whyItCanFail: 3 riscos reais
recommendedFormats: lista de formatos vencedores para esse nicho
first30VideoIdeas: exatamente 30 ideias de vídeo com título completo
monetizationPaths: caminhos concretos (AdSense, afiliado, IR, e-book, preset, curso, mentoria, etc.)
competitorPatterns: padrões observados em canais concorrentes
nextStep: o que o criador deve fazer nos próximos 7 dias

TAMBÉM ENTREGUE:
rejectedNiches: nichos que considerou mas descartou (com motivo)
channelStrategyDraft: posicionamento, pilares de conteúdo, cadência de postagem, primeiros experimentos

Seja ESPECÍFICO. Nunca genérico.
Use exemplos de canais reais quando possível.
Responda na língua do usuário (padrão: português do Brasil).`;

// ─────────────────────────────────────────────────────────────────────────────
// REFINER
// ─────────────────────────────────────────────────────────────────────────────
const REFINER_SYSTEM = SPECIALIST_SYSTEM + `

REFINE o resultado anterior conforme as notas do revisor.
Seja mais específico, corrija os mustFix, amplie first30VideoIdeas se necessário.
Mantenha toda a estrutura JSON intacta.`;

// ─────────────────────────────────────────────────────────────────────────────
// AGENTES INTERNOS (funções auxiliares usadas no buildUserMsg)
// ─────────────────────────────────────────────────────────────────────────────

// 1. channelNicheScoutAgent — extrair sinais do pedido
function buildNicheScoutContext(message, briefing = {}) {
  const platforms  = briefing.platforms  || ['youtube', 'tiktok'];
  const interests  = briefing.interests  || [];
  const products   = briefing.products   || [];
  const faceless   = briefing.constraints?.faceless   !== false;
  const noCopyright= briefing.constraints?.noCopyrightRisk !== false;

  return [
    `PEDIDO: ${message}`,
    `PLATAFORMAS DE INTERESSE: ${platforms.join(', ')}`,
    interests.length  ? `INTERESSES DO CRIADOR: ${interests.join(', ')}` : '',
    products.length   ? `PRODUTOS/ATIVOS DO CRIADOR: ${products.join(', ')}` : '',
    faceless          ? 'RESTRIÇÃO: preferência por canal sem rosto (faceless/dark)' : '',
    noCopyright       ? 'RESTRIÇÃO: sem risco de copyright ou strike' : '',
    briefing.preferredNiches?.length ? `NICHOS PREFERIDOS: ${briefing.preferredNiches.join(', ')}` : '',
    briefing.avoidNiches?.length     ? `NICHOS A EVITAR: ${briefing.avoidNiches.join(', ')}` : '',
    `OBJETIVO: ${briefing.goal || 'crescer canal e monetizar'}`,
    `IDIOMA: ${briefing.language || 'pt-BR'} | REGIÃO: ${briefing.region || 'BR'}`,
  ].filter(Boolean).join('\n');
}

// 2. Tenta reaproveitar competitorGapAgent existente
async function runCompetitorContext(niche, userId) {
  try {
    const mod = await tryImport('../growth/competitorGapAgent.js');
    if (mod?.competitorGapAgent) {
      const r = await mod.competitorGapAgent({ message: `Analise concorrentes no nicho: ${niche}`, niche, userId });
      return r?.content || r?.response || '';
    }
  } catch {}
  return '';
}

// 3. Tenta reaproveitar contentPatternAnalystAgent existente
async function runContentPatternContext(niche, platform, userId) {
  try {
    const mod = await tryImport('../growth/contentPatternAnalystAgent.js');
    if (mod?.contentPatternAnalystAgent) {
      const r = await mod.contentPatternAnalystAgent({ message: `Padrões vencedores nicho: ${niche}`, niche, platform, userId });
      return r?.content || r?.response || '';
    }
  } catch {}
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FLOW
// ─────────────────────────────────────────────────────────────────────────────
export async function runChannelNicheResearchFlow({
  message,
  context    = [],
  files      = [],
  userId,
  briefing   = {},
}) {
  logger.info(`[ChannelNicheResearchSquad] userId=${userId}`);

  // Carregar contexto de memória de nichos aprovados anteriormente
  let memCtx = '';
  try {
    const mem = await agentMemoryService.loadAgentContext('channel-niche-research');
    const prev = mem?.goodExamples?.slice(-2).map(e => e.output?.content || '').filter(Boolean).join('\n---\n');
    if (prev) memCtx = `\nNICHOS APROVADOS ANTERIORES (referência de qualidade):\n${prev}`;
  } catch {}

  // Enriquecer com contexto de concorrentes/padrões quando possível
  let enrichedContext = '';
  const nicheHint = briefing.preferredNiches?.[0] || message.match(/guitarra|worship|gospel|bíblico|tecnologia|ia\b/i)?.[0] || '';
  if (nicheHint) {
    const [compCtx, patternCtx] = await Promise.allSettled([
      runCompetitorContext(nicheHint, userId),
      runContentPatternContext(nicheHint, briefing.platforms?.[0] || 'youtube', userId),
    ]);
    if (compCtx.status === 'fulfilled' && compCtx.value)    enrichedContext += `\nConcorrentes: ${compCtx.value.slice(0, 400)}`;
    if (patternCtx.status === 'fulfilled' && patternCtx.value) enrichedContext += `\nPadrões: ${patternCtx.value.slice(0, 400)}`;
  }

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + memCtx,
    buildUserMsg: (inp) => buildNicheScoutContext(inp.message, inp.briefing) + (enrichedContext ? `\n\nCONTEXTO ADICIONAL:${enrichedContext}` : ''),
    userId,
  });

  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 85, userId });

  const refiner = makeSpecialist({
    systemPrompt: REFINER_SYSTEM,
    buildUserMsg: (inp, draft, notes) =>
      `PEDIDO ORIGINAL:\n${buildNicheScoutContext(inp.message, inp.briefing)}\n\n` +
      `RASCUNHO ANTERIOR:\n${draft?.content || ''}\n\n` +
      `NOTAS DO REVISOR:\n${(notes || []).join('\n')}`,
    userId,
  });

  const result = await runWithReview({
    specialist,
    reviewer,
    refiner,
    input:        { message, briefing },
    minScore:     85,
    maxRefinementCycles: 2,
    memoryKey:    'channel-niche-research',
    userId,
  });

  const content      = result.output?.content || result.output || 'Pesquisa de nicho concluída.';
  const pendingWarn  = result.pendingWarning ? `\n\n${result.pendingWarning}` : '';
  const scoreLabel   = result.approved ? '✅' : '⚠';

  return {
    content:  `📺 **Channel Niche Research Squad** | ${scoreLabel} Score: ${result.qualityScore}/100\n\n${content}${pendingWarn}`,
    agent:    'channel_niche_research_squad',
    metadata: {
      qualityScore: result.qualityScore,
      approved:     result.approved,
      attempts:     result.attempts,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports nomeados para uso por outros squads
// ─────────────────────────────────────────────────────────────────────────────
export { runCompetitorContext, runContentPatternContext };
export default { runChannelNicheResearchFlow };

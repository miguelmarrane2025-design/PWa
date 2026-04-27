// agents/copy/copySquad.js
// Squad completo de copy: CopyChief → Copywriter → CopyReview → CopyRefiner.
// Provider: OpenAI via chat/chatFast do llm.js. Nunca Anthropic.

import { chat, chatFast } from '../../lib/llm.js';
import { runWithReview, makeReviewer } from '../../core/runWithReview.js';
import { agentMemoryService } from '../../memory/agentMemoryService.js';
import { logger } from '../../lib/logger.js';

// ── CopyChiefAgent: define estratégia antes de escrever ───────────────────────
export async function copyChiefAgent({ topic, niche, goal, audience, userId }) {
  logger.info(`[CopyChief] topic=${topic} niche=${niche}`);

  const ctx = await agentMemoryService.loadAgentContext('copy');
  const examples = ctx.goodExamples.slice(-2).map(e => e.output?.headline || '').filter(Boolean).join(' | ');

  const prompt = `Você é um copy chief sênior — o estrategista por trás de copies de alta conversão.
Defina a estratégia antes de escrever uma linha sequer.

PEDIDO: ${topic}
NICHO: ${niche || 'geral'}
OBJETIVO: ${goal || 'vender/engajar'}
PÚBLICO: ${audience || 'empreendedores digitais brasileiros'}
${examples ? `REFERÊNCIAS APROVADAS ANTERIORES (headlines): ${examples}` : ''}

Retorne JSON:
{
  "promise": "promessa central irresistível",
  "pain": "dor específica do público",
  "mechanism": "mecanismo único/diferencial",
  "proof_type": "tipo de prova (depoimento/dado/lógica/demo)",
  "tone": "tom de voz (autoritário/empático/urgente/inspiracional)",
  "format": "formato ideal (VSL/email/página/carrossel/anúncio)",
  "angle": "ângulo de entrada (problema/solução/desafio/segredo/contrário)",
  "hook_style": "estilo de gancho (pergunta/afirmação/número/história/polêmica)"
}`;

  const raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 1000 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { promise: topic, pain: '', mechanism: '', tone: 'empático', format: 'carrossel', angle: 'problema', hook_style: 'pergunta' };
  } catch { return { promise: topic, pain: '', mechanism: '', tone: 'empático', format: 'carrossel', angle: 'problema', hook_style: 'pergunta' }; }
}

// ── CopywriterAgent: escreve com base na estratégia ───────────────────────────
export async function copywriterAgent({ topic, niche, strategy, userId }) {
  logger.info(`[Copywriter] topic=${topic}`);

  const prompt = `Você é um copywriter de elite. Escreva usando princípios de Hopkins, Ogilvy, Sugarman, Cialdini, Schwartz e StoryBrand.

ESTRATÉGIA:
${JSON.stringify(strategy, null, 2)}

NICHO: ${niche || 'geral'}
TEMA: ${topic}

Regras:
- Headline seleciona o público correto
- Promessa específica, não genérica
- Dor real e detalhada
- Mecanismo único explicado
- Prova ou lógica irrefutável
- CTA direto e urgente
- Texto soa humano, não de IA
- Zero clichê ("mercado em expansão", "oportunidade única")

Retorne JSON:
{
  "headline": "headline principal",
  "subheadline": "subtítulo",
  "lead": "gancho de abertura (2-3 frases)",
  "dor": "desenvolvimento da dor (2 parágrafos)",
  "solucao": "apresentação da solução (2 parágrafos)",
  "mecanismo": "explicação do mecanismo único",
  "prova": "prova/lógica/depoimento",
  "oferta": "o que o leitor vai receber",
  "cta": "chamada para ação",
  "urgencia": "motivo para agir agora",
  "ps": "P.S. que reforça",
  "versaoShort": "versão de até 150 chars para anúncio",
  "versaoCarrossel": ["slide 1 título", "slide 2 título", "slide 3 título"]
}`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 2500 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { headline: topic, raw };
  } catch { return { headline: topic, raw }; }
}

// ── CopyReviewAgent: revisor específico de copy ───────────────────────────────
const COPY_REVIEW_SYSTEM = `Você é um revisor de copy especialista em Scientific Advertising (Hopkins), Ogilvy, Sugarman, Cialdini, Schwartz, StoryBrand e McKee.

Avalie a copy com score de 0 a 100:
- Headline seleciona o público correto? (0-15)
- Promessa específica e crível? (0-15)
- Dor detalhada e real? (0-10)
- Mecanismo único presente? (0-10)
- Prova/lógica irrefutável? (0-10)
- CTA forte e direto? (0-10)
- Texto parece humano (não IA)? (0-10)
- Zero genérico/clichê? (0-10)
- Especificidade geral (nomes, números, datas)? (0-10)

Score mínimo aceitável: 85.
Retorne SOMENTE JSON: {"score":0,"notes":[],"passed":false,"mustFix":[]}`;

export const copyReviewAgent = makeReviewer({ systemPrompt: COPY_REVIEW_SYSTEM, minScore: 85 });

// ── CopyRefinerAgent: refina com base nas notas do revisor ────────────────────
export async function copyRefinerAgent({ topic, niche, strategy, userId }, draft, notes) {
  logger.info(`[CopyRefiner] refining, notes=${notes.length}`);

  const draftStr = typeof draft === 'string' ? draft : JSON.stringify(draft?.content ?? draft ?? '');
  const prompt = `Você é um copywriter de elite. Refine a copy abaixo com base nas críticas do revisor.

TEMA: ${topic}
NICHO: ${niche || 'geral'}
ESTRATÉGIA: ${JSON.stringify(strategy || {})}

COPY ORIGINAL:
${draftStr.slice(0, 2000)}

CRÍTICAS DO REVISOR:
${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Corrija TODOS os pontos críticos. Retorne JSON no mesmo formato, sem markdown.`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 2500 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? { content: JSON.parse(m[0]), raw } : { content: { headline: topic }, raw };
  } catch { return { content: { headline: topic }, raw }; }
}

// ── Fluxo principal: runCopyFlow ──────────────────────────────────────────────
export async function runCopyFlow({ topic, niche, goal, audience, userId }) {
  logger.info(`[CopySquad] start topic=${topic}`);

  // 1. Estratégia
  const strategy = await copyChiefAgent({ topic, niche, goal, audience, userId });

  // 2. Escrever + revisar + refinar
  const result = await runWithReview({
    specialist: async (input) => {
      const copy = await copywriterAgent({ topic, niche, strategy, userId });
      return { content: copy, raw: JSON.stringify(copy) };
    },
    reviewer: copyReviewAgent,
    refiner: async (input, draft, notes) => {
      return copyRefinerAgent({ topic, niche, strategy, userId }, draft, notes);
    },
    input: { topic, niche, strategy },
    minScore: 85,
    maxAttempts: 3,
    memoryKey: 'copy',
    userId,
  });

  const copy = result.output?.content ?? result.output;

  // Formatar resposta para o usuário
  if (!copy || typeof copy !== 'object') {
    return { content: String(copy || 'Erro ao gerar copy'), agent: 'copy-squad', metadata: result };
  }

  const lines = [
    `📝 **Copy Gerada** *(score: ${result.qualityScore}/100 | ${result.attempts} tentativa(s))*`,
    ``,
    `**🎯 Headline:** ${copy.headline || ''}`,
    copy.subheadline ? `**Subtítulo:** ${copy.subheadline}` : '',
    ``,
    copy.lead ? `**Gancho:** ${copy.lead}` : '',
    copy.dor  ? `\n**Dor:** ${copy.dor}` : '',
    copy.solucao ? `\n**Solução:** ${copy.solucao}` : '',
    copy.mecanismo ? `\n**Mecanismo:** ${copy.mecanismo}` : '',
    copy.prova ? `\n**Prova:** ${copy.prova}` : '',
    copy.oferta ? `\n**Oferta:** ${copy.oferta}` : '',
    ``,
    copy.cta ? `**→ CTA:** ${copy.cta}` : '',
    copy.urgencia ? `**⏳ Urgência:** ${copy.urgencia}` : '',
    copy.ps  ? `\n_${copy.ps}_` : '',
    ``,
    copy.versaoShort ? `---\n**Versão curta (anúncio):** ${copy.versaoShort}` : '',
    result.approved ? `\n✅ *Copy aprovada pelo revisor*` : `\n⚠️ *Score: ${result.qualityScore}/100 — Notas: ${result.reviewNotes.slice(0,2).join('; ')}*`,
  ].filter(Boolean).join('\n');

  return { content: lines, agent: 'copy-squad', metadata: { ...result, copy, strategy } };
}

export default { runCopyFlow, copyChiefAgent, copywriterAgent, copyReviewAgent, copyRefinerAgent };

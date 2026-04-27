// agents/infoproduct/infoproductSquad.js
// Squad: Strategist → Outline → Writer → Review → saída.
// Provider: OpenAI via chat/chatFast. Nunca Anthropic.

import { chat, chatFast } from '../../lib/llm.js';
import { runWithReview, makeReviewer } from '../../core/runWithReview.js';
import { agentMemoryService } from '../../memory/agentMemoryService.js';
import { logger } from '../../lib/logger.js';

// ── Strategist ────────────────────────────────────────────────────────────────
async function infoproductStrategist({ topic, niche, audience, level, userId }) {
  logger.info(`[InfoStrategist] topic=${topic}`);
  const ctx = await agentMemoryService.loadAgentContext('infoproduct');

  const prompt = `Você é um estrategista de infoprodutos de alta performance.

TEMA: ${topic}
NICHO: ${niche || 'geral'}
PÚBLICO: ${audience || 'iniciantes'}
NÍVEL: ${level || 'iniciante'}
${ctx.goodExamples.length ? `REFERÊNCIAS ANTERIORES APROVADAS: ${ctx.goodExamples.slice(-2).map(e => e.output?.promise || '').join(' | ')}` : ''}

Defina a estratégia do infoproduto ANTES de criar o conteúdo.

Retorne JSON:
{
  "title": "título do infoproduto",
  "promise": "promessa central de transformação",
  "target": "perfil exato do aluno ideal",
  "pain": "dor específica que resolve",
  "transformation": "antes → depois detalhado",
  "mechanism": "método único / diferencial",
  "format": "ebook|curso|workshop|mentoria|checklist|guia",
  "modules": 5,
  "price_range": "R$47 - R$197",
  "cta": "chamada de vendas principal",
  "marketable": true,
  "why_buy": "por que comprar este e não outro"
}`;

  const raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 1000 });
  try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { title: topic }; }
  catch { return { title: topic }; }
}

// ── Outline ───────────────────────────────────────────────────────────────────
async function infoproductOutline({ strategy, userId }) {
  const prompt = `Você é um especialista em estrutura de infoprodutos e educação online.

ESTRATÉGIA: ${JSON.stringify(strategy)}

Crie a estrutura completa do infoproduto.

Retorne JSON:
{
  "title": "${strategy.title}",
  "intro": "apresentação do método e promessa",
  "modules": [
    {
      "number": 1,
      "title": "Título do módulo",
      "objective": "O que o aluno vai aprender",
      "lessons": ["Lição 1", "Lição 2", "Lição 3"],
      "exercise": "exercício prático",
      "deliverable": "o que o aluno terá ao fim"
    }
  ],
  "bonus": ["bônus 1", "bônus 2"],
  "checklist": ["passo 1", "passo 2"],
  "conclusion": "mensagem final de transformação"
}`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 2500 });
  try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { title: strategy.title }; }
  catch { return { title: strategy.title }; }
}

// ── Review ────────────────────────────────────────────────────────────────────
const INFO_REVIEW_SYSTEM = `Você é um revisor de infoprodutos. Avalie com score 0-100:
- Profundidade do conteúdo? (0-15)
- Clareza e didática? (0-15)
- Valor de mercado real? (0-15)
- Aplicabilidade prática? (0-15)
- Resolve uma dor real e específica? (0-10)
- Parece genérico/de ChatGPT? (0-10, pontua alto se NÃO parecer)
- Tem exercícios/checklists? (0-10)
- Poderia ser vendido? (0-10)
Score mínimo: 85. Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const infoproductReviewer = makeReviewer({ systemPrompt: INFO_REVIEW_SYSTEM, minScore: 85 });

// ── Fluxo principal ───────────────────────────────────────────────────────────
export async function runInfoproductFlow({ topic, niche, audience, level, userId }) {
  logger.info(`[InfoproductSquad] start topic=${topic}`);

  const strategy = await infoproductStrategist({ topic, niche, audience, level, userId });

  const result = await runWithReview({
    specialist: async () => {
      const outline = await infoproductOutline({ strategy, userId });
      return { content: outline, raw: JSON.stringify(outline) };
    },
    reviewer: infoproductReviewer,
    refiner: async (input, draft, notes) => {
      const draftStr = JSON.stringify(draft?.content ?? draft ?? '');
      const prompt = `Melhore este infoproduto com base nas críticas.\n\nESTRATÉGIA: ${JSON.stringify(strategy)}\nESTRUTURA ATUAL: ${draftStr.slice(0,1500)}\nCRÍTICAS: ${notes.join('\n')}\n\nRetorne JSON melhorado no mesmo formato.`;
      const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 2500 });
      try { const m = raw.match(/\{[\s\S]*\}/); return m ? { content: JSON.parse(m[0]), raw } : draft; }
      catch { return draft; }
    },
    input: { topic, niche, strategy },
    minScore: 85, maxAttempts: 2, memoryKey: 'infoproduct', userId,
  });

  const outline = result.output?.content ?? result.output;

  const lines = [
    `📚 **Infoproduto: ${strategy.title || topic}**`,
    `*(score: ${result.qualityScore}/100 | ${result.attempts} tentativa(s))*`,
    ``,
    `**Promessa:** ${strategy.promise || ''}`,
    `**Público:** ${strategy.target || audience}`,
    `**Formato:** ${strategy.format || 'Ebook/Guia'}`,
    `**Faixa de preço:** ${strategy.price_range || ''}`,
    ``,
    outline?.modules?.length ? `**Módulos (${outline.modules.length}):**\n${outline.modules.map(m => `**${m.number}. ${m.title}**\n_${m.objective}_\n${m.lessons?.map(l=>`  • ${l}`).join('\n')||''}`).join('\n\n')}` : '',
    outline?.bonus?.length ? `\n**Bônus:** ${outline.bonus.join(' · ')}` : '',
    outline?.checklist?.length ? `\n**Checklist:** ${outline.checklist.join(' · ')}` : '',
    ``,
    result.approved ? `✅ *Aprovado pelo revisor*` : `⚠️ *Score ${result.qualityScore}/100*`,
  ].filter(Boolean).join('\n');

  return { content: lines, agent: 'infoproduct-squad', metadata: { strategy, outline, ...result } };
}

export default { runInfoproductFlow };

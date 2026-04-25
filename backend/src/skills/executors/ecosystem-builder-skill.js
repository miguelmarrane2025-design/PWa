// skills/executors/ecosystem-builder-skill.js
// Skill: EcosystemBuilder — Projeta o ecossistema digital completo do infoprodutor.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function ecosystemBuilderSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const estagio = params.estagio || 'iniciante'; // iniciante|crescimento|escala
  const oferta = ctx.oferta || params.oferta || {};

  log('info', `[EcosystemBuilder] ${nicho} | ${estagio}`);

  const prompt = `Projete o ecossistema digital completo para um infoprodutor no estágio "${estagio}".

NICHO: "${nicho}"
OFERTA PRINCIPAL: ${JSON.stringify(oferta).substring(0, 300)}

Retorne JSON:
{
  "visao_geral": "como todos os elementos se conectam",
  "hub_central": { "plataforma": "onde mora a audiência principal", "justificativa": "..." },
  "canais_aquisicao": [
    { "canal": "nome", "tipo": "organico|pago", "funcao": "topo/meio/fundo", "prioridade": 1 }
  ],
  "canais_relacionamento": [
    { "canal": "WhatsApp/Telegram/Email", "funcao": "...", "frequencia": "..." }
  ],
  "plataformas_vendas": ["Hotmart", "Kiwify", "..."],
  "ferramentas_essenciais": [
    { "ferramenta": "nome", "funcao": "para que serve", "custo_mes": "R$ X", "prioridade": "essencial|opcional" }
  ],
  "fluxo_cliente": [
    { "etapa": 1, "nome": "Descoberta", "canal": "...", "acao": "..." }
  ],
  "automacoes_recomendadas": ["automação 1", "automação 2"],
  "budget_mensal": {
    "iniciante": "R$ X total (breakdown)",
    "crescimento": "R$ Y total",
    "escala": "R$ Z total"
  },
  "stack_tecnologico_minimo": ["ferramenta 1", "ferramenta 2"],
  "roadmap_implementacao": [
    { "semana": 1, "implementar": ["o que configurar primeiro"] }
  ]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const ecossistema = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('ecosystems', `eco_${nicho}_${Date.now()}`, ecossistema, userId);

    const linhas = [
      `🌐 *Ecossistema Digital — ${nicho} [${estagio}]*\n`,
      `🏠 Hub Central: *${ecossistema.hub_central?.plataforma}*`,
      `${ecossistema.hub_central?.justificativa}\n`,
      `📡 *Aquisição (${ecossistema.canais_aquisicao?.length} canais):*`,
      ...(ecossistema.canais_aquisicao || []).map(c => `${c.prioridade}. ${c.canal} [${c.tipo}] → ${c.funcao}`),
      `\n🔧 *Stack Mínimo:*`,
      ...(ecossistema.stack_tecnologico_minimo || []).map(s => `• ${s}`),
      `\n💰 Budget ${estagio}: ${ecossistema.budget_mensal?.[estagio]}`,
      `\n🤖 *Automações:*`,
      ...(ecossistema.automacoes_recomendadas || []).slice(0, 3).map(a => `• ${a}`),
      `\n📋 *Semana 1:*`,
      ...(ecossistema.roadmap_implementacao?.[0]?.implementar || []).map(i => `• ${i}`)
    ];

    return {
      ecossistema,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[EcosystemBuilder] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao projetar ecossistema.' }] };
  }
}

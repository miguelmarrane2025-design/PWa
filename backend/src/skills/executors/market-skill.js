// skills/executors/market-skill.js
// Skill: MarketSkill — Pesquisa automatizada de mercado, tendências e concorrentes.
// Adapter do worker de autopesquisa integrado ao sistema de skills.

import { log } from '../../core/logger.js';

export default async function marketSkill(ctx, params, tools) {
  const { openaiStrong, webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const foco = params.foco || 'geral'; // tendencias | concorrentes | hooks | copies | palavras-chave | geral
  const profundidade = params.profundidade || 'media'; // rápida | media | profunda

  log('info', `[MarketSkill] Nicho: ${nicho} | Foco: ${foco}`);

  // Queries de busca baseadas no foco
  const queryMap = {
    tendencias: [`tendências ${nicho} 2025 Brasil`, `novidades ${nicho} mercado digital`],
    concorrentes: [`top criadores ${nicho} Brasil`, `melhores produtos ${nicho} digital`],
    hooks: [`hooks virais ${nicho}`, `frases que engajam ${nicho} instagram tiktok`],
    copies: [`copy que converte ${nicho}`, `exemplos copy vendas ${nicho} Brasil`],
    'palavras-chave': [`palavras chave ${nicho} SEO`, `termos mais buscados ${nicho}`],
    geral: [`mercado ${nicho} Brasil 2025`, `oportunidades ${nicho} digital`]
  };

  const queries = queryMap[foco] || queryMap.geral;
  let dadosPesquisa = '';

  try {
    const resultados = await Promise.allSettled(
      queries.map(q => webSearch.buscarTexto(q, { limite: 3 }))
    );
    dadosPesquisa = resultados
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .join('\n\n')
      .substring(0, 2500);
  } catch (_) {}

  const prompt = `Você é um pesquisador de mercado digital especialista no Brasil.
Analise os dados coletados e gere inteligência de mercado para o nicho "${nicho}".
Foco da pesquisa: ${foco}

DADOS COLETADOS:
${dadosPesquisa || 'Sem dados externos — use seu conhecimento sobre o mercado.'}

Retorne JSON:
{
  "nicho": "${nicho}",
  "foco": "${foco}",
  "dataAnalise": "${new Date().toLocaleDateString('pt-BR')}",
  "resumoExecutivo": "3 frases com os principais achados",
  "insights": [
    { "titulo": "insight 1", "descricao": "detalhamento", "acao": "o que fazer com isso", "prioridade": "alta|media|baixa" }
  ],
  "oportunidades": ["oportunidade 1", "oportunidade 2", "oportunidade 3"],
  "ameacas": ["ameaça 1", "ameaça 2"],
  "dadosEspecificos": {
    "tendencias": ["tendência 1", "tendência 2"],
    "concorrentes": ["concorrente/referência 1", "concorrente/referência 2"],
    "hooks": ["hook encontrado 1", "hook encontrado 2"],
    "palavrasChave": ["palavra 1", "palavra 2", "palavra 3"]
  },
  "proximosPassos": ["ação 1", "ação 2", "ação 3"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const pesquisa = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    if (userId) {
      await memoryMCP.salvar('market', `pesquisa_${foco}`, pesquisa, userId);
    }

    const prioridadeEmoji = { alta: '🔴', media: '🟡', baixa: '🟢' };

    const texto = [
      `🔭 *PESQUISA DE MERCADO — ${nicho.toUpperCase()}*`,
      `📌 Foco: ${foco} | ${pesquisa.dataAnalise}\n`,
      `📋 *Resumo:* ${pesquisa.resumoExecutivo}\n`,
      `💡 *Insights Estratégicos:*`,
      ...(pesquisa.insights || []).map(i =>
        `${prioridadeEmoji[i.prioridade] || '•'} *${i.titulo}*\n  ${i.descricao}\n  ➡️ ${i.acao}`
      ),
      `\n🚀 *Oportunidades:*`,
      ...(pesquisa.oportunidades || []).map(o => `• ${o}`),
      `\n📅 *Próximos Passos:*`,
      ...(pesquisa.proximosPassos || []).map((p, i) => `${i + 1}. ${p}`)
    ].join('\n');

    return {
      marketResearch: pesquisa,
      outputs: [{ tipo: 'texto', conteudo: texto }]
    };

  } catch (err) {
    log('error', `[MarketSkill] Erro: ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro na pesquisa de mercado: ${err.message}` }] };
  }
}

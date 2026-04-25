// skills/executors/strategy-planner-skill.js
// Skill: StrategyPlanner — Cria plano estratégico de 90 dias com marcos e ações.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function strategyPlannerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const objetivo = params.objetivo || ctx.sessao?.ultimoTexto || 'crescer no digital';
  const recursos = params.recursos || { tempo: '2h/dia', budget: 'R$ 500/mês', equipe: 'solo' };
  const analiseNicho = ctx.analiseNicho || {};
  const oferta = ctx.oferta || {};

  log('info', `[StrategyPlanner] Objetivo: ${objetivo}`);

  const prompt = `Crie um plano estratégico de 90 dias baseado na realidade do mercado.

NICHO: "${nicho}"
OBJETIVO: "${objetivo}"
RECURSOS: ${JSON.stringify(recursos)}
ANÁLISE DO NICHO: ${JSON.stringify(analiseNicho).substring(0, 500)}
OFERTA: ${JSON.stringify(oferta).substring(0, 300)}

Retorne JSON:
{
  "visao": "onde estar em 90 dias",
  "missao_90_dias": "o que precisa ser feito",
  "kpis_principais": [
    { "metrica": "nome", "meta_90d": "valor", "como_medir": "..." }
  ],
  "pilares_estrategicos": [
    { "pilar": "nome", "descricao": "o que é", "peso": 40 }
  ],
  "fases": [
    {
      "fase": 1,
      "nome": "nome da fase",
      "duracao": "30 dias",
      "objetivo": "o que alcançar",
      "acoes_principais": ["ação 1", "ação 2", "ação 3"],
      "entregaveis": ["o que terá ao final"],
      "marco": "evento que prova que a fase foi concluída"
    }
  ],
  "plano_semanal_tipo": {
    "segunda": "foco em X",
    "terca": "foco em Y",
    "quarta": "foco em Z",
    "quinta": "foco em W",
    "sexta": "foco em V",
    "fim_de_semana": "leve ou descanso"
  },
  "recursos_necessarios": { "ferramentas": ["ferramenta 1"], "investimento_mensal": "R$", "aprendizados": ["o que aprender"] },
  "riscos_mitigacao": [{ "risco": "risco 1", "mitigacao": "como evitar" }],
  "quick_wins_semana_1": ["o que fazer HOJE", "ação 2", "ação 3"],
  "maior_alavanca": "a ação única com maior impacto para o objetivo"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const plano = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('strategies', `strat_90d_${Date.now()}`, plano, userId);

    const linhas = [
      `🗺️ *Plano Estratégico 90 Dias — ${nicho}*\n`,
      `🎯 Visão: ${plano.visao}\n`,
      `📊 *KPIs:*`,
      ...(plano.kpis_principais || []).map(k => `• ${k.metrica}: Meta ${k.meta_90d}`),
      `\n📅 *3 Fases:*`,
      ...(plano.fases || []).map(f =>
        `*Fase ${f.fase}: ${f.nome}* (${f.duracao})\n  🎯 ${f.objetivo}\n  📌 Marco: ${f.marco}`
      ),
      `\n⚡ *Maior Alavanca:* ${plano.maior_alavanca}`,
      `\n🚀 *Esta semana:*`,
      ...(plano.quick_wins_semana_1 || []).map((q, i) => `${i+1}. ${q}`)
    ];

    return {
      planoEstrategico: plano,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[StrategyPlanner] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar plano.' }] };
  }
}

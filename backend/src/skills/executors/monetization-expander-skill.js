// skills/executors/monetization-expander-skill.js
// Skill: MonetizationExpander — Mapeia e expande todas as formas de monetização do nicho.
// Cria um ecossistema de receita com múltiplos produtos e fluxos de caixa.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function monetizationExpanderSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const receitaAtual = params.receita_atual || 0;
  const analiseNicho = ctx.analiseNicho || {};

  log('info', `[MonetizationExpander] Nicho: ${nicho}`);

  let modelos = [];
  try {
    const r = await webSearch(`formas de monetizar ${nicho} digital renda múltipla 2025`, { maxResultados: 5 });
    modelos = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Mapeie TODAS as formas de monetização para o nicho "${nicho}" e crie um plano de expansão.

RECEITA ATUAL: R$ ${receitaAtual}/mês
ANÁLISE DO NICHO: ${JSON.stringify(analiseNicho).substring(0, 600)}
REFERÊNCIAS: ${modelos.map(m => m.titulo).join(', ')}

Retorne JSON:
{
  "mapa_monetizacao": [
    {
      "modelo": "nome do modelo de monetização",
      "tipo": "produto_proprio|afiliado|servico|recorrencia|licenciamento|evento",
      "ticket": "R$ X - R$ Y",
      "recorrencia": true/false,
      "complexidade": "baixa|media|alta",
      "tempo_implementacao": "X dias/semanas",
      "potencial_mensal": "R$ X",
      "como_implementar": "passo inicial"
    }
  ],
  "plano_expansao_90_dias": [
    { "mes": 1, "foco": "o que monetizar primeiro", "meta_receita": "R$", "acoes": ["ação 1", "ação 2"] },
    { "mes": 2, "foco": "expansão", "meta_receita": "R$", "acoes": ["ação 1"] },
    { "mes": 3, "foco": "escala", "meta_receita": "R$", "acoes": ["ação 1"] }
  ],
  "modelo_recomendado_agora": "qual modelo começar imediatamente e por quê",
  "receita_potencial_total": "R$ X/mês com todos os modelos ativos",
  "quick_win_monetizacao": "forma mais rápida de gerar receita em menos de 7 dias",
  "afiliados_sugeridos": ["programa de afiliados relevante para o nicho 1", "2"],
  "produto_passivo_ideal": "qual produto criar para receita passiva"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const plano = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('monetization_plans', `mon_${nicho}_${Date.now()}`, plano, userId);

    const linhas = [
      `💰 *Mapa de Monetização — ${nicho}*\n`,
      `⚡ *Quick Win (faça em 7 dias):* ${plano.quick_win_monetizacao}\n`,
      `📋 *Modelos disponíveis (${plano.mapa_monetizacao?.length}):*`,
      ...(plano.mapa_monetizacao || []).map(m =>
        `• *${m.modelo}* [${m.tipo}]\n  💵 ${m.ticket} | ⏱️ ${m.tempo_implementacao} | ${m.recorrencia ? '🔄 Recorrente' : '💸 Pontual'}`
      ),
      `\n📅 *Plano 90 Dias:*`,
      ...(plano.plano_expansao_90_dias || []).map(m =>
        `Mês ${m.mes}: ${m.foco} → Meta: ${m.meta_receita}`
      ),
      `\n🎯 *Começar agora:* ${plano.modelo_recomendado_agora}`,
      `\n💎 *Potencial Total:* ${plano.receita_potencial_total}`
    ];

    return {
      planoMonetizacao: plano,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[MonetizationExpander] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro no plano de monetização.' }] };
  }
}

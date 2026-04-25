// skills/executors/product-validator-skill.js
// Skill: ProductValidator — Valida a viabilidade de um produto/ideia ANTES de criar.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function productValidatorSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const ideia = params.ideia || ctx.produto?.nome || ctx.sessao?.ultimoTexto || '';
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';

  if (!ideia) return { outputs: [{ tipo: 'texto', conteudo: '💡 Descreva a ideia de produto que deseja validar.' }] };

  log('info', `[ProductValidator] Validando: ${ideia}`);

  let dadosMercado = [];
  try {
    const [r1, r2] = await Promise.allSettled([
      webSearch(`${ideia} ${nicho} concorrentes vendendo reviews`, { maxResultados: 5 }),
      webSearch(`${ideia} demanda busca Google tendencia 2025`, { maxResultados: 4 })
    ]);
    if (r1.status === 'fulfilled') dadosMercado.push(...(r1.value?.resultados || []));
    if (r2.status === 'fulfilled') dadosMercado.push(...(r2.value?.resultados || []));
  } catch {}

  const prompt = `Valide a viabilidade comercial desta ideia de produto para o mercado brasileiro.

IDEIA: "${ideia}"
NICHO: "${nicho}"

DADOS DE MERCADO:
${dadosMercado.slice(0, 8).map(r => `• ${r.titulo}: ${r.snippet?.substring(0, 120)}`).join('\n')}

Retorne JSON:
{
  "score_viabilidade": 0-10,
  "veredicto": "aprovado|atenção|reprovado",
  "demanda": { "nivel": "alta|media|baixa", "evidencias": ["evidência 1", "evidência 2"] },
  "competicao": { "nivel": "alta|media|baixa", "concorrentes_identificados": ["nome 1"], "gaps": ["oportunidade não atendida"] },
  "fit_mercado": { "tem_fit": true/false, "justificativa": "..." },
  "riscos": ["risco 1", "risco 2"],
  "oportunidades": ["oportunidade 1", "oportunidade 2"],
  "publico_disposto_a_pagar": true/false,
  "ticket_provavel": 97,
  "diferenciacao_necessaria": "o que precisa ser único para ter sucesso",
  "forma_mais_rapida_validar": "como testar em 7 dias sem criar o produto",
  "mvp_sugerido": "versão mínima para testar",
  "recomendacao_final": "texto com a recomendação objetiva"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const validacao = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const icons = { aprovado: '✅', atenção: '⚠️', reprovado: '❌' };
    const linhas = [
      `🔬 *Validação: ${ideia}*\n`,
      `${icons[validacao.veredicto] || '📊'} Veredicto: *${validacao.veredicto?.toUpperCase()}* (${validacao.score_viabilidade}/10)\n`,
      `📈 Demanda: ${validacao.demanda?.nivel} — ${validacao.demanda?.evidencias?.[0]}`,
      `🏁 Competição: ${validacao.competicao?.nivel}\n`,
      validacao.competicao?.gaps?.length ? `💡 *Gaps no mercado:*\n${validacao.competicao.gaps.map(g => `• ${g}`).join('\n')}` : '',
      `\n⚠️ *Riscos:*\n${validacao.riscos?.map(r => `• ${r}`).join('\n')}`,
      `\n🎯 Diferenciação necessária: ${validacao.diferenciacao_necessaria}`,
      `\n⚡ *Valide em 7 dias:* ${validacao.forma_mais_rapida_validar}`,
      `📦 MVP sugerido: ${validacao.mvp_sugerido}`,
      `\n💬 *Recomendação:* ${validacao.recomendacao_final}`
    ].filter(Boolean);

    return {
      validacaoProduto: validacao,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[ProductValidator] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro na validação.' }] };
  }
}

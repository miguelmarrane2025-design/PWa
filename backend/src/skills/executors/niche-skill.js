// skills/executors/niche-skill.js
// Skill: NicheSkill — Adapter para análise profunda de nicho de mercado.
// Avalia viabilidade, concorrência, dores e oportunidades de um nicho.

import { log } from '../../core/logger.js';

export default async function nicheSkill(ctx, params, tools) {
  const { openaiStrong, webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || '';

  if (!nicho) {
    return { outputs: [{ tipo: 'texto', conteudo: '❓ Qual nicho deseja analisar? Me diga o nicho e tente novamente.' }] };
  }

  log('info', `[NicheSkill] Analisando nicho: ${nicho}`);

  // Busca dados de mercado
  let dadosMercado = '';
  try {
    const resultados = await webSearch.buscarTexto(`tendências mercado ${nicho} Brasil 2024 2025`, { limite: 4 });
    dadosMercado = resultados.substring(0, 1500);
  } catch (_) {}

  const prompt = `Você é um especialista em análise de mercado digital brasileiro.
Faça uma análise completa do nicho: "${nicho}"

DADOS DE MERCADO:
${dadosMercado || 'Sem dados externos disponíveis.'}

Retorne JSON:
{
  "nicho": "${nicho}",
  "viabilidade": "alta|media|baixa",
  "scoreViabilidade": 0-10,
  "tamanhoMercado": "estimativa do mercado",
  "publicoAlvo": "descrição detalhada do público",
  "doresPrincipais": ["dor 1", "dor 2", "dor 3", "dor 4"],
  "desejosPrincipais": ["desejo 1", "desejo 2", "desejo 3"],
  "concorrencia": "alta|media|baixa",
  "oportunidades": ["oportunidade 1", "oportunidade 2", "oportunidade 3"],
  "ameacas": ["ameaça 1", "ameaça 2"],
  "formatosMelhorConvertidos": ["formato 1", "formato 2"],
  "plataformasRecomendadas": ["plataforma 1", "plataforma 2"],
  "ticketMedio": "faixa de preço recomendada",
  "recomendacao": "resumo estratégico em 2-3 frases"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const analise = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    if (userId) {
      await memoryMCP.salvar('nicho', 'analise_atual', analise, userId);
    }

    const score = analise.scoreViabilidade || 7;
    const emoji = score >= 8 ? '🟢' : score >= 6 ? '🟡' : '🔴';

    const texto = [
      `🔍 *ANÁLISE DE NICHO — ${nicho.toUpperCase()}*\n`,
      `${emoji} Viabilidade: *${analise.viabilidade?.toUpperCase()}* (${score}/10)`,
      `📊 Mercado: ${analise.tamanhoMercado}`,
      `⚔️ Concorrência: ${analise.concorrencia}\n`,
      `💔 *Dores Principais:*`,
      ...(analise.doresPrincipais || []).map(d => `• ${d}`),
      `\n🎯 *Oportunidades:*`,
      ...(analise.oportunidades || []).map(o => `• ${o}`),
      `\n💰 Ticket Médio Recomendado: ${analise.ticketMedio}`,
      `\n💡 *Recomendação:* ${analise.recomendacao}`
    ].join('\n');

    return {
      nicheAnalysis: analise,
      outputs: [{ tipo: 'texto', conteudo: texto }]
    };

  } catch (err) {
    log('error', `[NicheSkill] Erro: ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro na análise de nicho: ${err.message}` }] };
  }
}

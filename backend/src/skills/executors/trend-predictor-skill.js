// skills/executors/trend-predictor-skill.js
// Skill: TrendPredictor — Prevê tendências emergentes antes de viralizar.
// Analisa sinais fracos de mercado para antecipar o que vai bombar.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function trendPredictorSkill(ctx, params, tools) {
  const { webSearch, webScraper, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const horizonte = params.horizonte || '30d'; // 7d | 30d | 90d

  log('info', `[TrendPredictor] ${nicho} | horizonte ${horizonte}`);

  // Busca sinais de tendências em múltiplas frentes
  const [sinaisUS, sinaisBR, sinaisNicho, sinaisGoogle] = await Promise.allSettled([
    webSearch(`${nicho} trending viral 2025 emerging`, { maxResultados: 5 }),
    webSearch(`${nicho} tendência viral crescendo 2025 brasil`, { maxResultados: 5 }),
    webSearch(`${nicho} novidade lançamento inovação mercado`, { maxResultados: 4, freshness: 'week' }),
    webSearch(`${nicho} google trends crescimento pesquisa`, { maxResultados: 3 })
  ]);

  const todosSinais = [
    ...(sinaisUS.value?.resultados || []),
    ...(sinaisBR.value?.resultados || []),
    ...(sinaisNicho.value?.resultados || []),
    ...(sinaisGoogle.value?.resultados || [])
  ];

  const prompt = `Você é um analista de tendências especializado em identificar o que vai viralizar ANTES dos outros.

NICHO: "${nicho}"
HORIZONTE: ${horizonte}
DATA ATUAL: ${new Date().toLocaleDateString('pt-BR')}

SINAIS COLETADOS (${todosSinais.length} fontes):
${todosSinais.slice(0, 15).map(s => `• ${s.titulo}: ${s.snippet?.substring(0, 100)}`).join('\n')}

Analise os sinais e identifique tendências emergentes. Retorne JSON:
{
  "tendencias_emergentes": [
    {
      "nome": "nome da tendência",
      "descricao": "o que é e por que está crescendo",
      "sinal_identificado": "o que nos sinais indica essa tendência",
      "estagio": "sinal_fraco|crescendo|acelerando",
      "janela_oportunidade": "quanto tempo ainda tem para aproveitar",
      "como_aproveitar": "ação concreta para este nicho",
      "conteudo_sugerido": "tipo de conteúdo para surfaressa tendência",
      "risco": "pode ser passageiro|sustentável|duvidoso"
    }
  ],
  "tendencias_morrendo": ["o que está perdendo força 1", "2"],
  "oportunidade_de_nicho": "onde há espaço vazio ainda não explorado",
  "conteudo_para_criar_agora": ["ideia urgente 1", "ideia urgente 2"],
  "palavras_chave_em_alta": ["kw emergente 1", "kw 2"],
  "previsao_proximo_mes": "o que provavelmente vai dominar o nicho nas próximas semanas",
  "score_confianca": 0-10
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const previsao = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    // Salva tendências na memória global
    await memoryMCP.salvar('tendencias', `trend_${nicho}_${Date.now()}`, {
      nicho, horizonte, previsao,
      fontes: todosSinais.length,
      geradoEm: new Date().toISOString()
    }, 'global');

    const linhas = [
      `📈 *Tendências Emergentes — ${nicho}*`,
      `_${todosSinais.length} sinais analisados | Confiança: ${previsao.score_confianca}/10_\n`,
      ...previsao.tendencias_emergentes?.map(t => {
        const icons = { sinal_fraco: '🔮', crescendo: '📈', acelerando: '🚀' };
        return `${icons[t.estagio] || '📊'} *${t.nome}* [${t.estagio}]\n${t.descricao}\n⚡ Como aproveitar: ${t.como_aproveitar}\n📅 Janela: ${t.janela_oportunidade}\n`;
      }) || [],
      `🎬 *Criar AGORA:*`,
      ...(previsao.conteudo_para_criar_agora || []).map(c => `• ${c}`),
      `\n📉 Perdendo força: ${previsao.tendencias_morrendo?.join(', ')}`,
      `\n🔮 Próximo mês: ${previsao.previsao_proximo_mes}`
    ];

    return {
      tendenciasEmergentes: previsao,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[TrendPredictor] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao prever tendências.' }] };
  }
}

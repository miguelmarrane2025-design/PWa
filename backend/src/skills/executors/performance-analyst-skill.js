// skills/executors/performance-analyst-skill.js
// Skill: PerformanceAnalyst
// Analisa dados históricos de performance para extrair padrões e recomendações.
// Compara com benchmarks de mercado e gera relatórios acionáveis.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function performanceAnalystSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const periodo = params.periodo || '30d'; // 7d | 30d | 90d | all
  const foco = params.foco || 'geral'; // content | conversion | engagement | geral

  log('info', `[PerformanceAnalyst] Analisando: ${foco} (${periodo})`);

  // ── 1. Coleta dados históricos ─────────────────────────────────────────
  const logs = await memoryMCP.recuperarCategoria('performance_logs', userId, 100);
  const entradas = Object.values(logs);

  // ── 2. Busca benchmarks de mercado ────────────────────────────────────
  let benchmarks = [];
  try {
    const nicho = ctx.sessao?.nicho || 'marketing digital';
    const resultado = await webSearch(`benchmark ${foco} ${nicho} taxa engajamento conversão 2025`, { maxResultados: 4 });
    benchmarks = resultado?.resultados?.slice(0, 3) || [];
  } catch {}

  // ── 3. Analisa com IA ──────────────────────────────────────────────────
  const analise = await _analisarPerformance(entradas, benchmarks, foco, periodo, ctx);

  // ── 4. Salva insights para uso futuro ─────────────────────────────────
  try {
    await memoryMCP.salvar('performance_insights', `insight_${Date.now()}`, {
      analise, periodo, foco,
      geradoEm: new Date().toISOString()
    }, userId);
  } catch {}

  return {
    performanceAnalise: analise,
    outputs: [{
      tipo: 'texto',
      conteudo: _formatarRelatorio(analise, foco, entradas.length)
    }]
  };
}

async function _analisarPerformance(entradas, benchmarks, foco, periodo, ctx) {
  if (entradas.length === 0) {
    return {
      erro: 'Nenhum dado de performance registrado ainda.',
      recomendacao: 'Use /log para registrar resultados de seus conteúdos.'
    };
  }

  const prompt = `Você é um analista de performance de marketing digital.

DADOS DO USUÁRIO (${entradas.length} registros):
${JSON.stringify(entradas.slice(0, 20), null, 2).substring(0, 2500)}

BENCHMARKS DE MERCADO:
${benchmarks.map(b => `• ${b.titulo}: ${b.snippet?.substring(0, 120)}`).join('\n')}

Nicho: ${ctx.sessao?.nicho || 'não definido'}
Foco: ${foco}
Período: ${periodo}

Retorne análise completa em JSON:
{
  "score_geral": 0-10,
  "tendencia": "crescendo|estavel|decrescendo",
  "pontos_fortes": ["o que está funcionando bem (3 itens)"],
  "pontos_fracos": ["o que precisa melhorar (3 itens)"],
  "metricas_destaque": { "melhor_metrica": "valor", "pior_metrica": "valor" },
  "comparacao_mercado": "como está vs benchmark",
  "padroes_identificados": ["padrão 1", "padrão 2"],
  "recomendacoes_prioritarias": [
    { "acao": "o que fazer", "impacto": "alto|medio|baixo", "prazo": "imediato|semana|mes" }
  ],
  "proximos_experimentos": ["experimento sugerido 1", "experimento 2"],
  "resumo_executivo": "análise em 2 frases"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    return JSON.parse(resposta.replace(/```json|```/g, '').trim());
  } catch (err) {
    log('error', `[PerformanceAnalyst] ${err.message}`);
    return { erro: 'Análise falhou', dados_brutos: entradas.length };
  }
}

function _formatarRelatorio(analise, foco, totalDados) {
  if (analise.erro) return `❌ ${analise.erro}\n${analise.recomendacao || ''}`;

  const tendIcons = { crescendo: '📈', estavel: '➡️', decrescendo: '📉' };
  const linhas = [
    `📊 *Análise de Performance — ${foco.toUpperCase()}*`,
    `_Baseado em ${totalDados} registros_\n`,
    `${tendIcons[analise.tendencia] || '📊'} Tendência: *${analise.tendencia}* | Score: ${analise.score_geral}/10\n`,
    `✅ *Pontos Fortes*`,
    ...(analise.pontos_fortes || []).map(p => `• ${p}`),
    '',
    `⚠️ *Para Melhorar*`,
    ...(analise.pontos_fracos || []).map(p => `• ${p}`),
    '',
    `🎯 *Recomendações Prioritárias*`,
    ...(analise.recomendacoes_prioritarias || []).slice(0, 3).map(r =>
      `• [${r.impacto?.toUpperCase()}] ${r.acao} → ${r.prazo}`
    ),
    '',
    `🧪 *Próximos Experimentos*`,
    ...(analise.proximos_experimentos || []).slice(0, 2).map(e => `• ${e}`),
    '',
    `💡 *Resumo:* ${analise.resumo_executivo}`
  ];

  return linhas.join('\n');
}

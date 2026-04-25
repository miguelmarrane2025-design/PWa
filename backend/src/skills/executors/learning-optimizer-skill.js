// skills/executors/learning-optimizer-skill.js
// Skill: LearningOptimizer — Consolida aprendizados e otimiza o sistema de memória.
// Identifica padrões emergentes e atualiza as regras de geração de conteúdo.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function learningOptimizerSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;

  log('info', `[LearningOptimizer] Otimizando memória e aprendizados`);

  // ── 1. Coleta todos os dados relevantes ────────────────────────────────
  const [copys, hooks, feedbacks, experimentos, nicheInsights] = await Promise.allSettled([
    memoryMCP.recuperarCategoria('copy_patterns', userId, 30),
    memoryMCP.recuperarCategoria('hooks_virais', 'global', 20),
    memoryMCP.recuperarCategoria('feedbacks', userId, 20),
    memoryMCP.recuperarCategoria('experiments', userId, 20),
    memoryMCP.recuperarCategoria('niche_insights', 'global', 15)
  ]);

  const dados = {
    copys: Object.values(copys.value || {}),
    hooks: Object.values(hooks.value || {}),
    feedbacks: Object.values(feedbacks.value || {}),
    experimentos: Object.values(experimentos.value || {}),
    nicheInsights: Object.values(nicheInsights.value || {})
  };

  const totalDados = Object.values(dados).reduce((sum, arr) => sum + arr.length, 0);

  if (totalDados < 5) {
    return {
      outputs: [{
        tipo: 'texto',
        conteudo: `🧠 *Learning Optimizer*\n\nAinda poucos dados (${totalDados} registros).\nContinue usando o bot para acumular aprendizados — recomendo no mínimo 10 interações.`
      }]
    };
  }

  // ── 2. Consolida aprendizados com IA ──────────────────────────────────
  const prompt = `Você é um otimizador de sistemas de aprendizado de IA para marketing digital.

Analise todos os dados abaixo e extraia as regras e padrões mais valiosos.

DADOS COLETADOS:
- Copies/Patterns: ${dados.copys.length} registros
- Hooks: ${dados.hooks.length} registros
- Feedbacks: ${dados.feedbacks.length} registros
- Experimentos: ${dados.experimentos.filter(e => e.status === 'concluido').length} concluídos
- Insights de nicho: ${dados.nicheInsights.length} registros

AMOSTRA DOS MELHORES DADOS:
${JSON.stringify([
  ...dados.copys.slice(0, 3),
  ...dados.hooks.slice(0, 3),
  ...dados.experimentos.filter(e => e.conclusao).slice(0, 3)
], null, 2).substring(0, 3000)}

Retorne JSON com os aprendizados consolidados:
{
  "regras_copy": ["regra aprendida 1", "regra 2", "regra 3"],
  "formulas_hook_eficazes": ["fórmula 1 que funciona", "fórmula 2"],
  "padroes_audiencia": ["o que a audiência responde bem", "o que rejeita"],
  "nichos_mapeados": ["nicho 1 com insights", "nicho 2"],
  "experimentos_vencedores": ["o que testes mostraram que funciona"],
  "erros_comuns_detectados": ["erro 1 a evitar", "erro 2"],
  "score_base_conhecimento": 0-10,
  "proximos_gaps": ["o que ainda falta aprender"],
  "recomendacao_proximos_passos": "o que fazer para melhorar o sistema"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const aprendizados = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    // Salva os aprendizados consolidados
    await memoryMCP.salvar('learning_consolidated', `consolidado_${Date.now()}`, {
      aprendizados,
      totalDados,
      consolidadoEm: new Date().toISOString()
    }, userId);

    // Também salva globalmente as regras mais importantes
    for (const regra of (aprendizados.regras_copy || []).slice(0, 3)) {
      await memoryMCP.salvar('copy_patterns', `regra_aprendida_${Date.now()}`, {
        tipo: 'regra_consolidada',
        conteudo: regra,
        origem: 'learning_optimizer'
      }, 'global');
    }

    const stars = '⭐'.repeat(Math.min(Math.round(aprendizados.score_base_conhecimento / 2), 5));
    const linhas = [
      `🧠 *Learning Optimizer — Consolidação*`,
      `_${totalDados} registros processados_\n`,
      `${stars} Score da Base: ${aprendizados.score_base_conhecimento}/10\n`,
      `📝 *Regras de Copy Aprendidas:*`,
      ...(aprendizados.regras_copy || []).slice(0, 3).map(r => `• ${r}`),
      `\n🎣 *Fórmulas de Hook que Funcionam:*`,
      ...(aprendizados.formulas_hook_eficazes || []).slice(0, 3).map(f => `• ${f}`),
      `\n✅ *Experimentos Confirmam:*`,
      ...(aprendizados.experimentos_vencedores || []).slice(0, 2).map(e => `• ${e}`),
      `\n⚠️ *Erros a Evitar:*`,
      ...(aprendizados.erros_comuns_detectados || []).slice(0, 2).map(e => `• ${e}`),
      `\n🎯 *Próximo Passo:* ${aprendizados.recomendacao_proximos_passos}`
    ];

    return {
      aprendizadosConsolidados: aprendizados,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[LearningOptimizer] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro na otimização.' }] };
  }
}

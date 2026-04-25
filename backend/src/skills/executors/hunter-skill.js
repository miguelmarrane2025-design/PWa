// skills/executors/hunter-skill.js
// Skill: HunterSkill — Analisa perfis de redes sociais com inteligência competitiva.
// Extrai padrões de conteúdo, retenção, hooks e estratégias vencedoras.
// Integrado ao Growth Engine para análise aprofundada e score de conteúdo.

import { log } from '../../core/logger.js';
import { growthEngine } from '../../modules/growth-engine.js';

export default async function hunterSkill(ctx, params, tools) {
  const { openaiStrong, webSearch, webScraper, memoryMCP } = tools;
  const userId = ctx.userId;
  const perfil = params.perfil || params.url || params.username || '';
  const plataforma = params.plataforma || 'instagram'; // instagram | tiktok | youtube
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const acao = params.acao || 'analisar_perfil'; // analisar_perfil | extrair_hooks | score_copy | reproduzir_padrao | classificar_formatos

  // ─── AÇÃO: Score de copy ───────────────────────────────────────────────
  if (acao === 'score_copy') {
    const conteudo = params.conteudo || ctx.sessao?.ultimoTexto || '';
    if (!conteudo) {
      return { outputs: [{ tipo: 'texto', conteudo: '📝 Envie o conteúdo que deseja pontuar.' }] };
    }
    const avaliacao = await growthEngine.scorearConteudo(conteudo, params.tipo || 'hook', plataforma, nicho, openaiStrong);
    if (userId) await memoryMCP.salvar('growth_scores', `score_${Date.now()}`, avaliacao, userId);
    return {
      growthScore: avaliacao,
      outputs: [{ tipo: 'texto', conteudo: growthEngine.formatarRelatorio(avaliacao, 'score') }]
    };
  }

  // ─── AÇÃO: Extrair hooks virais ────────────────────────────────────────
  if (acao === 'extrair_hooks') {
    const resultado = await growthEngine.extrairHooksVirais(nicho, plataforma, params.quantidade || 8, openaiStrong, webSearch);
    if (userId) await memoryMCP.salvar('hooks_virais', `hooks_${nicho}_${plataforma}`, resultado, userId);
    const linhas = [
      `🪝 *HOOKS VIRAIS — ${nicho.toUpperCase()} / ${plataforma.toUpperCase()}*\n`,
      `Padrão dominante: *${resultado.padrao_dominante || 'N/D'}*`,
      `💡 ${resultado.dica_adaptacao || ''}\n`,
      ...( resultado.hooks || []).map((h, i) =>
        `*${i + 1}.* "${h.texto}"\n   _${h.tipo} · gatilho: ${h.gatilho} · score: ${h.score_potencial}/10_`
      )
    ];
    return {
      hooksVirais: resultado,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  }

  // ─── AÇÃO: Classificar formatos ────────────────────────────────────────
  if (acao === 'classificar_formatos') {
    let historico = [];
    try { historico = Object.values(await memoryMCP.recuperarCategoria('performance_logs', userId, 50)); } catch {}
    const formatos = growthEngine.classificarFormatos(plataforma, nicho, historico);
    const linhas = [
      `📊 *FORMATOS MAIS PERFORMÁTICOS — ${plataforma.toUpperCase()}*\n`,
      ...formatos.map((f, i) =>
        `*${i + 1}.* ${f.formato} — score: ${f.score_medio.toFixed(1)}/10${f.execucoes > 0 ? ` (${f.execucoes} registros)` : ' (sem histórico)'}`
      )
    ];
    return {
      formatosClassificados: formatos,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  }

  // ─── AÇÃO: Reproduzir padrão viral ─────────────────────────────────────
  if (acao === 'reproduzir_padrao') {
    const padrao = params.padrao || {};
    const resultado = await growthEngine.reproduzirPadrao(padrao, nicho, plataforma, params.contexto, openaiStrong);
    const linhas = [
      `🔄 *REPRODUÇÃO DE PADRÃO VIRAL — ${nicho}*\n`,
      `💡 ${resultado.dica_producao || ''}`,
      `⏰ Melhor horário: ${resultado.melhor_horario || 'N/D'}\n`,
      ...(resultado.adaptacoes || []).map((a, i) => [
        `*${i + 1}. ${a.formato}* (score estimado: ${a.score_estimado}/10)`,
        `🪝 Hook: "${a.hook}"`,
        `📋 Estrutura: ${a.estrutura?.join(' → ')}`,
        `📣 CTA: ${a.cta}`,
        `_${a.por_que_vai_funcionar}_`
      ].join('\n'))
    ];
    return {
      adaptacoes: resultado,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n\n') }]
    };
  }

  // ─── AÇÃO PADRÃO: Analisar perfil (via Growth Engine) ──────────────────
  if (!perfil) {
    return {
      outputs: [{
        tipo: 'texto',
        conteudo: '❓ Informe o perfil/usuário a ser analisado. Ex: "@nomeusuario" ou URL do perfil.'
      }]
    };
  }

  log('info', `[HunterSkill] Perfil: ${perfil} | Plataforma: ${plataforma}`);

  try {
    // Try real API data first
    let dadosReais = null;
    try {
      const { analyzeProfile } = await import('../../integrations/social-apis.js');
      dadosReais = await analyzeProfile({ platform: plataforma, identifier: perfil, userId });
      log('info', `[HunterSkill] Dados reais obtidos via: ${dadosReais.sources?.join(', ')}`);
    } catch (apiErr) {
      log('warn', `[HunterSkill] Real API failed: ${apiErr.message} — using web search fallback`);
    }

    // Always run growth engine analysis (uses web search + LLM for qualitative insights)
    const analise = await growthEngine.analisarPerfil(perfil, plataforma, nicho, openaiStrong, webSearch);

    // Merge real API metrics into the analysis
    if (dadosReais && !dadosReais.error) {
      analise.metricas_reais = dadosReais.channel || dadosReais.profile || {};
      analise.socialblade    = dadosReais.socialBlade || null;
      analise.fontes_dados   = dadosReais.sources || [];
    }

    if (userId) {
      await memoryMCP.salvar('hunter', `perfil_${perfil.replace(/[^a-zA-Z0-9]/g, '_')}`, analise, userId);
    }

    return {
      hunterAnalysis: analise,
      dadosReais,
      outputs: [{ tipo: 'texto', conteudo: growthEngine.formatarRelatorio(analise, 'perfil') }]
    };

  } catch (err) {
    log('error', `[HunterSkill] Erro: ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro na análise do perfil: ${err.message}` }] };
  }
}

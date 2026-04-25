// modules/growth-engine.js
// Growth Engine — Camada de Performance (Seção 3 do sistema avançado)
// 1. Análise automática de perfis (TikTok, Instagram, YouTube)
// 2. Extração de hooks virais e padrões de conteúdo
// 3. Classificação de formatos que performam melhor
// 4. Sistema de score para copy e conteúdo
// 5. Reprodução de padrões virais adaptados ao nicho

import { log } from '../core/logger.js';
import { parseJsonSafe } from '../core/json-validator.js';

// Pesos para o sistema de score de conteúdo
const SCORE_PESOS = {
  gancho_inicial:    0.25, // primeiros 3 segundos / primeira linha
  clareza_mensagem:  0.20,
  especificidade:    0.15,
  prova_social:      0.10,
  urgencia_escassez: 0.10,
  originalidade:     0.10,
  cta_adequado:      0.10
};

// Padrões de hooks virais classificados por plataforma
const PADROES_HOOKS = {
  tiktok: [
    { tipo: 'pergunta_choque',     template: 'Você sabia que [FATO SURPREENDENTE]?' },
    { tipo: 'revelacao',           template: 'O que NINGUÉM te conta sobre [TEMA]...' },
    { tipo: 'contra_intuitivo',    template: 'Pare de [ACAO COMUM] se quiser [RESULTADO]' },
    { tipo: 'numero_especifico',   template: '[NÚMERO] formas de [RESULTADO] em [TEMPO]' },
    { tipo: 'storytelling',        template: 'Eu [SITUACAO RUIM] até descobrir isso...' },
    { tipo: 'transformacao',       template: 'De [ANTES] para [DEPOIS] em [TEMPO]' }
  ],
  instagram: [
    { tipo: 'carrossel_curiosidade', template: 'Desliza → O erro que [CONSEQUÊNCIA GRAVE]' },
    { tipo: 'lista_especifica',      template: '[NÚMERO] [TIPO] que [AUDIENCIA] precisa ver' },
    { tipo: 'salvar_depois',         template: 'Salva esse post! Você vai precisar dele...' },
    { tipo: 'polarizador',           template: 'Opinião impopular: [AFIRMAÇÃO POLÊMICA]' },
    { tipo: 'ensina_rapido',         template: '[RESULTADO] em [TEMPO] (sem [OBJECAO])' }
  ],
  youtube: [
    { tipo: 'loop_aberto',     template: 'Antes de fechar: [PROMESSA DO VÍDEO INTEIRO]' },
    { tipo: 'problema_agudo',  template: 'Você AINDA está fazendo [ERRO COMUM]?' },
    { tipo: 'autoridade',      template: 'Depois de [NUMERO] [RESULTADOS], descobri...' },
    { tipo: 'comparativo',     template: 'Testei [A] vs [B] por [TEMPO]. Resultado?' },
    { tipo: 'segredo',         template: 'O método que [GRANDES PLAYERS] não divulgam' }
  ]
};

// Formatos classificados por taxa de performance por plataforma
const FORMATOS_PERFORMANCE = {
  tiktok:    ['talking_head', 'tutorial_rapido', 'trend_remix', 'storytelling', 'pov'],
  instagram: ['carrossel_educativo', 'reels_tutorial', 'antes_depois', 'lista', 'bastidores'],
  youtube:   ['tutorial_completo', 'vlog', 'review', 'case_study', 'colaboracao']
};

class GrowthEngine {

  // ─── 1. Análise automática de perfis ──────────────────────────────────────
  async analisarPerfil(perfil, plataforma, nicho, openaiStrong, webSearch) {
    log('info', `[GrowthEngine] Analisando perfil: ${perfil} (${plataforma})`);

    let dadosPublicos = '';
    try {
      const query = `${perfil} ${plataforma} análise conteúdo viral ${nicho} 2025`;
      dadosPublicos = await webSearch.buscarTexto(query, { limite: 5 });
      dadosPublicos = dadosPublicos?.substring(0, 2000) || '';
    } catch {}

    const prompt = `Analise o perfil "${perfil}" na plataforma "${plataforma}" no nicho "${nicho}".

DADOS EXTERNOS:
${dadosPublicos || 'Dados não disponíveis — use análise baseada no nicho.'}

Retorne JSON:
{
  "perfil": "${perfil}",
  "plataforma": "${plataforma}",
  "nicho": "nicho identificado",
  "posicionamento": "como se posiciona",
  "publicoAlvo": "quem segue",
  "frequenciaPostagem": "estimativa de postagens/semana",
  "formatosDominantes": ["formato 1", "formato 2"],
  "hooksRecorrentes": ["padrão de hook 1", "padrão de hook 2", "padrão de hook 3"],
  "temasMaisVirais": ["tema 1", "tema 2", "tema 3"],
  "padroesCopy": "estrutura de copy predominante",
  "gatilhosPsicologicos": ["gatilho 1", "gatilho 2"],
  "taxaEngajamentoEstimada": "baixo|médio|alto",
  "estrategiaMonetizacao": "como monetiza",
  "lacunasMercado": ["oportunidade 1", "oportunidade 2"],
  "licoesReplicaveis": ["lição 1", "lição 2", "lição 3"],
  "scores": {
    "qualidade_conteudo": 0-10,
    "consistencia": 0-10,
    "engajamento_estimado": 0-10,
    "potencial_monetizacao": 0-10
  }
}`;

    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const analise = parseJsonSafe(resposta, {});

    log('info', `[GrowthEngine] Perfil analisado: score médio ${this._scoresMedio(analise.scores)}`);
    return analise;
  }

  // ─── 2. Extração de hooks virais ──────────────────────────────────────────
  async extrairHooksVirais(nicho, plataforma, quantidade, openaiStrong, webSearch) {
    log('info', `[GrowthEngine] Extraindo hooks virais: ${nicho} / ${plataforma}`);

    // Busca hooks recentes
    let hooksBrutos = '';
    try {
      hooksBrutos = await webSearch.buscarTexto(
        `melhores hooks virais ${plataforma} ${nicho} 2025 alta retenção`,
        { limite: 5 }
      );
      hooksBrutos = hooksBrutos?.substring(0, 1500) || '';
    } catch {}

    const padroesDaPlataforma = PADROES_HOOKS[plataforma] || PADROES_HOOKS.instagram;

    const prompt = `Você é especialista em hooks virais de ${plataforma}.
Gere ${quantidade || 10} hooks virais para o nicho "${nicho}".

PADRÕES BASE DA PLATAFORMA:
${padroesDaPlataforma.map(p => `[${p.tipo}]: ${p.template}`).join('\n')}

REFERÊNCIAS RECENTES:
${hooksBrutos || 'Sem dados externos — crie com base nos padrões da plataforma.'}

Retorne JSON:
{
  "hooks": [
    {
      "texto": "o hook completo",
      "tipo": "tipo do padrão (pergunta_choque, revelacao, etc)",
      "gatilho": "gatilho psicológico usado",
      "score_potencial": 0-10,
      "melhor_para": "tipo de conteúdo que combina"
    }
  ],
  "padrao_dominante": "padrão que mais funciona no nicho",
  "dica_adaptacao": "como adaptar ao nicho especificamente"
}`;

    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const resultado = parseJsonSafe(resposta, { hooks: [] });

    // Adiciona metadados
    resultado.plataforma = plataforma;
    resultado.nicho = nicho;
    resultado.geradoEm = new Date().toISOString();

    log('info', `[GrowthEngine] ${resultado.hooks?.length || 0} hooks extraídos`);
    return resultado;
  }

  // ─── 3. Classificação de formatos ─────────────────────────────────────────
  classificarFormatos(plataforma, nicho, historico = []) {
    const formatos = FORMATOS_PERFORMANCE[plataforma] || FORMATOS_PERFORMANCE.instagram;

    // Se há histórico, reordena por performance
    if (historico.length > 0) {
      const scoreFormato = {};
      for (const h of historico) {
        if (h.formato && typeof h.score === 'number') {
          if (!scoreFormato[h.formato]) scoreFormato[h.formato] = [];
          scoreFormato[h.formato].push(h.score);
        }
      }

      const formatosComScore = formatos.map(f => ({
        formato: f,
        score_medio: scoreFormato[f]
          ? scoreFormato[f].reduce((a, b) => a + b, 0) / scoreFormato[f].length
          : 5.0, // neutro para formatos sem histórico
        execucoes: (scoreFormato[f] || []).length
      }));

      formatosComScore.sort((a, b) => b.score_medio - a.score_medio);

      log('info', `[GrowthEngine] Formatos classificados com ${historico.length} registros de histórico`);
      return formatosComScore;
    }

    // Sem histórico, retorna ordem padrão da plataforma
    return formatos.map((f, i) => ({
      formato: f,
      score_medio: 10 - i, // ordem decrescente de performance padrão
      execucoes: 0
    }));
  }

  // ─── 4. Sistema de score para copy e conteúdo ─────────────────────────────
  async scorearConteudo(conteudo, tipo, plataforma, nicho, openaiStrong) {
    log('info', `[GrowthEngine] Scoreando ${tipo} para ${plataforma}`);

    const prompt = `Avalie este ${tipo} para ${plataforma} no nicho "${nicho}" com critérios objetivos.

CONTEÚDO: "${conteudo}"

Pontue cada critério de 0 a 10:
- gancho_inicial (${(SCORE_PESOS.gancho_inicial * 100).toFixed(0)}% do score final)
- clareza_mensagem (${(SCORE_PESOS.clareza_mensagem * 100).toFixed(0)}%)
- especificidade (${(SCORE_PESOS.especificidade * 100).toFixed(0)}%)
- prova_social (${(SCORE_PESOS.prova_social * 100).toFixed(0)}%)
- urgencia_escassez (${(SCORE_PESOS.urgencia_escassez * 100).toFixed(0)}%)
- originalidade (${(SCORE_PESOS.originalidade * 100).toFixed(0)}%)
- cta_adequado (${(SCORE_PESOS.cta_adequado * 100).toFixed(0)}%)

Retorne JSON:
{
  "criterios": {
    "gancho_inicial":    { "nota": 0-10, "motivo": "..." },
    "clareza_mensagem":  { "nota": 0-10, "motivo": "..." },
    "especificidade":    { "nota": 0-10, "motivo": "..." },
    "prova_social":      { "nota": 0-10, "motivo": "..." },
    "urgencia_escassez": { "nota": 0-10, "motivo": "..." },
    "originalidade":     { "nota": 0-10, "motivo": "..." },
    "cta_adequado":      { "nota": 0-10, "motivo": "..." }
  },
  "previsao_performance": "alta|media|baixa",
  "principal_fraqueza": "o que mais prejudica o conteúdo",
  "versao_otimizada": "versão reescrita melhorada"
}`;

    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const avaliacao = parseJsonSafe(resposta, {});

    // Calcula score ponderado
    const criterios = avaliacao.criterios || {};
    let scoreFinal = 0;
    for (const [criterio, peso] of Object.entries(SCORE_PESOS)) {
      scoreFinal += (criterios[criterio]?.nota || 5) * peso;
    }

    avaliacao.score_ponderado = parseFloat(scoreFinal.toFixed(2));
    avaliacao.tipo = tipo;
    avaliacao.plataforma = plataforma;
    avaliacao.nicho = nicho;

    log('info', `[GrowthEngine] Score: ${avaliacao.score_ponderado}/10 — ${avaliacao.previsao_performance}`);
    return avaliacao;
  }

  // ─── 5. Reprodução de padrões virais adaptados ao nicho ───────────────────
  async reproduzirPadrao(padraoReferencia, nicho, plataforma, contexto, openaiStrong) {
    log('info', `[GrowthEngine] Reproduzindo padrão para: ${nicho} / ${plataforma}`);

    const prompt = `Você é um estrategista de conteúdo viral.
Adapte o padrão abaixo para o nicho "${nicho}" na plataforma "${plataforma}".

PADRÃO DE REFERÊNCIA:
${JSON.stringify(padraoReferencia, null, 2).substring(0, 800)}

CONTEXTO ADICIONAL: ${contexto || 'nenhum'}

Retorne JSON:
{
  "adaptacoes": [
    {
      "formato": "tipo de conteúdo",
      "hook": "gancho adaptado ao nicho",
      "estrutura": ["passo 1", "passo 2", "passo 3", "passo 4"],
      "cta": "chamada para ação",
      "por_que_vai_funcionar": "análise em 1 frase",
      "score_estimado": 0-10
    }
  ],
  "dica_producao": "dica prática para criar o conteúdo",
  "melhor_horario": "horário ideal para publicar em ${plataforma}"
}`;

    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const resultado = parseJsonSafe(resposta, { adaptacoes: [] });

    log('info', `[GrowthEngine] ${resultado.adaptacoes?.length || 0} adaptações geradas`);
    return resultado;
  }

  // ─── Formata relatório de growth para o app ───────────────────────────
  formatarRelatorio(analise, tipo = 'perfil') {
    if (tipo === 'perfil') {
      const s = analise.scores || {};
      return [
        `📈 *GROWTH ENGINE — ANÁLISE DE PERFIL*`,
        `👤 ${analise.perfil} (${analise.plataforma?.toUpperCase()})`,
        `🎯 Nicho: ${analise.nicho || 'N/D'}`,
        `📊 Engajamento estimado: *${analise.taxaEngajamentoEstimada || 'N/D'}*\n`,
        `⭐ *Scores:*`,
        `• Qualidade: ${s.qualidade_conteudo || '?'}/10`,
        `• Consistência: ${s.consistencia || '?'}/10`,
        `• Engajamento: ${s.engajamento_estimado || '?'}/10`,
        `• Monetização: ${s.potencial_monetizacao || '?'}/10\n`,
        `🪝 *Hooks que Funcionam:*`,
        ...(analise.hooksRecorrentes || []).map(h => `• "${h}"`),
        `\n🏆 *Lições Replicáveis:*`,
        ...(analise.licoesReplicaveis || []).map((l, i) => `${i + 1}. ${l}`),
        analise.lacunasMercado?.length
          ? `\n🕳️ *Lacunas do Mercado:*\n${analise.lacunasMercado.map(l => `• ${l}`).join('\n')}`
          : ''
      ].filter(Boolean).join('\n');
    }

    if (tipo === 'score') {
      const perf = { alta: '🔥', media: '👍', baixa: '⚠️' };
      return [
        `🎯 *SCORE DE CONTEÚDO*`,
        `Score: *${analise.score_ponderado}/10* ${perf[analise.previsao_performance] || '📊'}`,
        `Previsão: *${analise.previsao_performance}*\n`,
        `📊 *Critérios:*`,
        ...Object.entries(analise.criterios || {}).map(([k, v]) =>
          `• ${k.replace(/_/g, ' ')}: ${v.nota}/10`
        ),
        `\n⚠️ Principal fraqueza: ${analise.principal_fraqueza}`,
        `\n✍️ *Versão Otimizada:*\n"${analise.versao_otimizada}"`
      ].filter(Boolean).join('\n');
    }

    return JSON.stringify(analise, null, 2);
  }

  // ─── Privado ──────────────────────────────────────────────────────────────
  _scoresMedio(scores) {
    if (!scores) return 'N/D';
    const vals = Object.values(scores).filter(v => typeof v === 'number');
    if (!vals.length) return 'N/D';
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }
}

export const growthEngine = new GrowthEngine();

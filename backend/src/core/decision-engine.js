// core/decision-engine.js
// Motor de decisão baseado em histórico de sucesso.
// Seleciona automaticamente skills, modelos e estratégias com base em
// execuções anteriores — implementa o loop executar → medir → aprender → melhorar.

import { log } from './logger.js';
import { parseJsonSafe } from './json-validator.js';

// Configuração de modelos disponíveis (custo vs qualidade)
const MODELOS = {
  rapido:  { id: 'gpt-4o-mini', custo: 'baixo',  qualidade: 'media',  tokens_max: 4096 },
  forte:   { id: 'gpt-4o',      custo: 'alto',   qualidade: 'alta',   tokens_max: 8192 },
  balance: { id: 'gpt-4-turbo', custo: 'medio',  qualidade: 'alta',   tokens_max: 6144 }
};

// Peso de cada fator na pontuação de histórico
const PESOS = {
  taxa_sucesso:   0.40,  // % execuções bem-sucedidas
  score_medio:    0.30,  // média de scores de output
  velocidade:     0.15,  // execuções mais rápidas preferidas
  recencia:       0.15   // execuções recentes têm mais peso
};

class DecisionEngine {

  constructor() {
    // Cache em memória: historico[userId][chave] = [{ score, duracao, ts, sucesso }]
    this._cache = new Map();
  }

  // ─── Decide qual skill usar com base em histórico ─────────────────────────
  async selecionarSkill(candidatas, domain, task, userId, memoryMCP) {
    if (!candidatas || candidatas.length === 0) return null;
    if (candidatas.length === 1) return candidatas[0];

    const historico = await this._carregarHistorico(userId, memoryMCP);

    // Pontua cada candidata
    const pontuadas = candidatas.map(skill => {
      const chave = `skill:${skill.id || skill}:${domain}:${task}`;
      const entradas = historico[chave] || [];
      const score = this._calcularScore(entradas);
      return { skill, score, entradas: entradas.length };
    });

    // Ordena por score desc
    pontuadas.sort((a, b) => b.score - a.score);

    const vencedora = pontuadas[0];
    log('info', `[DecisionEngine] Skill selecionada: ${vencedora.skill?.id || vencedora.skill} (score: ${vencedora.score.toFixed(2)}, ${vencedora.entradas} execuções)`);

    return vencedora.skill;
  }

  // ─── Decide qual modelo usar (custo vs qualidade) ─────────────────────────
  async selecionarModelo(domain, task, complexidade, userId, memoryMCP) {
    // Alta complexidade sempre usa modelo forte
    if (complexidade === 'alta') return MODELOS.forte;

    const historico = await this._carregarHistorico(userId, memoryMCP);
    const chaveRapido  = `modelo:rapido:${domain}:${task}`;
    const chaveForte   = `modelo:forte:${domain}:${task}`;

    const entradasRapido = historico[chaveRapido] || [];
    const entradasForte  = historico[chaveForte]  || [];

    const scoreRapido = this._calcularScore(entradasRapido);
    const scoreForte  = this._calcularScore(entradasForte);

    // Se modelo rápido performar bem (score >= 0.7), prefere por custo
    if (scoreRapido >= 0.70 && entradasRapido.length >= 3) {
      log('info', `[DecisionEngine] Modelo rápido selecionado por histórico (score: ${scoreRapido.toFixed(2)})`);
      return MODELOS.rapido;
    }

    // Se modelo forte claramente superior, usa forte
    if (scoreForte > scoreRapido + 0.15) {
      log('info', `[DecisionEngine] Modelo forte selecionado por histórico (score: ${scoreForte.toFixed(2)})`);
      return MODELOS.forte;
    }

    // Default: balance para domínios de conteúdo, forte para áudio
    if (domain === 'audio' || domain === 'pedal') return MODELOS.forte;
    if (domain === 'system' || domain === 'analytics') return MODELOS.rapido;
    return MODELOS.balance;
  }

  // ─── Seleciona estratégia com base em histórico de sucesso ────────────────
  async selecionarEstrategia(opcoes, contexto, userId, memoryMCP) {
    if (!opcoes || opcoes.length === 0) return null;

    const historico = await this._carregarHistorico(userId, memoryMCP);

    const pontuadas = opcoes.map(opcao => {
      const chave = `estrategia:${opcao.id}:${contexto.domain}`;
      const entradas = historico[chave] || [];
      return {
        opcao,
        score: this._calcularScore(entradas),
        tentativas: entradas.length
      };
    });

    pontuadas.sort((a, b) => b.score - a.score);

    // Com poucos dados, usa estratégia padrão
    if (pontuadas[0].tentativas < 2) {
      const padrao = opcoes.find(o => o.padrao) || opcoes[0];
      log('info', `[DecisionEngine] Estratégia padrão (dados insuficientes): ${padrao.id}`);
      return padrao;
    }

    log('info', `[DecisionEngine] Estratégia selecionada: ${pontuadas[0].opcao.id} (score: ${pontuadas[0].score.toFixed(2)})`);
    return pontuadas[0].opcao;
  }

  // ─── Registra resultado de uma execução ───────────────────────────────────
  async registrarExecucao(chave, resultado, userId, memoryMCP) {
    const entrada = {
      ts:      Date.now(),
      sucesso: resultado.sucesso !== false,
      score:   typeof resultado.score === 'number' ? resultado.score : (resultado.sucesso ? 0.8 : 0.2),
      duracao: resultado.duracao || 0,
      erro:    resultado.erro || null
    };

    // Atualiza cache local
    const cacheUser = this._cache.get(userId) || {};
    if (!cacheUser[chave]) cacheUser[chave] = [];
    cacheUser[chave].push(entrada);
    // Mantém apenas últimas 50 entradas por chave
    if (cacheUser[chave].length > 50) cacheUser[chave] = cacheUser[chave].slice(-50);
    this._cache.set(userId, cacheUser);

    // Persiste em memória
    if (memoryMCP) {
      try {
        const salvo = await memoryMCP.recuperar('decision_history', chave, userId) || [];
        const atualizado = [...(Array.isArray(salvo) ? salvo : []), entrada].slice(-50);
        await memoryMCP.salvar('decision_history', chave, atualizado, userId);
      } catch (err) {
        log('warn', `[DecisionEngine] Falha ao persistir histórico: ${err.message}`);
      }
    }

    log('info', `[DecisionEngine] Execução registrada — chave: ${chave}, score: ${entrada.score}, sucesso: ${entrada.sucesso}`);
  }

  // ─── Gera relatório de performance do motor de decisão ────────────────────
  async gerarRelatorio(userId, memoryMCP) {
    const historico = await this._carregarHistorico(userId, memoryMCP);
    const chaves = Object.keys(historico);

    if (chaves.length === 0) {
      return { total_chaves: 0, mensagem: 'Nenhum histórico registrado ainda.' };
    }

    const resumo = chaves.map(chave => {
      const entradas = historico[chave];
      return {
        chave,
        execucoes:   entradas.length,
        taxa_sucesso: parseFloat((entradas.filter(e => e.sucesso).length / entradas.length * 100).toFixed(1)),
        score_medio: parseFloat((entradas.reduce((s, e) => s + e.score, 0) / entradas.length).toFixed(3)),
        ultima:      new Date(Math.max(...entradas.map(e => e.ts))).toISOString()
      };
    });

    resumo.sort((a, b) => b.score_medio - a.score_medio);

    return {
      total_chaves:    chaves.length,
      total_execucoes: chaves.reduce((s, k) => s + historico[k].length, 0),
      top_performers:  resumo.slice(0, 5),
      precisando_melhoria: resumo.filter(r => r.score_medio < 0.5).slice(0, 3)
    };
  }

  // ─── Planeja steps com fallback inteligente ───────────────────────────────
  planejarComFallback(steps, historicoFalhas = {}) {
    return steps.map(step => {
      const taxaFalha = historicoFalhas[step.modulo] || 0;

      // Se módulo falhou > 30% das vezes, adiciona fallback
      if (taxaFalha > 0.3 && step.fallback) {
        return {
          ...step,
          _usarFallback: true,
          _motivoFallback: `Taxa de falha: ${(taxaFalha * 100).toFixed(0)}%`
        };
      }

      return step;
    });
  }

  // ─── Privado: calcula score ponderado para um conjunto de entradas ─────────
  _calcularScore(entradas) {
    if (!entradas || entradas.length === 0) return 0.5; // neutro sem dados

    const agora = Date.now();
    const umDiaMs = 86_400_000;

    let scoreTotal = 0;
    let pesoTotal  = 0;

    for (const e of entradas) {
      // Peso de recência: execuções recentes valem mais (decaimento por dia)
      const diasAtras   = (agora - e.ts) / umDiaMs;
      const pesoRecencia = Math.exp(-diasAtras / 30); // meia-vida ~30 dias

      // Score individual desta execução
      const scoreExec = (
        (e.sucesso ? 1 : 0) * PESOS.taxa_sucesso +
        (e.score || 0.5)    * PESOS.score_medio  +
        (e.duracao < 5000 ? 1 : e.duracao < 15000 ? 0.7 : 0.4) * PESOS.velocidade +
        pesoRecencia         * PESOS.recencia
      );

      scoreTotal += scoreExec * pesoRecencia;
      pesoTotal  += pesoRecencia;
    }

    return pesoTotal > 0 ? scoreTotal / pesoTotal : 0.5;
  }

  // ─── Privado: carrega histórico com cache ─────────────────────────────────
  async _carregarHistorico(userId, memoryMCP) {
    // Tenta cache local primeiro
    if (this._cache.has(userId)) return this._cache.get(userId);

    if (!memoryMCP) return {};

    try {
      const historico = await memoryMCP.recuperarCategoria('decision_history', userId, 200);
      this._cache.set(userId, historico || {});
      return historico || {};
    } catch {
      return {};
    }
  }
}

export const decisionEngine = new DecisionEngine();

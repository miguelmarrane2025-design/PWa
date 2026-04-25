// modules/workflow-orchestrator.js
// Módulo crítico: Orquestra workflows multi-skill de forma inteligente.
// Encadeia skills, gerencia dependências, trata falhas e otimiza execução paralela.
// É a camada acima do skill-manager — decide QUANDO e COMO executar cada skill.

import { skillManager } from '../skills/skill-manager.js';
import { contextManager } from './context-manager.js';
import { stateManager } from './state-manager.js';
import { log } from '../core/logger.js';
import { openaiStrong } from '../integrations/openai-advanced.js';
import { decisionEngine } from '../core/decision-engine.js';

// Definição de workflows compostos (múltiplas skills encadeadas)
const WORKFLOWS = {

  // ── Lançamento completo de infoproduto ────────────────────────────────────
  'launch_infoproduct': {
    descricao: 'Cria produto → valida → oferta → funil → copy → hooks',
    steps: [
      { skill: 'niche_researcher', params: {}, obrigatorio: true },
      { skill: 'persona_builder', params: {}, obrigatorio: true },
      { skill: 'infoproduct_builder', params: {}, obrigatorio: true },
      { skill: 'product_validator', params: {}, obrigatorio: false },
      { skill: 'offer_builder', params: {}, obrigatorio: true },
      { skill: 'copy_expert', params: { tipo: 'completa' }, obrigatorio: true },
      { skill: 'hook_hunter', params: {}, obrigatorio: false },
      { skill: 'funnel_architect', params: {}, obrigatorio: false }
    ]
  },

  // ── Estratégia de conteúdo completa ──────────────────────────────────────
  'content_strategy': {
    descricao: 'Nicho → persona → estratégia → hooks → copy → cronograma',
    steps: [
      { skill: 'niche_researcher', params: {}, obrigatorio: true },
      { skill: 'persona_builder', params: {}, obrigatorio: true },
      { skill: 'social_media_strategist', params: {}, obrigatorio: true },
      { skill: 'hook_hunter', params: {}, obrigatorio: false },
      { skill: 'angle_generator', params: {}, obrigatorio: false },
      { skill: 'content_scheduler', params: {}, obrigatorio: false }
    ]
  },

  // ── Análise de mercado + oportunidade ────────────────────────────────────
  'market_deep_dive': {
    descricao: 'Pesquisa profunda de mercado com inteligência competitiva',
    steps: [
      { skill: 'niche_researcher', params: { profundidade: 'profunda' }, obrigatorio: true },
      { skill: 'market_intel', params: {}, obrigatorio: true },
      { skill: 'trend_predictor', params: {}, obrigatorio: false },
      { skill: 'ecosystem_builder', params: {}, obrigatorio: false }
    ]
  },

  // ── Otimização de perfil social ───────────────────────────────────────────
  'social_optimization': {
    descricao: 'Analisa perfil → identifica gaps → cria plano de melhoria',
    steps: [
      { skill: 'profile_analyst', params: {}, obrigatorio: true },
      { skill: 'audience_builder', params: {}, obrigatorio: false },
      { skill: 'channel_remodeler', params: {}, obrigatorio: false },
      { skill: 'retention_optimizer', params: {}, obrigatorio: false }
    ]
  }
};

class WorkflowOrchestrator {

  // ─── Executa um workflow completo ─────────────────────────────────────────
  async executarWorkflow(workflowId, ctx, opcoes = {}) {
    const workflow = WORKFLOWS[workflowId];
    if (!workflow) {
      log('warn', `[WorkflowOrchestrator] Workflow não encontrado: ${workflowId}`);
      return null;
    }

    log('info', `[WorkflowOrchestrator] Iniciando: ${workflowId}`);
    await stateManager.definir(ctx.userId, 'workflow_ativo', workflowId);

    let ctxAtual = ctx;
    const resultados = [];
    let falhas = 0;

    // Agrupa steps: sequenciais normais ou paralelos (steps com paralelo:true no mesmo grupo)
    const grupos = this._agruparStepsParaExecucao(workflow.steps);
    log('info', `[WorkflowOrchestrator] ${grupos.length} grupos de execucao`);

    for (const grupo of grupos) {
      if (grupo.length === 1) {
        // Execucao sequencial (comportamento padrao)
        const step = grupo[0];
        try {
          log('info', `[WorkflowOrchestrator] Step sequencial: ${step.skill}`);
          await stateManager.definir(ctx.userId, 'skill_atual', step.skill);

          const params = { ...step.params, ...(opcoes.params || {}) };
          const resultado = await skillManager.executar(step.skill, ctxAtual, params);

          if (resultado) {
            ctxAtual = contextManager.mesclar(ctxAtual, resultado);
            resultados.push({ skill: step.skill, sucesso: true });
          } else if (step.obrigatorio) {
            log('warn', `[WorkflowOrchestrator] Skill obrigatoria falhou: ${step.skill}`);
            falhas++;
            if (falhas >= 2) break;
          }
        } catch (err) {
          log('error', `[WorkflowOrchestrator] Erro em ${step.skill}: ${err.message}`);
          resultados.push({ skill: step.skill, sucesso: false, erro: err.message });
          if (step.obrigatorio) falhas++;
        }
      } else {
        // Execucao paralela para steps do mesmo grupo (paralelo: true)
        log('info', `[WorkflowOrchestrator] Paralelo: ${grupo.map(s => s.skill).join(', ')}`);

        const promessas = grupo.map(step => {
          const params = { ...step.params, ...(opcoes.params || {}) };
          return skillManager.executar(step.skill, ctxAtual, params)
            .then(resultado => ({ step, resultado, sucesso: true }))
            .catch(err => ({ step, erro: err.message, sucesso: false }));
        });

        const resParalelo = await Promise.allSettled(promessas);

        for (const res of resParalelo) {
          if (res.status !== 'fulfilled') continue;
          const { step, resultado, sucesso, erro } = res.value;
          if (sucesso && resultado) {
            ctxAtual = contextManager.mesclar(ctxAtual, resultado);
            resultados.push({ skill: step.skill, sucesso: true, paralelo: true });
          } else {
            log('warn', `[WorkflowOrchestrator] Falha paralela em ${step?.skill}: ${erro}`);
            resultados.push({ skill: step?.skill, sucesso: false, erro, paralelo: true });
            if (step?.obrigatorio) falhas++;
          }
        }

        if (falhas >= 2) break;
      }
    }

    await stateManager.remover(ctx.userId, 'workflow_ativo');
    await stateManager.remover(ctx.userId, 'skill_atual');

    const resultado = {
      workflowId,
      descricao: workflow.descricao,
      ctx: ctxAtual,
      resultados,
      sucesso: falhas < 2
    };

    // ─── LOOP DE APRENDIZADO: registra resultado no motor de decisão ───────
    // "executar → medir → aprender → melhorar"
    await this._registrarAprendizado(workflowId, resultados, resultado.sucesso, ctx);

    return resultado;
  }

  // ─── Agrupa steps para execução sequencial ou paralela ──────────────────
  // Steps com { paralelo: true } e mesmo grupo são executados em paralelo.
  // Por padrão, todos os steps opcionais consecutivos após um obrigatório
  // são agrupados para execução paralela automaticamente.
  _agruparStepsParaExecucao(steps) {
    const grupos = [];
    let grupoAtual = [];

    for (const step of steps) {
      // Se o step tem paralelismo explícito marcado
      if (step.paralelo === true) {
        grupoAtual.push(step);
      } else {
        // Fecha grupo paralelo anterior se houver
        if (grupoAtual.length > 0) {
          grupos.push(grupoAtual);
          grupoAtual = [];
        }
        // Steps obrigatórios sempre sequenciais
        if (step.obrigatorio) {
          grupos.push([step]);
        } else {
          // Steps opcionais consecutivos agrupados em paralelo
          const ultimoGrupo = grupos[grupos.length - 1];
          if (ultimoGrupo && ultimoGrupo.length > 0 && !ultimoGrupo[0].obrigatorio) {
            ultimoGrupo.push(step);
          } else {
            grupos.push([step]);
          }
        }
      }
    }

    // Fecha grupo paralelo pendente
    if (grupoAtual.length > 0) grupos.push(grupoAtual);

    return grupos;
  }

  // ─── Executa skills em paralelo (quando não há dependência) ──────────────
  async executarParalelo(skillIds, ctx, params = {}) {
    log('info', `[WorkflowOrchestrator] Paralelo: ${skillIds.join(', ')}`);

    const promessas = skillIds.map(skillId =>
      skillManager.executar(skillId, ctx, params)
        .then(resultado => ({ skillId, resultado, sucesso: true }))
        .catch(err => ({ skillId, erro: err.message, sucesso: false }))
    );

    const resultados = await Promise.allSettled(promessas);

    return resultados
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
  }

  // ─── Detecta automaticamente o workflow ideal para um contexto ────────────
  async detectarWorkflowIdeal(ctx) {
    const domain = ctx.intencao?.domain;
    const task = ctx.intencao?.task;

    // Mapeamento direto de intenções para workflows
    const mapaWorkflows = {
      'content/create_product': 'launch_infoproduct',
      'content/analyze_niche': 'market_deep_dive',
      'content/create_traffic': 'content_strategy',
      'hunter/analyze_profile': 'social_optimization'
    };

    const chave = `${domain}/${task}`;
    if (mapaWorkflows[chave]) return mapaWorkflows[chave];

    // Se não há mapeamento direto, usa IA para decidir
    if (!domain) return null;

    try {
      const prompt = `Dado o contexto, qual workflow é mais adequado?
Domain: ${domain}, Task: ${task}
Texto: "${ctx.sessao?.ultimoTexto?.substring(0, 100)}"

Workflows disponíveis: ${Object.keys(WORKFLOWS).join(', ')}

Responda APENAS com o ID do workflow ou "nenhum" se for uma tarefa simples.`;

      const resposta = await openaiStrong([{ role: 'user', content: prompt }], { userId: ctx?.userId ?? null });
      const workflowId = resposta.trim().replace(/['"]/g, '');
      return WORKFLOWS[workflowId] ? workflowId : null;
    } catch {
      return null;
    }
  }

  // ─── Loop de aprendizado: registra resultado de cada skill no histórico ──
  async _registrarAprendizado(workflowId, resultados, sucessoGeral, ctx) {
    if (!ctx.userId) return;

    try {
      const memoryMCP = ctx.memoryMCP;

      // Registra resultado global do workflow
      await decisionEngine.registrarExecucao(
        `workflow:${workflowId}`,
        { sucesso: sucessoGeral, score: sucessoGeral ? 0.85 : 0.2 },
        ctx.userId,
        memoryMCP
      );

      // Registra resultado individual de cada skill
      for (const r of resultados) {
        if (!r.skill) continue;
        const domain = ctx.intencao?.domain || 'unknown';
        const task   = ctx.intencao?.task   || 'unknown';
        await decisionEngine.registrarExecucao(
          `skill:${r.skill}:${domain}:${task}`,
          { sucesso: r.sucesso, score: r.sucesso ? 0.8 : 0.1, erro: r.erro },
          ctx.userId,
          memoryMCP
        );
      }

      log('info', `[WorkflowOrchestrator] Aprendizado registrado: ${resultados.length} skills, workflow ${workflowId}`);
    } catch (err) {
      log('warn', `[WorkflowOrchestrator] Falha ao registrar aprendizado: ${err.message}`);
    }
  }

  listarWorkflows() {
    return Object.entries(WORKFLOWS).map(([id, w]) => ({
      id,
      descricao: w.descricao,
      steps: w.steps.map(s => s.skill)
    }));
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();

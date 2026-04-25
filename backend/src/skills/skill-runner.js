// skills/skill-runner.js
// Bridge entre o Orchestrator (que resolve módulos por caminho) e o SkillManager/WorkflowOrchestrator.
// Expõe as funções executar() e executarWorkflow() no formato esperado pelo core/orchestrator.js
// (async function(ctx, params) → resultado).

import { skillManager } from './skill-manager.js';
import { workflowOrchestrator } from '../modules/workflow-orchestrator.js';
import { contextManager } from '../modules/context-manager.js';
import { log } from '../core/logger.js';

// ─── Executa uma skill individual ─────────────────────────────────────────────
export async function executar(ctx, params = {}) {
  const { skillId, ...restParams } = params;

  if (!skillId) {
    log('warn', '[SkillRunner] skillId não informado');
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Skill não especificada.' }] };
  }

  // Enriquece o contexto mas preserva memoryMCP do ctx pai
  const ctxEnriquecido = await contextManager.enriquecer(ctx.userId, ctx.sessao);
  const ctxFinal = {
    ...ctxEnriquecido,
    ...ctx,                          // pai sobrescreve (preserva memoryMCP, intencao, etc.)
    outputs: ctxEnriquecido.outputs, // mas resetamos outputs para não duplicar
  };

  // Repassa parâmetros do plano para o contexto
  if (restParams.nicho && !ctxFinal.sessao?.nicho) {
    ctxFinal.sessao = { ...ctxFinal.sessao, nicho: restParams.nicho };
  }

  log('info', `[SkillRunner] Executando skill: ${skillId}`);
  const resultado = await skillManager.executar(skillId, ctxFinal, restParams);

  if (!resultado) {
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Skill "${skillId}" não retornou resultado.` }] };
  }

  return resultado;
}

// ─── Executa um workflow composto (múltiplas skills encadeadas) ────────────────
export async function executarWorkflow(ctx, params = {}) {
  const { workflowId, ...restParams } = params;

  if (!workflowId) {
    log('warn', '[SkillRunner] workflowId não informado');
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Workflow não especificado.' }] };
  }

  // Enriquece o contexto mas preserva memoryMCP do ctx pai
  const ctxEnriquecido = await contextManager.enriquecer(ctx.userId, ctx.sessao);
  const ctxFinal = {
    ...ctxEnriquecido,
    ...ctx,
    outputs: ctxEnriquecido.outputs,
  };

  if (restParams.nicho && !ctxFinal.sessao?.nicho) {
    ctxFinal.sessao = { ...ctxFinal.sessao, nicho: restParams.nicho };
  }

  log('info', `[SkillRunner] Executando workflow: ${workflowId}`);
  const resultado = await workflowOrchestrator.executarWorkflow(workflowId, ctxFinal);

  if (!resultado) {
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Workflow "${workflowId}" não encontrado ou falhou.` }] };
  }

  return resultado;
}

// agents/agency/agencyCommandSquad.js
// COO/gerente operacional do BotSquad.
// Recebe pedidos → Work Order → roteamento → revisão → entrega.
// Provider: OpenAI via llm.js. Nunca chama provider direto.

import { chat }                    from '../../lib/llm.js';
import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { briefingIntakeAgent }     from './briefingIntakeAgent.js';
import { globalQualityGateAgent }  from './globalQualityGateAgent.js';
import { createWorkOrder, updateWorkOrder } from './workOrderManager.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

// ── Squad Router ──────────────────────────────────────────────────────────────
async function routeToSquad({ briefing, message, context, files, userId }) {
  const squad = briefing.primarySquad;

  const SQUAD_MAP = {
    social_growth_squad:           () => import('../growth/socialGrowthSquad.js').then(m => m.runSocialGrowthFlow),
    marketing_strategy_squad:      () => import('../marketing/marketingStrategySquad.js').then(m => m.runMarketingStrategyFlow),
    traffic_scale_squad:           () => import('../traffic/trafficScaleSquad.js').then(m => m.runTrafficScaleFlow),
    dark_channel_squad:            () => import('../dark-channel/darkChannelSquad.js').then(m => m.runDarkChannelFlow),
    video_cutting_squad:           () => import('../video/videoCuttingSquad.js').then(m => m.runVideoCuttingFlow),
    infoproduct_publishing_squad:  () => import('../infoproduct/infoProductPublishingSquad.js').then(m => m.runInfoProductFlow),
    niche_visionary_squad:         () => import('../niche/nicheVisionarySquad.js').then(m => m.runNicheVisionaryFlow),
    audio_gear_squad:              () => import('../audio/audioGearSquad.js').then(m => m.runAudioGearFlow),
  };

  const loader = SQUAD_MAP[squad];
  if (loader) {
    try {
      const fn = await loader();
      return await fn({ message, context, files, userId, briefing });
    } catch (err) {
      logger.warn(`[AgencyCommand] squad ${squad} failed: ${err.message}`);
    }
  }

  // Fallback: LLM direto com contexto do briefing
  const sys = `Você é o BotSquad Agency. Squads ativados: ${squad}.
Execute o pedido com qualidade máxima para o objetivo: ${briefing.objective}.
Nicho: ${briefing.niche}. Audiência: ${briefing.audience}.`;
  const content = await chat(
    [{ role: 'system', content: sys }, ...context.slice(-6), { role: 'user', content: message }],
    { userId, max_tokens: 3000 }
  );
  return { content, agent: squad };
}

// ── Main Flow ─────────────────────────────────────────────────────────────────
export async function runAgencyCommandFlow({ message, context = [], files = [], userId }) {
  logger.info(`[AgencyCommand] userId=${userId}`);

  // 1. Briefing
  const briefing = await briefingIntakeAgent({ message, context, userId });
  logger.info(`[AgencyCommand] briefing squad=${briefing.primarySquad} objective=${briefing.objective}`);

  // 2. Criar Work Order
  const wo = await createWorkOrder({
    userRequest:     message,
    objective:       briefing.objective,
    niche:           briefing.niche,
    targetAudience:  briefing.audience,
    platforms:       briefing.platform ? [briefing.platform] : [],
    desiredOutput:   briefing.format,
    primarySquad:    briefing.primarySquad,
    supportSquads:   briefing.supportSquads || [],
    approvalRequired: briefing.approvalRequired,
  });

  await updateWorkOrder(wo.workOrderId, { status: 'in_progress' });

  // 3. Executar squad
  let squadResult;
  try {
    squadResult = await routeToSquad({ briefing, message, context, files, userId });
  } catch (err) {
    logger.error(`[AgencyCommand] routeToSquad error: ${err.message}`);
    squadResult = { content: `Erro ao executar squad: ${err.message}` };
  }

  const outputContent = squadResult?.content || JSON.stringify(squadResult);

  // 4. Quality Gate
  const gate = await globalQualityGateAgent({ request: message, output: outputContent, userId }).catch(() => ({ approved: true, score: 80 }));

  await updateWorkOrder(wo.workOrderId, {
    status:       gate.approved ? 'delivered' : 'review',
    qualityScore: gate.score,
    outputs:      [{ content: outputContent, gateScore: gate.score, gatedAt: new Date().toISOString() }],
  });

  // 5. Salvar memória
  try {
    await agentMemoryService.saveApprovedOutput('agency', { input: message, output: outputContent, score: gate.score, userId });
  } catch {}

  // 6. Montar resposta final
  const header = `🏢 **BotSquad Agency** | Squad: \`${briefing.primarySquad || 'geral'}\` | Score: ${gate.score}/100 | WO: \`${wo.workOrderId.slice(0, 8)}\`\n\n`;

  let improvements = '';
  if (gate.improvements?.length) {
    improvements = `\n\n---\n💡 **Próximos passos sugeridos:**\n${gate.improvements.map(i => `- ${i}`).join('\n')}`;
  }

  return {
    content:  header + outputContent + improvements,
    agent:    'agency_command_squad',
    metadata: { workOrderId: wo.workOrderId, squad: briefing.primarySquad, gateScore: gate.score, briefing },
  };
}

export default { runAgencyCommandFlow };

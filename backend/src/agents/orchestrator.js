// agents/orchestrator.js
// Brain: intent → plan → skill execution → LLM fallback.
// Supports [agent:xxx] prefix hint to force a specific agent.

import { intentEngine }         from '../core/intent-engine.js';
import { planner }              from '../core/planner.js';
import { skillManager }         from '../skills/skill-manager.js';
import { workflowOrchestrator } from '../modules/workflow-orchestrator.js';
import { contextManager }       from '../modules/context-manager.js';
import { memoryMCP }            from '../mcps/memory-mcp.js';
import { chat }                 from '../lib/llm.js';
import { logger }               from '../lib/logger.js';

// Direct agent dispatch when user forces an agent
const FORCED_AGENTS = {
  audio:   async (args) => { const { audioAgent }   = await import('./audioAgent.js');   const r = await audioAgent(args);   return { content: r.content, agent: 'audio',    metadata: { agent: 'audio',   imageUrl: r.imageUrl } }; },
  content: async (args) => { const { contentAgent } = await import('./contentAgent.js'); const r = await contentAgent(args); return { content: r.content, agent: 'content',  metadata: { agent: 'content' } }; },
  visual:  async (args) => { const { visualAgent }  = await import('./visualAgent.js');  const r = await visualAgent(args);  return { content: r.content, agent: 'visual', metadata: { agent: 'visual', ...r }, type: r.type, files: r.files, previewUrl: r.previewUrl, downloadUrl: r.downloadUrl, success: r.success } },
  video:   async (args) => { const { default: videoAgent } = await import('./videoAgent.js'); const r = await videoAgent(args); return { content: r.content, agent: 'video', metadata: { agent: 'video', ...r } }; },
  hunter:  async (args) => { const { hunterAgent }  = await import('./hunterAgent.js');  const r = await hunterAgent({ ...args, tools: args.tools || {} });  return { content: r.content, agent: 'hunter',   metadata: { agent: 'hunter',  ...r.metadata } }; },
  research:async (args) => { const { researchAgent }= await import('./researchAgent.js');const r = await researchAgent({ ...args, tools: args.tools || {} });return { content: r.content, agent: 'research', metadata: { agent: 'research', ...r.metadata } }; },
  investigator: async (args) => { const { hunterAgent } = await import('./hunterAgent.js'); const r = await hunterAgent({ ...args, tools: args.tools || {} }); return { content: r.content, agent: 'investigator', metadata: { agent: 'investigator', ...r.metadata } }; },
  product: async (args) => { const { contentAgent } = await import('./contentAgent.js'); const r = await contentAgent({ ...args, _systemOverride: 'product' }); return { content: r.content, agent: 'product', metadata: { agent: 'product' } }; },
  growth: async (args) => { const { researchAgent } = await import('./researchAgent.js'); const r = await researchAgent({ ...args, tools: args.tools || {}, _systemOverride: 'growth' }); return { content: r.content, agent: 'growth', metadata: { agent: 'growth', ...r.metadata } }; },
  risk: async (args) => { const { contentAgent } = await import('./contentAgent.js'); const r = await contentAgent({ ...args, _systemOverride: 'risk' }); return { content: r.content, agent: 'risk', metadata: { agent: 'risk' } }; },
  social: async (args) => { const { researchAgent } = await import('./researchAgent.js'); const r = await researchAgent({ ...args, tools: args.tools || {}, _systemOverride: 'social' }); return { content: r.content, agent: 'social', metadata: { agent: 'social', ...r.metadata } }; },
  automation: async (args) => { const { contentAgent } = await import('./contentAgent.js'); const r = await contentAgent({ ...args, _systemOverride: 'automation' }); return { content: r.content, agent: 'automation', metadata: { agent: 'automation' } }; },
  memory: async (args) => { const msgs = [{ role: 'system', content: 'Você é o Memory Agent do BotSquad. Gerencie memórias, contextos e histórico. Responda na língua do usuário.' }, ...(args.context || []), { role: 'user', content: args.message }]; const content = await chat(msgs, { userId: args.userId }); return { content, agent: 'memory', metadata: { agent: 'memory' } }; },
};

// Phantom module → real skill
const MODULE_TO_SKILL = {
  'workers/audio/audio-parser':        'audio_engineer',
  'workers/audio/context-loader':      'audio_engineer',
  'workers/audio/decision-engine':     'audio_engineer',
  'workers/audio/ir-pro':              'audio_engineer',
  'workers/audio/guitar-profile':      'audio_engineer',
  'workers/audio/ir-exporter':         'audio_engineer',
  'workers/audio/ir-brain':            'audio_engineer',
  'workers/audio/tone-match-engine':   'audio_engineer',
  'workers/pedaleira/pedal-detector':  'audio_engineer',
  'workers/pedaleira/pedal-parser':    'audio_engineer',
  'workers/pedaleira/preset-assistant':'audio_engineer',
  'workers/pedaleira/mix-fit-engine':  'audio_engineer',
  'workers/pedaleira/guitar-profile':  'audio_engineer',
  'squads/infoproduto/niche-analyzer': 'niche_researcher',
  'squads/infoproduto/offer-generator':'offer_builder',
  'squads/infoproduto/product-creator':'infoproduct_builder',
  'squads/infoproduto/copy-generator': 'copy_expert',
  'squads/infoproduto/format-output':  'copy_expert',
  'squads/trafego/angle-generator':    'angle_generator',
  'squads/trafego/hook-generator':     'hook_hunter',
  'squads/trafego/script-short':       'copy_expert',
  'squads/trafego/cta-generator':      'copy_expert',
  'squads/trafego/format-output':      'copy_expert',
  'squads/funil/offer-positioning':    'offer_builder',
  'squads/funil/page-copy':            'copy_expert',
  'squads/funil/order-bump-generator': 'funnel_architect',
  'squads/funil/upsell-generator':     'funnel_architect',
  'squads/funil/followup-generator':   'copy_expert',
  'workers/visual/art-director':       'visual_expert',
  'workers/visual/headline-engine':    'copy_expert',
  'integrations/image-banks':          'visual_expert',
  'renderers/html-carousel':           'visual_expert',
  'renderers/html-thumb':              'visual_expert',
  'renderers/render-worker':           'visual_expert',
  'workers/autopesquisa/search-engine':'market_intel',
  'workers/autopesquisa/auto-learner': 'market_intel',
  'workers/svg-extractor/extractor':   'visual_expert',
  'workers/hunter/profile-hunter':     'profile_analyst',
  'squads/aprendizado/feedback-parser':       'feedback_collector',
  'squads/aprendizado/performance-analyzer':  'performance_analyst',
  'squads/aprendizado/learning-engine':       'learning_optimizer',
  'workers/system/status':             'data_logger',
  'workers/system/fallback':           null,
  'workers/video/editor':              'video_editor',
  'workers/video/captions':            'video_editor',
  'workers/video/silence-remover':     'video_editor',
};

const DOMAIN_TASK_TO_SKILL = {
  'audio/refine_ir':        'audio_engineer',
  'audio/compare_ir':       'audio_engineer',
  'audio/blend_ir':         'audio_engineer',
  'audio/tone_match':       'audio_engineer',
  'audio/analyze_audio':    'audio_engineer',
  'pedal/create_preset':    'audio_engineer',
  'pedal/read_photo':       'audio_engineer',
  'pedal/configure_amp':    'audio_engineer',
  'pedal/suggest_settings': 'audio_engineer',
  'content/create_product': 'infoproduct_builder',
  'content/create_traffic': 'hook_hunter',
  'content/create_funnel':  'funnel_architect',
  'content/create_copy':    'copy_expert',
  'content/analyze_niche':  'niche_researcher',
  'content/create_script':  'copy_expert',
  'visual/create_carousel': 'carousel_generator',
  'visual/create_thumb':    'thumbnail_optimizer',
  'visual/create_creative': 'visual_expert',
  'visual/extract_svg':     'visual_expert',
  'visual/create_prompt':   'prompt_image_generator',
  'research/auto_search':   'market_intel',
  'research/auto_learn':    'learning_optimizer',
  'research/predict_trends':'trend_predictor',
  'hunter/analyze_profile': 'profile_analyst',
  'hunter/compare_profiles':'profile_analyst',
  'hunter/build_persona':   'persona_builder',
  'system/show_status':     'data_logger',
  'system/assess_risk':     'risk_guard',
  'video/edit_short':       'video_editor',
  'video/edit_long':        'video_editor',
  'video/add_captions':     'video_editor',
  'video/remove_silence':   'video_editor',
  'video/create_reels':     'video_editor',
  'product/create_product':  'infoproduct_builder',
  'product/validate_product':'product_validator',
  'product/build_offer':     'offer_builder',
  'product/build_mechanism': 'mechanism_builder',
  'product/build_funnel':    'funnel_architect',
  'product/expand_monetize': 'monetization_expander',
  'investigator/analyze_profile':  'profile_analyst',
  'investigator/compare_profiles': 'profile_analyst',
  'investigator/track_performance':'performance_analyst',
  'social/analyze_platform':  'social_media_strategist',
  'social/build_audience':    'audience_builder',
  'social/plan_content':      'content_scheduler',
  'growth/analyze_performance':'performance_analyst',
  'growth/optimize_retention': 'retention_optimizer',
  'growth/optimize_seo':       'seo_optimizer',
  'growth/remodel_channel':    'channel_remodeler',
  'content/write_script':      'script_writer',
  'content/write_email':       'email_sequence',
  'content/optimize_bio':      'bio_optimizer',
};

// ── Main entry point ──────────────────────────────────────────────────────

export async function orchestrate({ userId, message, context = [], files = [] }) {
  // Strip and resolve [agent:xxx] prefix if present
  const hintMatch = message?.match(/^\[agent:(\w+)\]\s*/);
  let cleanMessage = message;
  let forcedAgent  = null;

  if (hintMatch) {
    forcedAgent  = hintMatch[1].toLowerCase();
    cleanMessage = message.slice(hintMatch[0].length);
    logger.info(`[Orchestrator] Forced agent: ${forcedAgent}`);
  }

  const args = { userId, message: cleanMessage, context, files };

  // Auto-route: se a mensagem contém @perfil ou URL de rede social, vai direto ao researchAgent
  // Matches @handle (preceded by space/start, not part of an email) or social media URLs
  // Auto-route to videoAgent when video files are present or video keywords detected
  const VIDEO_KEYWORDS = /\b(edit(ar|a|e)?\s+(v[íi]deo|video)|cortar?\s+v[íi]deo|legenda[rs]?|remov[ea]r?\s+(sil[eê]ncio|pausa)|reels?|tiktok|shorts?\s+form|videomaker|video\s+maker)\b/i;
  const hasVideoFiles = (files ?? []).some(f => /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(f.originalname ?? ''));
  if (!forcedAgent && (hasVideoFiles || VIDEO_KEYWORDS.test(cleanMessage))) {
    try {
      const { default: videoAgent } = await import('./videoAgent.js');
      const r = await videoAgent({ userId, message: cleanMessage, context, files });
      if (r?.content) {
        logger.info('[Orchestrator] Auto-routed to videoAgent');
        return { content: r.content, agent: 'video', metadata: { agent: 'video' } };
      }
    } catch (err) {
      logger.warn(`[Orchestrator] Auto-video failed: ${err.message}`);
    }
  }

  const PROFILE_AUTO_RE = /(?:^|\s)(@[a-z0-9_.]+)|https?:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)/i;
  if (!forcedAgent && PROFILE_AUTO_RE.test(cleanMessage)) {
    try {
      const { researchAgent } = await import('./researchAgent.js');
      const r = await researchAgent({ userId, message: cleanMessage, context, tools: {} });
      if (r?.content) {
        logger.info('[Orchestrator] Auto-routed to researchAgent (profile detected)');
        return { content: r.content, agent: 'research', metadata: { agent: 'research', ...r.metadata } };
      }
    } catch (err) {
      logger.warn(`[Orchestrator] Auto-research failed: ${err.message}`);
    }
  }

  // If user forced an agent, skip intent/planner entirely
  if (forcedAgent === 'visual') {
    const result = await FORCED_AGENTS.visual(args);
    if (result?.type !== 'visual_prompts' && (result?.type !== 'visual' || !result?.previewUrl || !Array.isArray(result.files) || result.files.length === 0)) {
      logger.error('[Orchestrator] Visual forced route failed to produce files');
      return {
        content: 'Visual agent failed to generate image',
        agent: 'visual',
        type: 'visual',
        success: false,
        files: [],
        previewUrl: null,
        downloadUrl: null,
        metadata: { agent: 'visual', success: false, type: 'visual', files: [] },
      };
    }
    return result;
  }

  if (forcedAgent && FORCED_AGENTS[forcedAgent]) {
    try {
      const result = await FORCED_AGENTS[forcedAgent](args);
      if (result?.content) return result;
    } catch (err) {
      logger.warn(`[Orchestrator] Forced agent ${forcedAgent} failed: ${err.message}`);
    }
    return _llmFallback(cleanMessage, context, userId);
  }

  logger.info(`[Orchestrator] user=${userId} msg="${cleanMessage?.slice(0, 80)}"`);

  const sessao = _buildSessao(cleanMessage, context, files);
  const ctx    = await contextManager.enriquecer(userId, sessao).catch(() => ({ userId, sessao, outputs: [] }));
  ctx.memoryMCP = memoryMCP;
  ctx.userId    = userId;

  // 1. Intent
  const intencao = await intentEngine.analisar(sessao, userId).catch(err => {
    logger.warn(`[Orchestrator] IntentEngine: ${err.message}`); return null;
  });

  if (!intencao?.domain) {
    logger.info('[Orchestrator] No intent — LLM fallback');
    return _llmFallback(cleanMessage, context, userId);
  }

  logger.info(`[Orchestrator] ${intencao.domain}/${intencao.task} conf=${intencao.confianca}`);

  if (intencao.domain === 'visual') {
    const result = await FORCED_AGENTS.visual(args);
    if (result?.type !== 'visual_prompts' && (result?.type !== 'visual' || !result?.previewUrl || !Array.isArray(result.files) || result.files.length === 0)) {
      logger.error('[Orchestrator] Visual intent route failed to produce files');
      return {
        content: 'Visual agent failed to generate image',
        agent: 'visual',
        type: 'visual',
        success: false,
        files: [],
        previewUrl: null,
        downloadUrl: null,
        metadata: { agent: 'visual', success: false, type: 'visual', files: [] },
      };
    }
    return result;
  }

  await contextManager.persistir(userId, {
    nicho: intencao.nicho || sessao.nicho, task: intencao.task, domain: intencao.domain,
  }).catch(() => {});

  // 2. Plan
  const plano = await planner.montar(intencao, sessao).catch(err => {
    logger.warn(`[Orchestrator] Planner: ${err.message}`); return null;
  });

  // 3. Execute — hunter domain bypasses skill planner, goes direct to hunterAgent
  if (intencao.domain === 'hunter') {
    try {
      const { hunterAgent } = await import('./hunterAgent.js');
      const r = await hunterAgent({ userId, message: cleanMessage, context, tools: {} });
      if (r?.content) return { content: r.content, agent: 'hunter', metadata: { agent: 'hunter', ...r.metadata } };
    } catch (err) {
      logger.warn(`[Orchestrator] hunterAgent intent-route failed: ${err.message}`);
    }
  }

  if (intencao.domain === 'investigator') {
    try {
      const { hunterAgent } = await import('./hunterAgent.js');
      const r = await hunterAgent({ userId, message: cleanMessage, context, tools: {} });
      if (r?.content) return { content: r.content, agent: 'investigator', metadata: { agent: 'investigator', ...r.metadata } };
    } catch (err) {
      logger.warn(`[Orchestrator] investigator intent-route failed: ${err.message}`);
    }
  }

  if (intencao.domain === 'product') {
    try {
      const { contentAgent } = await import('./contentAgent.js');
      const r = await contentAgent({ userId, message: cleanMessage, context, _systemOverride: 'product' });
      if (r?.content) return { content: r.content, agent: 'product', metadata: { agent: 'product' } };
    } catch (err) {
      logger.warn(`[Orchestrator] product intent-route failed: ${err.message}`);
    }
  }

  if (intencao.domain === 'social' || intencao.domain === 'growth') {
    try {
      const { researchAgent } = await import('./researchAgent.js');
      const r = await researchAgent({
        userId,
        message: cleanMessage,
        context,
        tools: {},
        _systemOverride: intencao.domain,
      });
      if (r?.content) return { content: r.content, agent: intencao.domain, metadata: { agent: intencao.domain, ...r.metadata } };
    } catch (err) {
      logger.warn(`[Orchestrator] ${intencao.domain} intent-route failed: ${err.message}`);
    }
  }

  // 3. Execute
  const resultado = await _executePlano(plano, ctx, intencao);

  // 4. Extract text
  const outputs = resultado?.outputs ?? ctx.outputs ?? [];
  const content = outputs.filter(o => o.tipo === 'texto').map(o => o.conteudo).join('\n\n').trim() || null;

  if (!content) {
    logger.info('[Orchestrator] No skill output — LLM fallback');
    return _llmFallback(cleanMessage, context, userId);
  }

  return {
    content,
    agent: `${intencao.domain}/${intencao.task}`,
    metadata: { domain: intencao.domain, task: intencao.task, confianca: intencao.confianca },
  };
}

async function _executePlano(plano, ctx, intencao) {
  if (!plano) return _byDomainTask(intencao, ctx);
  if (plano.useWorkflow) { const wid = plano.steps?.[0]?.params?.workflowId; if (wid) { ctx.intencao = intencao; return workflowOrchestrator.executarWorkflow(wid, ctx); } }
  if (plano.useSkill)    { const sid = plano.steps?.[0]?.params?.skillId;    if (sid) return skillManager.executar(sid, ctx, { ...plano.steps[0].params, nicho: intencao.nicho || ctx.sessao?.nicho }); }
  for (const step of plano.steps ?? []) {
    if (step.modulo === 'skills/skill-runner') {
      if (step.acao === 'executarWorkflow') { ctx.intencao = intencao; return workflowOrchestrator.executarWorkflow(step.params.workflowId, ctx); }
      if (step.acao === 'executar') return skillManager.executar(step.params.skillId, ctx, { ...step.params, nicho: intencao.nicho || ctx.sessao?.nicho });
    }
  }
  const stepSkills = [...new Set((plano.steps ?? []).map(s => MODULE_TO_SKILL[s.modulo]).filter(Boolean))];
  if (stepSkills.length > 0) {
    logger.info(`[Orchestrator] Phantom → skills: ${stepSkills.join(', ')}`);
    return skillManager.executar(stepSkills[0], ctx, _buildSkillParams(intencao, ctx.sessao));
  }
  return _byDomainTask(intencao, ctx);
}

async function _byDomainTask(intencao, ctx) {
  if (!intencao?.domain) return null;
  const key    = `${intencao.domain}/${intencao.task}`;
  const direct = DOMAIN_TASK_TO_SKILL[key];
  if (direct) { logger.info(`[Orchestrator] Direct: ${key} → ${direct}`); return skillManager.executar(direct, ctx, _buildSkillParams(intencao, ctx.sessao)); }
  const skillId = await skillManager.selecionarMelhorSkill(intencao.domain, intencao.task, ctx).catch(() => null);
  if (skillId) return skillManager.executar(skillId, ctx, _buildSkillParams(intencao, ctx.sessao));
  return null;
}

function _buildSkillParams(intencao, sessao) {
  const T = { refine_ir: sessao?.ultimoIR ? 'processar' : 'recomendar', blend_ir: 'blend_ir', tone_match: 'processar', analyze_audio: 'analisar', create_preset: 'preset_auto', read_photo: 'recomendar' };
  return { nicho: intencao.nicho || sessao?.nicho || null, estilo: intencao.style || sessao?.estilo || null, pedaleira: intencao.pedaleira || sessao?.pedaleira || null, guitarra: intencao.guitarra || sessao?.guitarra || null, contexto: intencao.context || sessao?.contexto || null, objetivo: intencao.objetivo || sessao?.ajustesTonais || [], acao: T[intencao.task] || intencao.task || null, caminho: sessao?.ultimoIR || null, perfil: sessao?.perfilGuitarra || null, tema: intencao.resumo || null };
}

function _buildSessao(message, context, files) {
  const audioFiles = files.filter(f => /\.(wav|mp3|flac|ogg|aac|m4a)$/i.test(f.originalname ?? ''));
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.originalname ?? ''));
  const recentText = context.slice(-6).map(m => m.content).join(' ').toLowerCase();
  const kw = ws => (Array.isArray(ws) ? ws : [ws]).find(w => recentText.includes(w)) ?? null;
  const nichoMatch = recentText.match(/nicho[:\s]+([a-zA-Záàéêíóôúç\s]{3,30})/i);
  return { ultimoTexto: message, ultimoIR: audioFiles[0]?.path ?? null, ultimaFoto: imageFiles[0]?.path ?? null, ultimoAudio: audioFiles[0]?.path ?? null, nicho: nichoMatch?.[1]?.trim() ?? null, estilo: kw(['worship','gospel','ambient','rock','lead','rhythm']) ?? null, ajustesTonais: [], contexto: kw(['igreja','studio','ao vivo','live','gravação']) ?? null, produto: null, amp: null, ultimaTema: null, pedaleira: kw(['hx_stomp','helix','quad_cortex','kemper','fractal','tonemaster']) ?? null, guitarra: kw(['strato','telecaster','les paul','sg','ibanez','pacifica']) ?? null };
}

async function _llmFallback(message, context = [], userId = null) {
  const msgs = [
    { role: 'system', content: `You are BotSquad, an AI assistant with specialized skills across audio engineering (IR, CamillaDSP, worship presets), video, copywriting, hooks, visual content, carousels, image prompts, market research, social profile analysis, growth, SEO, scripts, email sequences, funnel building, infoproducts, and more. Respond helpfully in the user's language (Portuguese or English).` },
    ...context.slice(-10),
    { role: 'user', content: message },
  ];
  const content = await chat(msgs, { userId });
  return { content, agent: 'fallback' };
}

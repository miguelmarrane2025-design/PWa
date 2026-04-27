// skills/skill-manager.js
// Gerenciador central de Skills — v4 COMPLETO
// 7 skills originais + 30 skills novas = 37 skills totais
// Cada skill é um módulo especializado com capacidade de raciocinar,
// buscar na web e executar tarefas complexas.

import { log } from '../core/logger.js';
import { openaiFast, openaiStrong } from '../integrations/openai-advanced.js';
import { webSearch } from '../mcps/web-search.js';
import { webScraper } from '../mcps/web-scraper.js';
import { memoryMCP } from '../mcps/memory-mcp.js';
import { decisionEngine } from '../core/decision-engine.js';

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO COMPLETO DE SKILLS (37 skills)
// ═══════════════════════════════════════════════════════════════════════════
const SKILLS_REGISTRY = {

  // ── SKILLS ORIGINAIS (7) ─────────────────────────────────────────────────

  'copy_expert': {
    nome: 'CopyExpert',
    descricao: 'Especialista em copywriting com acesso a dados reais de mercado',
    dominios: ['content'],
    tasks: ['create_copy', 'create_traffic', 'create_funnel'],
    tools: ['web_search', 'memory'],
    executor: 'copy-skill'
  },
  'niche_researcher': {
    nome: 'NicheResearcher',
    descricao: 'Pesquisa nichos em tempo real: tendências, concorrência, oportunidades',
    dominios: ['content', 'research'],
    tasks: ['analyze_niche', 'auto_search', 'auto_learn'],
    tools: ['web_search', 'web_scraper', 'memory'],
    executor: 'niche-skill'
  },
  'hook_hunter': {
    nome: 'HookHunter',
    descricao: 'Caça hooks virais do momento em TikTok, Instagram e YouTube',
    dominios: ['content', 'research'],
    tasks: ['create_traffic', 'auto_search'],
    tools: ['web_search', 'web_scraper', 'memory'],
    executor: 'hook-skill'
  },
  'visual_expert': {
    nome: 'VisualExpert',
    descricao: 'Diretor de arte com referências visuais reais de alto desempenho',
    dominios: ['visual'],
    tasks: ['create_carousel', 'create_thumb', 'create_creative'],
    tools: ['web_search', 'memory'],
    executor: 'visual-skill'
  },
  'audio_engineer': {
    nome: 'AudioEngineer',
    descricao: 'Engenheiro de som com base de conhecimento de IR e tone shaping',
    dominios: ['audio', 'pedal'],
    tasks: ['refine_ir', 'tone_match', 'create_preset'],
    tools: ['memory', 'web_search'],
    executor: 'audio-skill'
  },
  'profile_analyst': {
    nome: 'ProfileAnalyst',
    descricao: 'Analisa perfis de redes sociais com dados reais e benchmarks de mercado',
    dominios: ['hunter'],
    tasks: ['analyze_profile', 'compare_profiles'],
    tools: ['web_search', 'web_scraper', 'memory'],
    executor: 'hunter-skill'
  },
  'market_intel': {
    nome: 'MarketIntel',
    descricao: 'Inteligência de mercado: trends, concorrentes, preços, posicionamento',
    dominios: ['research', 'content'],
    tasks: ['auto_search', 'analyze_niche'],
    tools: ['web_search', 'web_scraper', 'memory'],
    executor: 'market-skill'
  },

  // ── CORE INTELIGENTE (7) ──────────────────────────────────────────────────

  'data_logger': {
    nome: 'DataLogger',
    descricao: 'Registra e estrutura dados de performance automaticamente',
    dominios: ['system', 'analytics'],
    tasks: ['log_data', 'register_metric'],
    tools: ['memory'],
    executor: 'data-logger-skill'
  },
  'performance_analyst': {
    nome: 'PerformanceAnalyst',
    descricao: 'Analisa histórico de performance e gera insights acionáveis',
    dominios: ['system', 'analytics'],
    tasks: ['analyze_performance', 'generate_report'],
    tools: ['web_search', 'memory'],
    executor: 'performance-analyst-skill'
  },
  'feedback_collector': {
    nome: 'FeedbackCollector',
    descricao: 'Coleta, parseia e estrutura feedbacks de audiência',
    dominios: ['system', 'content'],
    tasks: ['process_feedback', 'analyze_comments'],
    tools: ['memory'],
    executor: 'feedback-collector-skill'
  },
  'experiment_manager': {
    nome: 'ExperimentManager',
    descricao: 'Cria e rastreia testes A/B e experimentos de conteúdo',
    dominios: ['system', 'analytics'],
    tasks: ['create_test', 'track_experiment'],
    tools: ['memory'],
    executor: 'experiment-manager-skill'
  },
  'creative_tester': {
    nome: 'CreativeTester',
    descricao: 'Avalia e pontua criativos antes de publicar',
    dominios: ['content', 'system'],
    tasks: ['evaluate_creative', 'score_copy'],
    tools: ['web_search', 'memory'],
    executor: 'creative-tester-skill'
  },
  'learning_optimizer': {
    nome: 'LearningOptimizer',
    descricao: 'Consolida aprendizados e otimiza o sistema de memória do bot',
    dominios: ['system'],
    tasks: ['auto_learn', 'consolidate_memory'],
    tools: ['memory'],
    executor: 'learning-optimizer-skill'
  },
  'knowledge_manager': {
    nome: 'KnowledgeManager',
    descricao: 'Gerencia a base de conhecimento: buscar, exportar, organizar',
    dominios: ['system'],
    tasks: ['manage_knowledge', 'search_memory', 'export_data'],
    tools: ['memory'],
    executor: 'knowledge-manager-skill'
  },

  // ── MONETIZAÇÃO (7) ──────────────────────────────────────────────────────

  'offer_builder': {
    nome: 'OfferBuilder',
    descricao: 'Constrói ofertas irresistíveis com stack de valor (método Hormozi)',
    dominios: ['content', 'monetization'],
    tasks: ['create_offer', 'build_stack'],
    tools: ['web_search', 'memory'],
    executor: 'offer-builder-skill'
  },
  'infoproduct_builder': {
    nome: 'InfoproductBuilder',
    descricao: 'Cria estrutura completa de infoprodutos do zero',
    dominios: ['content', 'monetization'],
    tasks: ['create_product', 'structure_course'],
    tools: ['web_search', 'memory'],
    executor: 'infoproduct-builder-skill'
  },
  'product_validator': {
    nome: 'ProductValidator',
    descricao: 'Valida viabilidade comercial de ideias antes de criar',
    dominios: ['research', 'monetization'],
    tasks: ['validate_product', 'validate_idea'],
    tools: ['web_search', 'memory'],
    executor: 'product-validator-skill'
  },
  'funnel_architect': {
    nome: 'FunnelArchitect',
    descricao: 'Projeta funis de vendas completos e otimizados',
    dominios: ['content', 'monetization'],
    tasks: ['create_funnel', 'design_funnel'],
    tools: ['web_search', 'memory'],
    executor: 'funnel-architect-skill'
  },
  'offer_optimizer': {
    nome: 'OfferOptimizer',
    descricao: 'Analisa e otimiza ofertas existentes que não estão convertendo',
    dominios: ['monetization', 'analytics'],
    tasks: ['optimize_offer', 'fix_conversion'],
    tools: ['web_search', 'memory'],
    executor: 'offer-optimizer-skill'
  },
  'mechanism_builder': {
    nome: 'MechanismBuilder',
    descricao: 'Cria o Mecanismo Único da oferta — o diferencial proprietário',
    dominios: ['content', 'monetization'],
    tasks: ['create_mechanism', 'differentiate_offer'],
    tools: ['web_search', 'memory'],
    executor: 'mechanism-builder-skill'
  },
  'monetization_expander': {
    nome: 'MonetizationExpander',
    descricao: 'Mapeia e expande formas de monetização do nicho',
    dominios: ['monetization', 'research'],
    tasks: ['expand_monetization', 'map_revenue'],
    tools: ['web_search', 'memory'],
    executor: 'monetization-expander-skill'
  },

  // ── CRESCIMENTO (7) ──────────────────────────────────────────────────────

  'social_media_strategist': {
    nome: 'SocialMediaStrategist',
    descricao: 'Cria estratégia completa de redes sociais com pilares e frequência',
    dominios: ['content', 'growth'],
    tasks: ['create_strategy', 'create_traffic'],
    tools: ['web_search', 'memory'],
    executor: 'social-media-strategist-skill'
  },
  'channel_remodeler': {
    nome: 'ChannelRemodeler',
    descricao: 'Reformula canais/perfis para maximizar crescimento',
    dominios: ['growth', 'hunter'],
    tasks: ['remodel_channel', 'optimize_profile'],
    tools: ['web_search', 'memory'],
    executor: 'channel-remodeler-skill'
  },
  'content_repurposer': {
    nome: 'ContentRepurposer',
    descricao: 'Transforma 1 conteúdo em 10+ formatos diferentes',
    dominios: ['content', 'growth'],
    tasks: ['repurpose_content', 'adapt_format'],
    tools: ['memory'],
    executor: 'content-repurposer-skill'
  },
  'content_scheduler': {
    nome: 'ContentScheduler',
    descricao: 'Cria calendário editorial estratégico e otimizado',
    dominios: ['content', 'growth'],
    tasks: ['schedule_content', 'create_calendar'],
    tools: ['memory'],
    executor: 'content-scheduler-skill'
  },
  'distribution_optimizer': {
    nome: 'DistributionOptimizer',
    descricao: 'Maximiza o alcance de cada conteúdo publicado',
    dominios: ['content', 'growth'],
    tasks: ['distribute_content', 'maximize_reach'],
    tools: ['web_search', 'memory'],
    executor: 'distribution-optimizer-skill'
  },
  'audience_builder': {
    nome: 'AudienceBuilder',
    descricao: 'Cria estratégia de construção de audiência qualificada',
    dominios: ['growth'],
    tasks: ['build_audience', 'grow_followers'],
    tools: ['web_search', 'memory'],
    executor: 'audience-builder-skill'
  },
  'trend_predictor': {
    nome: 'TrendPredictor',
    descricao: 'Prevê tendências emergentes antes de viralizar',
    dominios: ['research', 'growth'],
    tasks: ['predict_trends', 'find_opportunities'],
    tools: ['web_search', 'web_scraper', 'memory'],
    executor: 'trend-predictor-skill'
  },

  // ── PERFORMANCE DE CONTEÚDO (3) ───────────────────────────────────────────

  'thumbnail_optimizer': {
    nome: 'ThumbnailOptimizer',
    descricao: 'Analisa e cria conceitos de thumbnails de alta CTR',
    dominios: ['visual', 'content'],
    tasks: ['optimize_thumbnail', 'create_thumb'],
    tools: ['web_search', 'memory'],
    executor: 'thumbnail-optimizer-skill'
  },
  'retention_optimizer': {
    nome: 'RetentionOptimizer',
    descricao: 'Otimiza scripts de vídeo para máxima retenção',
    dominios: ['content'],
    tasks: ['optimize_retention', 'improve_script'],
    tools: ['web_search', 'memory'],
    executor: 'retention-optimizer-skill'
  },
  'seo_optimizer': {
    nome: 'SEOOptimizer',
    descricao: 'Otimiza conteúdo para busca orgânica no YouTube e Google',
    dominios: ['content', 'growth'],
    tasks: ['optimize_seo', 'keyword_research'],
    tools: ['web_search', 'memory'],
    executor: 'seo-optimizer-skill'
  },

  // ── PSICOLOGIA (2) ───────────────────────────────────────────────────────

  'persona_builder': {
    nome: 'PersonaBuilder',
    descricao: 'Constrói avatar/persona ultra-detalhada com dados reais',
    dominios: ['research', 'content'],
    tasks: ['build_persona', 'analyze_audience'],
    tools: ['web_search', 'memory'],
    executor: 'persona-builder-skill'
  },
  'angle_generator': {
    nome: 'AngleGenerator',
    descricao: 'Gera ângulos únicos de abordagem para conteúdo e copy',
    dominios: ['content', 'research'],
    tasks: ['generate_angles', 'create_copy'],
    tools: ['web_search', 'memory'],
    executor: 'angle-generator-skill'
  },

  // ── ESTRATÉGIA (2) ───────────────────────────────────────────────────────

  'strategy_planner': {
    nome: 'StrategyPlanner',
    descricao: 'Cria plano estratégico de 90 dias com marcos e ações',
    dominios: ['research', 'system'],
    tasks: ['create_strategy', 'plan_90days'],
    tools: ['web_search', 'memory'],
    executor: 'strategy-planner-skill'
  },
  'ecosystem_builder': {
    nome: 'EcosystemBuilder',
    descricao: 'Projeta o ecossistema digital completo do infoprodutor',
    dominios: ['research', 'monetization'],
    tasks: ['build_ecosystem', 'map_tools'],
    tools: ['web_search', 'memory'],
    executor: 'ecosystem-builder-skill'
  },

  // ── OPERAÇÃO (1) ─────────────────────────────────────────────────────────

  'automation_manager': {
    nome: 'AutomationManager',
    descricao: 'Mapeia e implementa automações no negócio digital',
    dominios: ['system', 'growth'],
    tasks: ['map_automations', 'create_flow'],
    tools: ['web_search', 'memory'],
    executor: 'automation-manager-skill'
  },


  // ── STATUS (1) ───────────────────────────────────────────────────────────

  'system_status': {
    nome: 'SystemStatus',
    descricao: 'Mostra o que o sistema pode fazer e o status atual',
    dominios: ['system'],
    tasks: ['show_status'],
    tools: ['memory'],
    executor: 'status-skill'
  },
  // ── SEGURANÇA (1) ────────────────────────────────────────────────────────

  'risk_guard': {
    nome: 'RiskGuard',
    descricao: 'Detecta riscos de compliance em copy, ofertas e campanhas',
    dominios: ['system', 'content'],
    tasks: ['check_risk', 'validate_compliance'],
    tools: ['memory'],
    executor: 'risk-guard-skill'
  },

  // ── v26/v27: Conteúdo, visual e squads ──────────────────────────────────

  'carousel_image_prompt_director': {
    nome: 'CarouselImagePromptDirector',
    descricao: 'Diretor de arte: gera pacote de prompts de imagem realistas para carrosséis. Não gera imagens.',
    dominios: ['visual', 'content'],
    tasks: ['create_carousel', 'create_prompt_pack', 'create_creative', 'create_prompt'],
    tools: ['memory'],
    executor: 'carousel-image-prompt-director',
    modelTier: 'mini',
    qualityTier: 'strong',
    requiresApprovalBeforeRender: true
  },

  'copy_squad': {
    nome: 'CopySquad',
    descricao: 'Squad de copy com criação, revisão e refinamento.',
    dominios: ['content', 'copy'],
    tasks: ['create_copy', 'create_hook', 'create_headline', 'create_ad'],
    tools: ['memory'],
    executor: 'copy-squad-skill',
    modelTier: 'strong'
  },

  'infoproduct_squad': {
    nome: 'InfoproductSquad',
    descricao: 'Squad de infoprodutos com estratégia, outline e revisão.',
    dominios: ['content', 'product'],
    tasks: ['create_product', 'create_ebook', 'create_course'],
    tools: ['memory'],
    executor: 'infoproduct-squad-skill',
    modelTier: 'strong'
  },

  'audio_gear_squad': {
    nome: 'AudioGearSquad',
    descricao: 'Pedaleiras, presets e compatibilidade de timbre.',
    dominios: ['audio', 'gear', 'pedal'],
    tasks: ['create_preset', 'read_pedal', 'analyze_gear', 'create_tone'],
    tools: ['memory'],
    executor: 'audio-gear-squad-skill',
    modelTier: 'strong'
  },

  'gear_vision': {
    nome: 'GearVision',
    descricao: 'Reconhece gear em imagem e aciona o fluxo de preset compatível.',
    dominios: ['audio', 'gear', 'pedal'],
    tasks: ['recognize_gear_image', 'read_pedal_image', 'analyze_pedal_settings', 'create_preset_from_image', 'recreate_tone_from_screenshot'],
    tools: ['memory'],
    executor: 'gear-vision-skill',
    modelTier: 'strong'
  },

  'thumbnail_squad': {
    nome: 'ThumbnailSquad',
    descricao: 'Thumbnails profissionais com estratégia, prompt e revisão.',
    dominios: ['visual'],
    tasks: ['create_thumb', 'optimize_thumbnail'],
    tools: ['memory'],
    executor: 'thumbnail-squad-skill',
    modelTier: 'strong'
  },

  'video_clip_director': {
    nome: 'VideoClipDirector',
    descricao: 'Direciona estratégia de cortes e melhores momentos para o pipeline de vídeo.',
    dominios: ['video'],
    tasks: ['create_clips', 'edit_short', 'edit_long', 'create_reels'],
    tools: ['memory', 'ffmpeg'],
    executor: 'video-clip-director'
  },

  'video_cutting_squad': {
    nome: 'VideoCuttingSquad',
    descricao: 'Planeja cortes, melhores momentos e coordena o pipeline principal de video.',
    dominios: ['video'],
    tasks: ['create_clips', 'find_hot_moments', 'render_shorts', 'review_clip', 'finalize_clips'],
    tools: ['memory', 'ffmpeg'],
    executor: 'video-cutting-squad-skill',
    modelTier: 'strong'
  },

  'carousel_assembler': {
    nome: 'CarouselAssembler',
    descricao: 'Finaliza o carrossel quando as imagens do prompt pack forem enviadas.',
    dominios: ['visual', 'content'],
    tasks: ['finalize_carousel'],
    tools: ['memory'],
    executor: 'carousel-assembler-skill'
  },

  'caption_style_agent': {
    nome: 'CaptionStyleAgent',
    descricao: 'Sugere/aplica estilos de legenda para cortes de vídeo.',
    dominios: ['video'],
    tasks: ['add_captions'],
    tools: ['memory'],
    executor: 'caption-style-agent'
  },

  'social_metadata_agent': {
    nome: 'SocialMetadataAgent',
    descricao: 'Gera título, descrição, hashtags e CTA por plataforma social.',
    dominios: ['video', 'content'],
    tasks: ['social_metadata', 'create_script'],
    tools: ['memory'],
    executor: 'social-metadata-agent'
  },

  'quality_review': {
    nome: 'QualityReviewAgent',
    descricao: 'Revisor geral com score 0-100 e notas de melhoria.',
    dominios: ['content', 'visual', 'video', 'audio'],
    tasks: ['review', 'quality_check'],
    tools: ['memory'],
    executor: 'quality-review-agent'
  },

  'profile_investigator': {
    nome: 'ProfileInvestigator',
    descricao: 'Investiga perfis e sinais de crescimento com foco prático.',
    dominios: ['growth', 'research', 'hunter'],
    tasks: ['analyze_profile'],
    tools: ['memory', 'web_search'],
    executor: 'profile-investigator-skill'
  },

  'content_pattern_analyst': {
    nome: 'ContentPatternAnalyst',
    descricao: 'Analisa padrões de conteúdo e retenção por nicho e plataforma.',
    dominios: ['growth', 'research'],
    tasks: ['analyze_content_patterns'],
    tools: ['memory', 'web_search'],
    executor: 'content-pattern-analyst-skill'
  },

  'hook_research': {
    nome: 'HookResearch',
    descricao: 'Pesquisa hooks fortes e ângulos de abertura por nicho e plataforma.',
    dominios: ['growth', 'content', 'research'],
    tasks: ['find_hooks'],
    tools: ['memory', 'web_search'],
    executor: 'hook-research-skill'
  },

  'competitor_gap': {
    nome: 'CompetitorGap',
    descricao: 'Mapeia gaps competitivos e oportunidades de conteúdo.',
    dominios: ['growth', 'research'],
    tasks: ['analyze_competitor'],
    tools: ['memory', 'web_search'],
    executor: 'competitor-gap-skill'
  },

  'growth_strategy': {
    nome: 'GrowthStrategy',
    descricao: 'Cria estratégia de crescimento de canal e plano de ação.',
    dominios: ['growth', 'research'],
    tasks: ['create_strategy'],
    tools: ['memory', 'web_search'],
    executor: 'growth-strategy-skill'
  },

  'channel_niche_research_squad': {
    nome: 'ChannelNicheResearchSquad',
    descricao: 'Pesquisa nichos especificos para canais, plataformas, formatos e monetizacao.',
    dominios: ['channel', 'growth', 'niche', 'research'],
    tasks: ['find_niches', 'research_niche', 'analyze_niche', 'dark_niche_research', 'platform_fit', 'monetization_paths', 'competitor_map', 'find_channel_niches', 'channel_opportunities'],
    tools: ['memory', 'web_search'],
    executor: 'channel-niche-research-squad-skill',
    modelTier: 'strong'
  },

  'creative_review_squad': {
    nome: 'CreativeReviewSquad',
    descricao: 'Faz review de criativos e packs visuais antes de publicar.',
    dominios: ['content', 'visual', 'review'],
    tasks: ['review_creative', 'creative_review'],
    tools: ['memory'],
    executor: 'creative-review-squad-skill',
    modelTier: 'strong'
  },

  'dark_channel_squad': {
    nome: 'DarkChannelSquad',
    descricao: 'Cria canais dark com posicionamento, formatos e plano de execucao.',
    dominios: ['content', 'growth', 'channel'],
    tasks: ['create_dark_channel', 'launch_dark_channel'],
    tools: ['memory', 'web_search'],
    executor: 'dark-channel-squad-skill',
    modelTier: 'strong'
  },

  'marketing_strategy_squad': {
    nome: 'MarketingStrategySquad',
    descricao: 'Estrategia de marketing, campanhas e posicionamento.',
    dominios: ['marketing', 'growth'],
    tasks: ['create_marketing_strategy'],
    tools: ['memory', 'web_search'],
    executor: 'marketing-strategy-squad-skill',
    modelTier: 'strong'
  },

  'traffic_scale_squad': {
    nome: 'TrafficScaleSquad',
    descricao: 'Planeja escala de trafego e criativos de performance.',
    dominios: ['traffic', 'growth', 'marketing'],
    tasks: ['scale_traffic'],
    tools: ['memory', 'web_search'],
    executor: 'traffic-scale-squad-skill',
    modelTier: 'strong'
  },

  'niche_visionary_squad': {
    nome: 'NicheVisionarySquad',
    descricao: 'Explora oportunidades amplas de mercado, blue ocean e produto.',
    dominios: ['niche', 'research'],
    tasks: ['visionary_niche_research'],
    tools: ['memory', 'web_search'],
    executor: 'niche-visionary-squad-skill',
    modelTier: 'strong'
  },

  'infoproduct_publishing_squad': {
    nome: 'InfoproductPublishingSquad',
    descricao: 'Cria e publica ebook, curso e ativos de infoproduto.',
    dominios: ['content', 'product', 'monetization'],
    tasks: ['create_ebook', 'create_infoproduct', 'publish_infoproduct'],
    tools: ['memory', 'web_search'],
    executor: 'infoproduct-publishing-squad-skill',
    modelTier: 'strong'
  },

  'bio_optimizer': {
    nome: 'BioOptimizer',
    descricao: 'Otimiza bios de Instagram, YouTube, LinkedIn e outras plataformas',
    dominios: ['content', 'growth', 'hunter'],
    tasks: ['optimize_bio', 'optimize_profile', 'analyze_profile'],
    tools: ['memory'],
    executor: 'bio-optimizer-skill'
  },
  'carousel_generator': {
    nome: 'CarouselGenerator',
    descricao: 'Gera carrosséis completos com copy, estrutura visual e prompts de imagem',
    dominios: ['visual', 'content'],
    tasks: ['create_carousel', 'create_creative'],
    tools: ['memory'],
    executor: 'carousel-generator'
  },
  'email_sequence': {
    nome: 'EmailSequence',
    descricao: 'Cria sequências de email para lançamento, nutrição e vendas',
    dominios: ['content', 'monetization'],
    tasks: ['create_copy', 'create_funnel', 'email_sequence'],
    tools: ['memory'],
    executor: 'email-sequence-skill'
  },
  'prompt_image_generator': {
    nome: 'PromptImageGenerator',
    descricao: 'Cria prompts detalhados para imagens em ChatGPT, Midjourney ou DALL-E',
    dominios: ['visual', 'content'],
    tasks: ['create_creative', 'create_thumb', 'create_carousel'],
    tools: ['memory'],
    executor: 'prompt-image-generator'
  },
  'script_writer': {
    nome: 'ScriptWriter',
    descricao: 'Cria roteiros completos para shorts, reels, anúncios e vídeos longos',
    dominios: ['content', 'video'],
    tasks: ['create_script', 'edit_short', 'create_reels'],
    tools: ['memory'],
    executor: 'script-writer-skill'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
class SkillManager {
  constructor() {
    this.skills = new Map();
    this._carregarSkills();
  }

  _carregarSkills() {
    for (const [id, config] of Object.entries(SKILLS_REGISTRY)) {
      this.skills.set(id, config);
    }
    log('info', `SkillManager: ${this.skills.size} skills carregadas`);
  }

  // Retorna skills relevantes para um domain/task
  getSkillsParaDominio(domain, task) {
    const relevantes = [];
    for (const [id, skill] of this.skills) {
      if (skill.dominios.includes(domain) || skill.tasks.includes(task)) {
        relevantes.push({ id, ...skill });
      }
    }
    return relevantes;
  }

  // Executa uma skill com contexto completo
  async executar(skillId, ctx, params = {}) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      log('warn', `Skill não encontrada: ${skillId}`);
      return null;
    }

    log('info', `Executando skill: ${skill.nome}`);

    try {
      const { default: executor } = await import(`./executors/${skill.executor}.js`);

      // Create a callable webSearch wrapper that normalizes call patterns:
      // skills call webSearch(query, {maxResultados}) OR webSearch.buscarTexto(query, {limite})
      const webSearchFn = async (query, opts = {}) => {
        const limite = opts.maxResultados || opts.limite || 5;
        const arr = await webSearch.buscar(query, { limite });
        // Normalize: skills expect {resultados:[]} OR plain array - support both
        return { resultados: arr, total: arr.length };
      };
      webSearchFn.buscar        = (q, o) => webSearch.buscar(q, o);
      webSearchFn.buscarTexto   = (q, o) => webSearch.buscarTexto(q, o);
      webSearchFn.buscarMultiplo = (qs, o) => webSearch.buscarMultiplo(qs, o);

      // Bind openaiStrong to ctx.userId so skills use the user's own API key
      const userId = ctx?.userId || null;
      const openaiStrongUser = (messages, opts = {}) => openaiStrong(messages, { ...opts, userId });
      const openaiFastUser = (messages, opts = {}) => openaiFast(messages, { ...opts, userId });

      const resultado = await executor(ctx, params, {
        webSearch:  webSearchFn,
        webScraper,
        memoryMCP,
        openaiStrong: openaiStrongUser,
        openaiFast: openaiFastUser,
        log
      });

      return resultado;
    } catch (err) {
      log('error', `Skill ${skillId} falhou: ${err.message}`);
      return null;
    }
  }

  // Seleciona a melhor skill baseada em histórico de sucesso (Decision Engine)
  async selecionarMelhorSkill(domain, task, ctx) {
    const candidatas = this.getSkillsParaDominio(domain, task);
    if (candidatas.length === 0) return null;
    if (candidatas.length === 1) return candidatas[0].id;

    const userId = ctx?.userId;

    // ── Decisão baseada em histórico de sucesso ───────────────────────────
    if (userId) {
      try {
        const melhor = await decisionEngine.selecionarSkill(
          candidatas, domain, task, userId, memoryMCP
        );
        if (melhor?.id) return melhor.id;
      } catch (err) {
        log('warn', `[SkillManager] DecisionEngine falhou, usando IA: ${err.message}`);
      }
    }

    // ── Fallback: IA escolhe por contexto ─────────────────────────────────
    const prompt = `Dado o contexto do usuário, qual skill é mais adequada?
Domain: ${domain}
Task: ${task}
Sessão: ${JSON.stringify({ nicho: ctx.sessao?.nicho, estilo: ctx.sessao?.estilo, ultimoTexto: ctx.sessao?.ultimoTexto?.substring(0, 100) }, null, 2)}
Skills disponíveis:
${candidatas.map(s => `- ${s.id}: ${s.descricao}`).join('\n')}
Responda APENAS com o ID da skill mais adequada.`;

    try {
      const resposta = await openaiStrong([{ role: 'user', content: prompt }], { userId });
      const skillId = resposta.trim().replace(/['"]/g, '');
      return candidatas.find(s => s.id === skillId)?.id || candidatas[0].id;
    } catch {
      return candidatas[0].id;
    }
  }

  // Executa múltiplas skills em paralelo
  async executarParalelo(skillIds, ctx, params = {}) {
    const promessas = skillIds.map(id =>
      this.executar(id, ctx, params)
        .then(r => ({ skillId: id, resultado: r, sucesso: true }))
        .catch(err => ({ skillId: id, erro: err.message, sucesso: false }))
    );
    return Promise.allSettled(promessas).then(rs =>
      rs.filter(r => r.status === 'fulfilled').map(r => r.value)
    );
  }

  listarSkills(filtro = {}) {
    return Array.from(this.skills.entries())
      .filter(([, s]) => {
        if (filtro.dominio && !s.dominios.includes(filtro.dominio)) return false;
        return true;
      })
      .map(([id, s]) => ({
        id,
        nome: s.nome,
        name: s.nome,
        descricao: s.descricao,
        description: s.descricao,
        dominios: s.dominios,
        domain: s.dominios?.[0] || null,
        tasks: s.tasks,
        tools: s.tools,
        executor: s.executor,
        modelTier: s.modelTier || null,
        qualityTier: s.qualityTier || null,
        requiresApprovalBeforeRender: !!s.requiresApprovalBeforeRender,
        inputSchema: s.inputSchema || {},
        outputSchema: s.outputSchema || {},
        source: 'skill-manager',
      }));
  }

  stats() {
    const porDominio = {};
    for (const [, skill] of this.skills) {
      for (const d of skill.dominios) {
        porDominio[d] = (porDominio[d] || 0) + 1;
      }
    }
    return {
      total: this.skills.size,
      por_dominio: porDominio
    };
  }
}

export const skillManager = new SkillManager();

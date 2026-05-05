// skills/skill-manager.js
// Gerenciador central de Skills — v4 COMPLETO
// 7 skills originais + 30 skills novas = 37 skills totais
// Cada skill é um módulo especializado com capacidade de raciocinar,
// buscar na web e executar tarefas complexas.

import { log } from '../core/logger.js';
import { openaiStrong } from '../integrations/openai-advanced.js';
import { webSearch } from '../mcps/web-search.js';
import { webScraper } from '../mcps/web-scraper.js';
import { memoryMCP } from '../mcps/memory-mcp.js';
import { decisionEngine } from '../core/decision-engine.js';
import { modelRouter } from '../ai/modelRouter.js';

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

  // ── NOVOS AGENTES E SKILLS ───────────────────────────────────────────────

  // v27: ImagePromptDirector — gera prompts antes de qualquer imagem
  'carousel_image_prompt_director': {
    nome: 'CarouselImagePromptDirector',
    descricao: 'Diretor de arte: gera pacote de prompts de imagem realistas para carrosséis. NÃO gera imagens — entrega prompts para uso externo.',
    dominios: ['visual', 'content'],
    tasks: ['create_carousel', 'create_prompt_pack', 'create_creative', 'create_prompt'],
    tools: ['memory'],
    executor: 'carousel-image-prompt-director',
    modelTier: 'mini',
    qualityTier: 'strong',
    requiresApprovalBeforeRender: true,
  },

  // ── v27: NOVOS SQUADS REAIS ──────────────────────────────────────────────

  'copy_squad': {
    nome: 'CopySquad',
    descricao: 'Squad completo de copy: CopyChief + Copywriter + CopyReview + CopyRefiner. Score mínimo 85.',
    dominios: ['content', 'copy'],
    tasks: ['create_copy', 'create_hook', 'create_headline', 'create_ad'],
    tools: ['memory'],
    executor: 'copy-squad-skill',
    modelTier: 'strong',
  },

  'infoproduct_squad': {
    nome: 'InfoproductSquad',
    descricao: 'Squad de infoprodutos: Estrategista + Outline + Review. Score mínimo 85.',
    dominios: ['content'],
    tasks: ['create_product', 'create_ebook', 'create_course'],
    tools: ['memory'],
    executor: 'infoproduct-squad-skill',
    modelTier: 'strong',
  },

  'audio_gear_squad': {
    nome: 'AudioGearSquad',
    descricao: 'Pedaleiras e presets: GearRecognition + PresetDesigner + DeviceCompat + ToneReview.',
    dominios: ['audio', 'gear'],
    tasks: ['create_preset', 'read_pedal', 'analyze_gear', 'create_tone', 'create_ir', 'review_tone', 'compare_ir', 'tone_match', 'analyze_audio', 'analyze_guitar', 'process_ir', 'worship_tone', 'gear_preset', 'mix_ready', 'analyze_pedalboard'],
    tools: ['memory'],
    executor: 'audio-gear-squad-skill',
    modelTier: 'strong',
  },

  'thumbnail_squad': {
    nome: 'ThumbnailSquad',
    descricao: 'Thumbnails profissionais: Strategist + PromptDirector + Review. Score mínimo 85.',
    dominios: ['visual'],
    tasks: ['create_thumb', 'optimize_thumbnail'],
    tools: ['memory'],
    executor: 'thumbnail-squad-skill',
    modelTier: 'strong',
  },

  'carousel_generator': {
    nome: 'CarouselGenerator',
    descricao: 'Gera carrosséis completos com copy slide por slide e prompts de imagem',
    dominios: ['visual', 'content'],
    tasks: ['create_carousel', 'create_creative'],
    tools: ['memory'],
    executor: 'carousel-generator'
  },
  'prompt_image_generator': {
    nome: 'PromptImageGenerator',
    descricao: 'Gera prompts detalhados de imagem para ChatGPT, Midjourney ou DALL-E',
    dominios: ['visual'],
    tasks: ['create_creative', 'create_thumb'],
    tools: ['memory'],
    executor: 'prompt-image-generator'
  },
  'script_writer': {
    nome: 'ScriptWriter',
    descricao: 'Roteirista especializado em Shorts, Reels, TikTok e YouTube com timecodes',
    dominios: ['content', 'video'],
    tasks: ['create_copy', 'create_traffic'],
    tools: ['memory', 'web_search'],
    executor: 'script-writer-skill'
  },
  'email_sequence': {
    nome: 'EmailSequence',
    descricao: 'Cria sequências de email para lançamento, nurturing e reengajamento',
    dominios: ['content', 'product'],
    tasks: ['create_copy', 'create_funnel'],
    tools: ['memory'],
    executor: 'email-sequence-skill'
  },
  'bio_optimizer': {
    nome: 'BioOptimizer',
    descricao: 'Otimiza bios de perfis sociais para conversão, autoridade e descoberta',
    dominios: ['content', 'research'],
    tasks: ['create_copy', 'analyze_profile'],
    tools: ['memory'],
    executor: 'bio-optimizer-skill'
  },
  // ── v27: Skills de vídeo pipeline ────────────────────────────────────────
  'video_clip_director': {
    nome: 'VideoClipDirector',
    descricao: 'Direciona estratégia de cortes, avalia momentos e gera clips virais via pipeline FFmpeg',
    dominios: ['video'],
    tasks: ['create_clips', 'edit_short', 'edit_long', 'create_reels'],
    tools: ['memory', 'ffmpeg'],
    executor: 'video-clip-director'
  },
  'caption_style_agent': {
    nome: 'CaptionStyleAgent',
    descricao: 'Aplica estilos de legenda nos cortes de vídeo (classic, fire, neon, gospel, contrast)',
    dominios: ['video'],
    tasks: ['add_captions'],
    tools: ['memory'],
    executor: 'caption-style-agent'
  },
  'social_metadata_agent': {
    nome: 'SocialMetadataAgent',
    descricao: 'Gera título, descrição, hashtags e CTA otimizados para cada plataforma social',
    dominios: ['video', 'content'],
    tasks: ['social_metadata', 'create_script'],
    tools: ['memory'],
    executor: 'social-metadata-agent'
  },
  'quality_review': {
    nome: 'QualityReviewAgent',
    descricao: 'Revisor geral — avalia qualquer output e retorna score 0-100 com notas de melhoria',
    dominios: ['content', 'visual', 'video', 'audio'],
    tasks: ['review', 'quality_check'],
    tools: ['memory'],
    executor: 'quality-review-agent'
  },

  // ── AGENCY OS — SQUADS E REVIEWERS (v28) ─────────────────────────────────

  'agency_command_squad': {
    nome: 'AgencyCommandSquad',
    descricao: 'COO operacional: briefing → Work Order → roteamento de squads → quality gate → entrega',
    dominios: ['agency'],
    tasks: ['create_work_order', 'route_task', 'status', 'final_review', 'delivery_report'],
    tools: ['memory'],
    executor: 'agency-command-squad-skill'
  },

  'social_growth_squad': {
    nome: 'SocialGrowthSquad',
    descricao: 'Crescimento orgânico YouTube/TikTok/Instagram: estratégia, calendário, hooks, experimentos',
    dominios: ['growth', 'social'],
    tasks: ['analyze_profile', 'find_ideas', 'create_calendar', 'analyze_metrics', 'plan_experiment', 'create_strategy'],
    tools: ['web_search', 'memory'],
    executor: 'social-growth-squad-skill'
  },

  'marketing_strategy_squad': {
    nome: 'MarketingStrategySquad',
    descricao: 'Oferta, posicionamento, funil, copy e monetização',
    dominios: ['marketing', 'content'],
    tasks: ['create_strategy', 'create_offer', 'create_funnel', 'create_campaign', 'create_sales_copy'],
    tools: ['web_search', 'memory'],
    executor: 'marketing-strategy-squad-skill'
  },

  'traffic_scale_squad': {
    nome: 'TrafficScaleSquad',
    descricao: 'Escala com tráfego orgânico e pago: campanha, criativos, orçamento, métricas',
    dominios: ['traffic'],
    tasks: ['create_plan', 'paid_plan', 'organic_scale', 'analyze_campaign', 'create_creative_tests'],
    tools: ['web_search', 'memory'],
    executor: 'traffic-scale-squad-skill'
  },

  'dark_channel_squad': {
    nome: 'DarkChannelSquad',
    descricao: 'Criação e crescimento de canais dark/faceless: nicho, estratégia, roteiro, visual, metadata',
    dominios: ['dark'],
    tasks: ['create_channel_strategy', 'find_niche', 'create_ideas', 'create_script', 'create_video_package', 'review_content'],
    tools: ['web_search', 'memory'],
    executor: 'dark-channel-squad-skill'
  },

  'video_cutting_squad': {
    nome: 'VideoCuttingSquad',
    descricao: 'Cortes de vídeo estilo OpusClip: melhores momentos, shorts verticais, legendas, downloads',
    dominios: ['video'],
    tasks: ['create_clips', 'find_hot_moments', 'render_shorts', 'review_clip', 'finalize_clips'],
    tools: ['memory'],
    executor: 'video-cutting-squad-skill'
  },

  'niche_visionary_squad': {
    nome: 'NicheVisionarySquad',
    descricao: 'Nichos, subnichos, blue ocean, oportunidades de produto digital e canal dark',
    dominios: ['niche'],
    tasks: ['find_opportunity', 'analyze', 'blue_ocean', 'product_opportunities', 'dark_channel_opportunities'],
    tools: ['web_search', 'memory'],
    executor: 'niche-visionary-squad-skill'
  },

  'infoproduct_publishing_squad': {
    nome: 'InfoProductPublishingSquad',
    descricao: 'Ebooks, cursos, workbooks, guias práticos, livros digitais completos (score mínimo 85)',
    dominios: ['infoproduct', 'content'],
    tasks: ['create', 'create_ebook', 'create_book', 'create_course', 'create_workbook'],
    tools: ['memory'],
    executor: 'infoproduct-publishing-squad-skill'
  },

  'creative_review_squad': {
    nome: 'CreativeReviewSquad',
    descricao: 'Revisão criativa de vídeos, imagens, thumbnails, carrosséis e consistência visual',
    dominios: ['visual', 'video', 'creative'],
    tasks: ['review_image', 'review_thumbnail', 'review_carousel', 'review_clip', 'review_final', 'review_consistency'],
    tools: ['memory'],
    executor: 'creative-review-squad-skill'
  },

  // ── CHANNEL NICHE RESEARCH SQUAD (v28-final3 complemento) ─────────────────

  'channel_niche_research_squad': {
    nome: 'ChannelNicheResearchSquad',
    descricao: 'Pesquisa nichos, subnichos e oportunidades para canais no YouTube, TikTok, Instagram/Reels, Kwai e dark/faceless. Avalia demanda, saturação, retenção, monetização, dificuldade de produção e potencial recorrente. NÃO substitui o Niche Visionary Squad: foca em canal/plataforma/formato, não em produto/mercado.',
    dominios: ['channel_growth', 'growth', 'dark'],
    tasks: [
      'find_niches', 'research_niche', 'analyze_niche', 'dark_niche_research',
      'platform_fit', 'monetization_paths', 'competitor_map', 'create_strategy_seed',
      'find_channel_niches', 'channel_opportunities',
    ],
    tools: ['web_search', 'memory'],
    executor: 'channel-niche-research-squad-skill',
  },

  // ── SPORTS INTELLIGENCE (v28 sports) ────────────────────────────────────────

  'sports_intelligence_squad': {
    nome: 'SportsIntelligenceSquad',
    descricao: 'Análise esportiva probabilística para uso pessoal: probabilidade 1x2, trajetória, histórico, casa/fora, risco, viabilidade e aprendizado. Dados reais de APIs, cache e fallback manual. Não promete resultados.',
    dominios: ['sports', 'football'],
    tasks: ['analyze_match', 'predict_match', 'analyze_round', 'analyze_today', 'analyze_team', 'analyze_league', 'results_learning', 'team_trajectory', 'historical_results', 'match_viability'],
    tools: ['memory'],
    executor: 'sports-intelligence-squad-skill',
  },

  // ── SQUADS FINAIS (v28 empresa) ──────────────────────────────────────────────

  'deep_research_squad': {
    nome: 'DeepResearchSquad',
    descricao: 'Pesquisa profunda com dossiês, fontes, síntese, mapas de conhecimento e próximos passos acionáveis.',
    dominios: ['research', 'content'],
    tasks: ['deep_research', 'create_dossie', 'knowledge_map', 'market_research', 'synthesize'],
    tools: ['web_search', 'memory'],
    executor: 'deep-research-squad-skill',
  },

  'social_hunters_squad': {
    nome: 'SocialHuntersSquad',
    descricao: 'Caça padrões vencedores em TikTok, Instagram, YouTube, Shorts e Reels: hooks, formatos, temas, gaps e viral intelligence.',
    dominios: ['hunter', 'research', 'growth'],
    tasks: ['hunt_patterns', 'analyze_viral', 'find_hooks', 'map_competitors', 'find_gaps', 'social_research'],
    tools: ['web_search', 'memory'],
    executor: 'social-hunters-squad-skill',
  },

  'authority_channel_squad': {
    nome: 'AuthorityChannelSquad',
    descricao: 'Cria canais de autoridade e marca pessoal: posicionamento, diferencial, pilares, credibilidade, funil e monetização.',
    dominios: ['growth', 'channel', 'marketing'],
    tasks: ['create_strategy', 'build_authority', 'personal_brand', 'create_positioning', 'create_content_plan'],
    tools: ['memory'],
    executor: 'authority-channel-squad-skill',
  },

  'kdp_localization_squad': {
    nome: 'KDPLocalizationSquad',
    descricao: 'Localiza livros para KDP internacional: título, descrição HTML, keywords de backend, categorias, preço, compliance e brief de capa.',
    dominios: ['infoproduct', 'content'],
    tasks: ['localize_book', 'translate_metadata', 'optimize_kdp', 'create_kdp_package', 'check_kdp_compliance'],
    tools: ['memory'],
    executor: 'kdp-localization-squad-skill',
  },

  // ── NOVOS SQUADS (v28 master) ────────────────────────────────────────────────

  'video_scriptwriting_squad': {
    nome: 'VideoScriptwritingSquad',
    descricao: 'Cria roteiros profissionais: curto (Shorts/TikTok/Reels), longo (YouTube), dark (faceless), narração, VSL, anúncio, storytelling, educativo. Reviewer: scriptQualityReviewAgent.',
    dominios: ['script', 'content', 'dark', 'video', 'marketing', 'channel'],
    tasks: ['create','create_short','create_long','create_dark','create_vsl','create_ad','create_reels_script','create_tiktok_script','create_youtube_script'],
    tools: ['memory'],
    executor: 'video-scriptwriting-squad-skill',
  },

  'growth_analytics_squad': {
    nome: 'GrowthAnalyticsSquad',
    descricao: 'Transforma métricas de vídeos e canais em aprendizado acionável: o que repetir, o que parar, próximos experimentos.',
    dominios: ['analytics', 'growth'],
    tasks: ['analyze_performance','log_data','generate_report','analyze_metrics','plan_experiment'],
    tools: ['memory'],
    executor: 'growth-analytics-squad-skill',
  },

  'content_production_squad': {
    nome: 'ContentProductionSquad',
    descricao: 'Transforma estratégia em pacote completo: roteiro, título, descrição, legenda, hashtags, CTA, thumb brief, checklist de publicação.',
    dominios: ['content', 'script'],
    tasks: ['create_package','produce_content','create_publishing_pack'],
    tools: ['memory'],
    executor: 'content-production-squad-skill',
  },

  'asset_library_squad': {
    nome: 'AssetLibrarySquad',
    descricao: 'Organiza e cataloga ativos reutilizáveis: hooks, roteiros, thumbnails, carrosséis, prompts, IRs, presets, vídeos, outputs.',
    dominios: ['content', 'audio'],
    tasks: ['organize','catalog','tag','search_assets','curate'],
    tools: ['memory'],
    executor: 'asset-library-squad-skill',
  },

  'publishing_package_squad': {
    nome: 'PublishingPackageSquad',
    descricao: 'Gera pacote final para postagem: YouTube, TikTok, Shorts, Reels — com título, descrição, legenda, hashtags, CTA e checklist.',
    dominios: ['content'],
    tasks: ['create_package','format_platform','finalize_post','create_checklist'],
    tools: ['memory'],
    executor: 'publishing-package-squad-skill',
  },

  'compliance_copyright_squad': {
    nome: 'ComplianceCopyrightSquad',
    descricao: 'Revisa riscos antes da publicação: copyright, políticas de plataforma, originalidade, tópicos sensíveis. Resultado: 🟢/🟡/🔴.',
    dominios: ['content', 'dark', 'video'],
    tasks: ['check_copyright','check_compliance','review_content_risk','audit'],
    tools: ['memory'],
    executor: 'compliance-copyright-squad-skill',
  },

  'supreme_training_squad': {
    nome: 'SupremeTrainingSquad',
    descricao: 'Academia interna do BotSquad: treina, audita, versiona e melhora os demais squads e agentes.',
    dominios: ['training', 'system'],
    tasks: ['bootstrap', 'train_agent', 'audit_all', 'audit_agent', 'build_playbook', 'research', 'deep_research'],
    tools: ['memory'],
    executor: null,
  },

  'fitness_coaching_squad': {
    nome: 'FitnessCoachSquad',
    descricao: 'Coach de treino para musculação, hipertrofia, emagrecimento e recomposição, com foco em segurança, progressão e check-ins.',
    dominios: ['fitness', 'health'],
    tasks: ['create_plan', 'adjust_plan', 'checkin', 'expert_mode', 'exercise_library', 'safety_screening', 'progression', 'recomposition'],
    tools: ['memory'],
    executor: null,
  },

  'carousel_image_prompt_squad': {
    nome: 'CarouselImagePromptSquad',
    descricao: 'Gera pacotes completos de prompts de imagem para carrosséis — prompt principal, negativo, composição, estilo visual e copy por slide. NÃO gera imagens.',
    dominios: ['visual', 'content'],
    tasks: ['create_carousel', 'create_prompt_pack', 'create_creative', 'create_prompt', 'generate_prompts'],
    tools: ['memory'],
    executor: null,
    modelTier: 'mini',
    qualityTier: 'strong',
  },

  // ── REVIEWERS (v28-final3) — registrados para aparecer em /api/system/agents ──

  'globalQualityGateAgent': {
    nome: 'GlobalQualityGateAgent',
    descricao: 'Última checagem antes de entregar qualquer resultado: completo, seguro, sem segredos, com próximos passos',
    dominios: ['agency'],
    tasks: ['final_review', 'quality_check'],
    tools: ['memory'],
    executor: 'agency-command-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'creativeQualityReviewAgent': {
    nome: 'CreativeQualityReviewAgent',
    descricao: 'Revisa vídeos, thumbnails, carrosséis e imagens: gancho, hierarquia, consistência visual',
    dominios: ['visual', 'video'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'creative-review-squad-skill',
    isReviewer: true,
    minScore: 80,
  },

  'growthStrategyReviewAgent': {
    nome: 'GrowthStrategyReviewAgent',
    descricao: 'Revisa estratégias de crescimento orgânico: plataforma-específica, acionável, com calendário',
    dominios: ['growth'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'social-growth-squad-skill',
    isReviewer: true,
    minScore: 80,
  },

  'marketingConversionReviewAgent': {
    nome: 'MarketingConversionReviewAgent',
    descricao: 'Revisa ofertas, funis e copy: proposta de valor, dor/desejo, mecanismo único, monetização',
    dominios: ['marketing'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'marketing-strategy-squad-skill',
    isReviewer: true,
    minScore: 80,
  },

  'trafficScaleReviewAgent': {
    nome: 'TrafficScaleReviewAgent',
    descricao: 'Revisa planos de tráfego: orgânico e pago, criativos, públicos, orçamento, métricas',
    dominios: ['traffic'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'traffic-scale-squad-skill',
    isReviewer: true,
    minScore: 78,
  },

  'darkChannelReviewAgent': {
    nome: 'DarkChannelReviewAgent',
    descricao: 'Revisa canais dark/faceless: nicho viável, roteiro com gancho, sem risco de strike',
    dominios: ['dark'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'dark-channel-squad-skill',
    isReviewer: true,
    minScore: 82,
  },

  'videoCuttingReviewAgent': {
    nome: 'VideoCuttingReviewAgent',
    descricao: 'Revisa cortes de vídeo: gancho, retenção, sem pausa morta, legenda, enquadramento vertical',
    dominios: ['video'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'video-cutting-squad-skill',
    isReviewer: true,
    minScore: 80,
  },

  'productQualityReviewAgent': {
    nome: 'ProductQualityReviewAgent',
    descricao: 'Revisa infoprodutos: transformação clara, estrutura completa, exercícios, oferta irresistível',
    dominios: ['infoproduct'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'infoproduct-publishing-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'nicheOpportunityReviewAgent': {
    nome: 'NicheOpportunityReviewAgent',
    descricao: 'Revisa oportunidades de nicho: específico, monetizável, audiência apaixonada, blue ocean real',
    dominios: ['niche'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'niche-visionary-squad-skill',
    isReviewer: true,
    minScore: 82,
  },

  'toneQualityReviewAgent': {
    nome: 'ToneQualityReviewAgent',
    descricao: 'Revisa presets e IRs: respeita limitações do equipamento, encaixa na mix, sample rate correto',
    dominios: ['audio'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'audio-gear-squad-skill',
    isReviewer: true,
    minScore: 80,
  },

  'gearVisionReviewAgent': {
    nome: 'GearVisionReviewAgent',
    descricao: 'Revisa análises de imagem de equipamento: não inventa valores, separa visto/inferido/desconhecido',
    dominios: ['audio'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'gear-vision-skill',
    isReviewer: true,
    minScore: 75,
  },

  'scriptQualityReviewAgent': {
    nome: 'ScriptQualityReviewAgent',
    descricao: 'Revisa roteiros: gancho nos 3s, ritmo, retenção, CTA, adequação à plataforma',
    dominios: ['content'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'script-writer-skill',
    isReviewer: true,
    minScore: 80,
  },

  'channelNicheReviewerAgent': {
    nome: 'ChannelNicheReviewerAgent',
    descricao: 'Revisa pesquisas de nicho para canal: demanda real, conteúdo recorrente, monetização, saturação, diferencial claro, 30 ideias, próximo passo acionável',
    dominios: ['channel_growth'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'channel-niche-research-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'predictionReviewAgent': {
    nome: 'PredictionReviewAgent',
    descricao: 'Revisa análises esportivas: dados reais, probabilidades somando 100%, risco explicado, sem promessa de resultado',
    dominios: ['sports'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'sports-intelligence-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'sportsRiskGuardAgent': {
    nome: 'SportsRiskGuardAgent',
    descricao: 'Bloqueia promessa de lucro, certeza, all-in, recuperar prejuízo, aposta automática e linguagem irresponsável em análises esportivas',
    dominios: ['sports'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'sports-intelligence-squad-skill',
    isReviewer: true,
    minScore: 100,
  },

  'researchReviewerAgent': {
    nome: 'ResearchReviewerAgent',
    descricao: 'Revisa pesquisas profundas: profundidade real, fontes diversas, dados quantitativos, síntese acionável',
    dominios: ['research'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'deep-research-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'hunterReviewAgent': {
    nome: 'HunterReviewAgent',
    descricao: 'Revisa análises de viral intelligence: padrões concretos, formatos por plataforma, exemplos reais, acionável',
    dominios: ['hunter', 'research'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'social-hunters-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'authorityReviewAgent': {
    nome: 'AuthorityReviewAgent',
    descricao: 'Revisa estratégias de canal de autoridade: posicionamento único, diferencial, plano de credibilidade e monetização',
    dominios: ['growth', 'channel'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'authority-channel-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'kdpComplianceReviewAgent': {
    nome: 'KDPComplianceReviewAgent',
    descricao: 'Revisa pacotes KDP: título com keywords, descrição HTML, 7 keywords de backend, categorias, preço e compliance',
    dominios: ['infoproduct'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'kdp-localization-squad-skill',
    isReviewer: true,
    minScore: 87,
  },

  'translationQualityReviewAgent': {
    nome: 'TranslationQualityReviewAgent',
    descricao: 'Revisa qualidade de tradução: naturalidade no idioma alvo, adaptação cultural, tom adequado',
    dominios: ['infoproduct', 'content'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'kdp-localization-squad-skill',
    isReviewer: true,
    minScore: 85,
  },

  'growthAnalyticsReviewAgent': {
    nome: 'GrowthAnalyticsReviewAgent',
    descricao: 'Revisa análises de crescimento: dados específicos usados, o que repetir definido, o que parar definido, próximo experimento claro',
    dominios: ['analytics', 'growth'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'growth-analytics-squad-skill',
    isReviewer: true,
    minScore: 82,
  },

  'contentProductionReviewAgent': {
    nome: 'ContentProductionReviewAgent',
    descricao: 'Revisa pacotes de conteúdo: roteiro, título SEO, legenda engajante, hashtags relevantes, CTA claro, checklist presente',
    dominios: ['content'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'content-production-squad-skill',
    isReviewer: true,
    minScore: 83,
  },

  'assetLibraryReviewAgent': {
    nome: 'AssetLibraryReviewAgent',
    descricao: 'Revisa organização de biblioteca de ativos: categorização clara, tags úteis, metadados completos',
    dominios: ['content'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'asset-library-squad-skill',
    isReviewer: true,
    minScore: 78,
  },

  'publishingReviewAgent': {
    nome: 'PublishingReviewAgent',
    descricao: 'Revisa pacotes de publicação: versões por plataforma, hashtags corretas, CTA ativo, checklist completo',
    dominios: ['content'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'publishing-package-squad-skill',
    isReviewer: true,
    minScore: 82,
  },

  'complianceReviewAgent': {
    nome: 'ComplianceReviewAgent',
    descricao: 'Revisa riscos editoriais: copyright, políticas de plataforma, originalidade, tópicos sensíveis — resultado 🟢/🟡/🔴',
    dominios: ['content', 'dark', 'video'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'compliance-copyright-squad-skill',
    isReviewer: true,
    minScore: 80,
  },

  'copyConversionReviewAgent': {
    nome: 'CopyConversionReviewAgent',
    descricao: 'Revisa copy de venda: clareza da dor, promessa, prova, CTA, sem genérico',
    dominios: ['content', 'marketing'],
    tasks: ['review'],
    tools: ['memory'],
    executor: 'copy-squad-skill',
    isReviewer: true,
    minScore: 80,
  },

  'gear_vision': {
    nome: 'GearVisionAgent',
    descricao: 'Reconhece imagens de pedaleiras, pedals, amp modelers, IR loaders e gera presets compatíveis',
    dominios: ['audio'],
    tasks: ['recognize_gear_image', 'read_pedal_image', 'analyze_pedal_settings', 'create_preset_from_image', 'recreate_tone_from_screenshot'],
    tools: ['memory'],
    executor: 'gear-vision-skill'
  },

  // ── MOTOR PROFISSIONAL DE VÍDEO (v30) ─────────────────────────────────────

  'video_pro_toolchain_status': {
    nome: 'VideoProToolchainStatus',
    descricao: 'Verifica status das ferramentas do Motor Profissional de edição de vídeo: ffmpeg, ffprobe, OpenCV, PySceneDetect, Whisper, Librosa, YOLO e readiness do pipeline',
    dominios: ['video'],
    tasks: ['check_tools', 'pipeline_status', 'toolchain_status'],
    tools: ['memory'],
    executor: 'video-pro-toolchain-skill'
  },

  'video_pro_analyze': {
    nome: 'VideoProAnalyzer',
    descricao: 'Análise profissional de vídeo com PySceneDetect, OpenCV, Librosa e Whisper. Retorna cenas, motionTimeline, audioEnergy, speechSegments, usedTools e artefatos salvos.',
    dominios: ['video'],
    tasks: ['analyze_video', 'pro_analyze', 'video_analysis', 'analisa_video'],
    tools: ['memory', 'ffmpeg'],
    executor: 'video-pro-analyze-skill'
  },

  'video_highlight_detector': {
    nome: 'VideoHighlightDetector',
    descricao: 'Detecta melhores momentos do vídeo com score real por clip: audioPeak, motion, sceneChange, speechHook, durationFit. Respeita clipCount e targetDuration.',
    dominios: ['video'],
    tasks: ['detect_highlights', 'find_highlights', 'melhores_momentos', 'find_hot_moments'],
    tools: ['memory'],
    executor: 'video-highlight-skill'
  },

  'video_edit_plan_builder': {
    nome: 'VideoEditPlanBuilder',
    descricao: 'Transforma highlights em editPlan profissional com preset, colorPreset, audioPreset, captions, scoreBreakdown e salva JSON do plano.',
    dominios: ['video'],
    tasks: ['build_edit_plan', 'create_edit_plan', 'edit_plan'],
    tools: ['memory'],
    executor: 'video-edit-plan-skill'
  },

  'video_edit_supervisor': {
    nome: 'VideoEditSupervisor',
    descricao: 'Valida o editPlan antes do render: verifica quantidade, duração, scoreBreakdown, usedTools e consistência geral do plano.',
    dominios: ['video'],
    tasks: ['review_edit_plan', 'supervisor_review', 'validate_plan'],
    tools: ['memory'],
    executor: 'video-edit-supervisor-skill'
  },

  'video_dynamic_renderer': {
    nome: 'VideoDynamicRenderer',
    descricao: 'Renderiza MP4 profissional com FFmpeg aplicando formato 9:16/16:9, color preset, audio preset e overlays. Valida saída com ffprobe.',
    dominios: ['video'],
    tasks: ['render_video', 'render_clips', 'pro_render', 'renderiza_video'],
    tools: ['memory', 'ffmpeg'],
    executor: 'video-render-skill'
  },

  'video_output_validator': {
    nome: 'VideoOutputValidator',
    descricao: 'Valida MP4 final com ffprobe: duração, tamanho, codecs (h264+aac), sha256 e sanity checks.',
    dominios: ['video'],
    tasks: ['validate_output', 'validate_mp4', 'check_output'],
    tools: ['memory'],
    executor: 'video-output-validator-skill'
  },

  'video_preset_recommender': {
    nome: 'VideoPresetRecommender',
    descricao: 'Recomenda preset profissional com base no tipo de conteúdo: sports, podcast, worship, documentary, offer, tutorial, viral.',
    dominios: ['video'],
    tasks: ['recommend_preset', 'choose_preset', 'select_preset'],
    tools: ['memory'],
    executor: 'video-preset-recommender-skill'
  },

  'sports_highlight_pro_agent': {
    nome: 'SportsHighlightProAgent',
    descricao: 'Agente especializado em highlights esportivos: prioriza picos de áudio, movimento intenso, mudanças de cena e ação. Usa preset Sports Highlight Pro.',
    dominios: ['video', 'sports'],
    tasks: ['sports_highlights', 'esportes_highlights', 'gols', 'lances', 'melhores_lances'],
    tools: ['memory', 'ffmpeg'],
    executor: 'sports-highlight-agent-skill'
  },

  'podcast_cut_agent': {
    nome: 'PodcastCutAgent',
    descricao: 'Agente especializado em cortes de podcast e fala: usa Whisper para captions reais, cortes por frase e reframe.',
    dominios: ['video'],
    tasks: ['podcast_cut', 'podcast_clips', 'fala_corte', 'entrevista_corte'],
    tools: ['memory'],
    executor: 'podcast-cut-agent-skill'
  },

  'worship_music_cut_agent': {
    nome: 'WorshipMusicCutAgent',
    descricao: 'Agente especializado em cortes de música e worship: usa Librosa para beat/crescendo, evita cortes secos fora do tempo musical.',
    dominios: ['video'],
    tasks: ['worship_cut', 'music_cut', 'louvor_corte', 'musica_corte'],
    tools: ['memory'],
    executor: 'worship-cut-agent-skill'
  },

  'viral_shorts_editor_agent': {
    nome: 'ViralShortsEditorAgent',
    descricao: 'Agente especializado em cortes agressivos para Shorts/Reels: hook nos 2s, legenda grande, zoom, CTA.',
    dominios: ['video'],
    tasks: ['viral_shorts', 'shorts_edit', 'cortes_virais', 'reels_cut'],
    tools: ['memory'],
    executor: 'viral-shorts-agent-skill'
  },

  'video_reference_style_analyzer': {
    nome: 'VideoReferenceStyleAnalyzer',
    descricao: 'Analisa um vídeo de referência com o Motor Pro, extrai style-profile.json com ritmo, corte, zoom, transição, legenda e retorna referenceId e preset recomendado.',
    dominios: ['video'],
    tasks: ['analyze_reference', 'reference_style', 'analisar_referencia', 'estilo_referencia', 'aprender_estilo'],
    tools: ['memory', 'ffmpeg'],
    executor: 'video-reference-style-analyzer-skill'
  },

  'video_apply_reference_style': {
    nome: 'VideoApplyReferenceStyle',
    descricao: 'Aplica o estilo de um vídeo de referência (via referenceId + style-profile) a um vídeo fonte usando o Motor Pro. Retorna MP4 renderizado.',
    dominios: ['video'],
    tasks: ['apply_reference', 'apply_style', 'aplicar_referencia', 'aplicar_estilo', 'render_with_reference'],
    tools: ['memory', 'ffmpeg'],
    executor: 'video-apply-reference-style-skill'
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
      const openaiStrongUser = (messages, opts = {}) => modelRouter.callStrong(messages, { ...opts, userId });
      const openaiFastUser   = (messages, opts = {}) => modelRouter.callMini(messages, { ...opts, userId });

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
        if (filtro.isReviewer !== undefined && !!s.isReviewer !== filtro.isReviewer) return false;
        return true;
      })
      .map(([id, s]) => ({
        id,
        nome:       s.nome,
        descricao:  s.descricao,
        dominios:   s.dominios,
        isReviewer: !!s.isReviewer,
        minScore:   s.minScore || null,
        executor:   s.executor || null,
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

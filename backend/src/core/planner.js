// core/planner.js
// Recebe a intenção classificada e quebra em etapas executáveis.
// Cada etapa aponta para um módulo/worker específico.

import { openaiStrong } from '../integrations/openai-advanced.js';
import { log } from './logger.js';

// Planos pré-definidos por domain/task (executados sem chamar OpenAI)
const PLANOS_FIXOS = {

  // ── VISUAL ─────────────────────────────────────────────────────────────────

  'visual/create_carousel': (intencao, sessao) => ({
    domain: 'visual',
    task: 'create_carousel',
    descricao: 'Gerando pacote de prompts de imagem para o carrossel',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'carousel_image_prompt_director', topic: intencao.resumo || sessao.ultimoTexto, nicho: intencao.nicho || sessao.nicho, slides: 6, style: intencao.style || 'premium editorial dark', platform: 'instagram' } }
    ]
  }),

  'visual/create_carousel_html': (intencao, sessao) => ({
    domain: 'visual',
    task: 'create_carousel_html',
    descricao: 'Criando carrossel HTML/SVG como fallback manual',
    steps: [
      { modulo: 'squads/infoproduto/copy-generator', acao: 'gerar_copy_carrossel', params: { estilo: intencao.style, nicho: intencao.nicho || sessao.nicho } },
      { modulo: 'workers/visual/art-director', acao: 'definir_estilo', params: { tipo: 'carousel', style: intencao.style } },
      { modulo: 'integrations/image-banks', acao: 'buscar_imagens', params: { query: null, quantidade: 3 } },
      { modulo: 'renderers/html-carousel', acao: 'gerar_html', params: {} },
      { modulo: 'renderers/render-worker', acao: 'exportar_png', params: { tipo: 'carousel' } }
    ]
  }),

  'visual/create_prompt_pack': (intencao, sessao) => ({
    domain: 'visual',
    task: 'create_prompt_pack',
    descricao: 'Gerando pacote de prompts de imagem',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'carousel_image_prompt_director', topic: intencao.resumo || sessao.ultimoTexto, nicho: intencao.nicho || sessao.nicho, slides: 6, style: intencao.style || 'premium editorial dark', platform: 'instagram' } }
    ]
  }),

  'visual/create_thumb': (intencao, sessao) => ({
    domain: 'visual',
    task: 'create_thumb',
    descricao: '🖼️ Criando thumbnail: headline → direção visual → imagem → HTML → PNG',
    steps: [
      { modulo: 'workers/visual/headline-engine', acao: 'gerar_headline', params: { nicho: intencao.nicho || sessao.nicho, estilo: intencao.style } },
      { modulo: 'workers/visual/art-director', acao: 'definir_estilo', params: { tipo: 'thumb', style: intencao.style } },
      { modulo: 'integrations/image-banks', acao: 'buscar_imagens', params: { query: null, quantidade: 1 } },
      { modulo: 'renderers/html-thumb', acao: 'gerar_html', params: {} },
      { modulo: 'renderers/render-worker', acao: 'exportar_png', params: { tipo: 'thumb' } }
    ]
  }),

  'visual/create_creative': (intencao, sessao) => ({
    domain: 'visual',
    task: 'create_creative',
    descricao: '🎨 Criando criativo para tráfego',
    steps: [
      { modulo: 'workers/visual/art-director', acao: 'definir_estilo', params: { tipo: 'creative', style: intencao.style } },
      { modulo: 'integrations/image-banks', acao: 'buscar_imagens', params: { query: null, quantidade: 2 } },
      { modulo: 'renderers/html-thumb', acao: 'gerar_html', params: { tipo: 'creative' } },
      { modulo: 'renderers/render-worker', acao: 'exportar_png', params: { tipo: 'creative' } }
    ]
  }),

  // ── ÁUDIO ──────────────────────────────────────────────────────────────────

  'audio/refine_ir': (intencao, sessao) => ({
    domain: 'audio',
    task: 'refine_ir',
    descricao: '🎸 Refinando IR: análise → decisão → processamento → perfil de guitarra → export',
    steps: [
      { modulo: 'workers/audio/audio-parser', acao: 'analisar', params: { arquivo: sessao.ultimoIR } },
      { modulo: 'workers/audio/context-loader', acao: 'carregar', params: { estilo: intencao.style, contexto: intencao.context } },
      { modulo: 'workers/audio/decision-engine', acao: 'decidir', params: { objetivo: intencao.objetivo } },
      { modulo: 'workers/audio/ir-pro', acao: 'refine_ir', params: { ajustes: intencao.objetivo } },
      { modulo: 'workers/audio/guitar-profile', acao: 'aplicar', params: { guitarra: intencao.guitarra || sessao.guitarra } },
      { modulo: 'workers/audio/ir-exporter', acao: 'exportar', params: {} }
    ]
  }),

  'audio/compare_ir': (intencao, sessao) => ({
    domain: 'audio',
    task: 'compare_ir',
    descricao: '🔊 Comparando IRs',
    steps: [
      { modulo: 'workers/audio/audio-parser', acao: 'analisar', params: { arquivo: sessao.ultimoIR } },
      { modulo: 'workers/audio/ir-brain', acao: 'listar_favoritos', params: {} },
      { modulo: 'workers/audio/ir-pro', acao: 'compare_ir', params: {} },
      { modulo: 'workers/audio/ir-exporter', acao: 'exportar_relatorio', params: {} }
    ]
  }),

  'audio/blend_ir': (intencao, sessao) => ({
    domain: 'audio',
    task: 'blend_ir',
    descricao: '🎚️ Fazendo blend de IRs',
    steps: [
      { modulo: 'workers/audio/audio-parser', acao: 'analisar', params: { arquivo: sessao.ultimoIR } },
      { modulo: 'workers/audio/ir-brain', acao: 'buscar_complementar', params: { estilo: intencao.style } },
      { modulo: 'workers/audio/ir-pro', acao: 'blend_ir', params: { ratio: 0.5 } },
      { modulo: 'workers/audio/guitar-profile', acao: 'aplicar', params: { guitarra: intencao.guitarra || sessao.guitarra } },
      { modulo: 'workers/audio/ir-exporter', acao: 'exportar', params: {} }
    ]
  }),

  'audio/tone_match': (intencao, sessao) => ({
    domain: 'audio',
    task: 'tone_match',
    descricao: '🎯 Aproximando timbre',
    steps: [
      { modulo: 'workers/audio/audio-parser', acao: 'analisar', params: { arquivo: sessao.ultimoIR } },
      { modulo: 'workers/audio/tone-match-engine', acao: 'analisar_alvo', params: {} },
      { modulo: 'workers/audio/tone-match-engine', acao: 'aplicar_aproximacao', params: {} },
      { modulo: 'workers/audio/ir-exporter', acao: 'exportar', params: {} }
    ]
  }),

  // ── PEDALEIRA ──────────────────────────────────────────────────────────────

  'pedal/create_preset': (intencao, sessao) => ({
    domain: 'pedal',
    task: 'create_preset',
    descricao: '🎛️ Criando preset: detecção → parser → montagem → ajuste por guitarra',
    steps: [
      { modulo: 'workers/pedaleira/pedal-detector', acao: 'detectar', params: { pedaleira: intencao.pedaleira || sessao.pedaleira, texto: sessao.ultimoTexto } },
      { modulo: 'workers/pedaleira/pedal-parser', acao: 'interpretar', params: {} },
      { modulo: 'workers/pedaleira/preset-assistant', acao: 'montar', params: { estilo: intencao.style, contexto: intencao.context, amp: intencao.amp || sessao.amp } },
      { modulo: 'workers/pedaleira/mix-fit-engine', acao: 'otimizar', params: { ir: sessao.ultimoIR } },
      { modulo: 'workers/pedaleira/guitar-profile', acao: 'ajustar', params: { guitarra: intencao.guitarra || sessao.guitarra } }
    ]
  }),

  'pedal/read_photo': (intencao, sessao) => ({
    domain: 'pedal',
    task: 'read_photo',
    descricao: '📷 Lendo foto da pedaleira: detecção → leitura de knobs → sugestão de ajustes',
    steps: [
      { modulo: 'workers/pedaleira/pedal-detector', acao: 'detectar_por_foto', params: { foto: sessao.ultimaFoto } },
      { modulo: 'workers/pedaleira/pedal-parser', acao: 'ler_knobs', params: { foto: sessao.ultimaFoto } },
      { modulo: 'workers/pedaleira/preset-assistant', acao: 'analisar_e_sugerir', params: { estilo: intencao.style } },
      { modulo: 'workers/pedaleira/guitar-profile', acao: 'ajustar', params: { guitarra: intencao.guitarra || sessao.guitarra } }
    ]
  }),

  // ── CONTEÚDO ───────────────────────────────────────────────────────────────

  'content/create_product': (intencao, sessao) => ({
    domain: 'content',
    task: 'create_product',
    descricao: '📦 Criando infoproduto: nicho → oferta → produto → copy',
    steps: [
      { modulo: 'squads/infoproduto/niche-analyzer', acao: 'analisar', params: { nicho: intencao.nicho || sessao.nicho } },
      { modulo: 'squads/infoproduto/offer-generator', acao: 'gerar', params: {} },
      { modulo: 'squads/infoproduto/product-creator', acao: 'criar', params: {} },
      { modulo: 'squads/infoproduto/copy-generator', acao: 'gerar_copy_produto', params: {} },
      { modulo: 'squads/infoproduto/format-output', acao: 'formatar', params: {} }
    ]
  }),

  'content/create_traffic': (intencao, sessao) => ({
    domain: 'content',
    task: 'create_traffic',
    descricao: '📣 Criando estratégia de tráfego: ângulos → hooks → roteiro → CTA',
    steps: [
      { modulo: 'squads/trafego/angle-generator', acao: 'gerar', params: { nicho: intencao.nicho || sessao.nicho, produto: sessao.produto } },
      { modulo: 'squads/trafego/hook-generator', acao: 'gerar', params: {} },
      { modulo: 'squads/trafego/script-short', acao: 'gerar', params: {} },
      { modulo: 'squads/trafego/cta-generator', acao: 'gerar', params: {} },
      { modulo: 'squads/trafego/format-output', acao: 'formatar', params: {} }
    ]
  }),

  'content/create_funnel': (intencao, sessao) => ({
    domain: 'content',
    task: 'create_funnel',
    descricao: '🔄 Criando funil completo: posicionamento → página → bumps → followup',
    steps: [
      { modulo: 'squads/funil/offer-positioning', acao: 'posicionar', params: { nicho: intencao.nicho || sessao.nicho } },
      { modulo: 'squads/funil/page-copy', acao: 'gerar', params: {} },
      { modulo: 'squads/funil/order-bump-generator', acao: 'gerar', params: {} },
      { modulo: 'squads/funil/upsell-generator', acao: 'gerar', params: {} },
      { modulo: 'squads/funil/followup-generator', acao: 'gerar', params: {} }
    ]
  }),

  'content/create_copy': (intencao, sessao) => ({
    domain: 'content',
    task: 'create_copy',
    descricao: '✍️ Gerando copy',
    steps: [
      { modulo: 'squads/infoproduto/copy-generator', acao: 'gerar_copy_produto', params: { nicho: intencao.nicho || sessao.nicho } },
      { modulo: 'squads/infoproduto/format-output', acao: 'formatar', params: {} }
    ]
  }),

  // ── AUTOPESQUISA ───────────────────────────────────────────────────────────

  'research/auto_search': (intencao, sessao) => ({
    domain: 'research',
    task: 'auto_search',
    descricao: '🔍 AutoPesquisa: buscando copy, hooks, infoprodutos e ganchos atuais',
    steps: [
      { modulo: 'workers/autopesquisa/search-engine', acao: 'pesquisar', params: { categorias: intencao.categorias || ['copy', 'hooks', 'ganchos', 'infoprodutos'], profundidade: intencao.profundidade || 'media', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'research/auto_learn': (intencao, sessao) => ({
    domain: 'research',
    task: 'auto_learn',
    descricao: '🧠 AutoLearner: ciclo de aprendizado automático com base em fontes externas',
    steps: [
      { modulo: 'workers/autopesquisa/auto-learner', acao: 'rodarManualmente', params: { nicho: intencao.nicho || sessao.nicho, categorias: intencao.categorias || ['copy', 'hooks', 'ganchos'] } }
    ]
  }),

  // ── SVG EXTRACTOR ──────────────────────────────────────────────────────────

  'visual/extract_svg': (intencao, sessao) => ({
    domain: 'visual',
    task: 'extract_svg',
    descricao: '🎨 SVG Extractor: extraindo todos os SVGs do site',
    steps: [
      { modulo: 'workers/svg-extractor/extractor', acao: 'extrair', params: { url: intencao.url, categorizar: true, baixar: true } }
    ]
  }),

  // ── HUNTER ─────────────────────────────────────────────────────────────────

  'hunter/analyze_profile': (intencao, sessao) => ({
    domain: 'hunter',
    task: 'analyze_profile',
    descricao: '🎯 Hunter: analisando métricas visuais e padrões de retenção do perfil',
    steps: [
      { modulo: 'workers/hunter/profile-hunter', acao: 'analisar', params: { perfis: intencao.perfis || [], plataforma: intencao.plataforma, foco: intencao.foco || ['visual', 'retencao', 'crescimento'] } }
    ]
  }),

  'hunter/compare_profiles': (intencao, sessao) => ({
    domain: 'hunter',
    task: 'compare_profiles',
    descricao: '🏆 Hunter: comparando múltiplos perfis para extrair melhores práticas',
    steps: [
      { modulo: 'workers/hunter/profile-hunter', acao: 'analisar', params: { perfis: intencao.perfis || [], plataforma: intencao.plataforma, foco: ['visual', 'retencao', 'crescimento', 'comparativo'] } }
    ]
  }),

  // ── SISTEMA ────────────────────────────────────────────────────────────────

  'system/process_feedback': (intencao, sessao) => ({
    domain: 'system',
    task: 'process_feedback',
    descricao: '📝 Processando feedback para aprendizado',
    steps: [
      { modulo: 'squads/aprendizado/feedback-parser', acao: 'parsear', params: { texto: sessao.ultimoTexto } },
      { modulo: 'squads/aprendizado/performance-analyzer', acao: 'analisar', params: {} },
      { modulo: 'squads/aprendizado/learning-engine', acao: 'aprender', params: {} }
    ]
  }),

  'system/show_status': (intencao, sessao) => ({
    domain: 'system',
    task: 'show_status',
    descricao: '📊 Mostrando status da sessão',
    steps: [
      { modulo: 'workers/system/status', acao: 'gerar_relatorio', params: {} }
    ]
  }),

  // ── SKILLS — CONTEÚDO AVANÇADO ──────────────────────────────────────────

  'content/build_offer': (intencao, sessao) => ({
    domain: 'content',
    task: 'build_offer',
    descricao: '💎 Construindo oferta irresistível com skill especializada',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'offer_builder', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'content/validate_product': (intencao, sessao) => ({
    domain: 'content',
    task: 'validate_product',
    descricao: '✅ Validando viabilidade do infoproduto',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'product_validator', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'content/build_mechanism': (intencao, sessao) => ({
    domain: 'content',
    task: 'build_mechanism',
    descricao: '⚙️ Criando mecanismo único e diferenciador',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'mechanism_builder', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'content/repurpose_content': (intencao, sessao) => ({
    domain: 'content',
    task: 'repurpose_content',
    descricao: '♻️ Repropositando conteúdo para múltiplos formatos',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'content_repurposer', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  // ── SKILLS — ANALYTICS ─────────────────────────────────────────────────

  'analytics/log_data': (intencao, sessao) => ({
    domain: 'analytics',
    task: 'log_data',
    descricao: '📝 Registrando dados de performance',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'data_logger' } }
    ]
  }),

  'analytics/analyze_performance': (intencao, sessao) => ({
    domain: 'analytics',
    task: 'analyze_performance',
    descricao: '📊 Analisando performance e gerando insights',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'performance_analyst' } }
    ]
  }),

  'system/log_data': (intencao, sessao) => ({
    domain: 'system',
    task: 'log_data',
    descricao: '📝 Registrando dados de performance',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'data_logger' } }
    ]
  }),

  'system/analyze_performance': (intencao, sessao) => ({
    domain: 'system',
    task: 'analyze_performance',
    descricao: '📊 Analisando performance com IA',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'performance_analyst' } }
    ]
  }),

  // ── SKILLS — RESEARCH/TENDÊNCIAS ───────────────────────────────────────

  'research/predict_trends': (intencao, sessao) => ({
    domain: 'research',
    task: 'predict_trends',
    descricao: '🔮 Prevendo tendências de mercado',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'trend_predictor', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'research/collect_feedback': (intencao, sessao) => ({
    domain: 'research',
    task: 'collect_feedback',
    descricao: '🗣️ Coletando e analisando feedback da audiência',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'feedback_collector' } }
    ]
  }),

  'research/run_experiment': (intencao, sessao) => ({
    domain: 'research',
    task: 'run_experiment',
    descricao: '🧪 Gerenciando experimento/teste',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'experiment_manager', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  // ── SKILLS — ESTRATÉGIA ─────────────────────────────────────────────────

  'strategy/plan_strategy': (intencao, sessao) => ({
    domain: 'strategy',
    task: 'plan_strategy',
    descricao: '🗺️ Criando plano estratégico completo',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'strategy_planner', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'strategy/build_ecosystem': (intencao, sessao) => ({
    domain: 'strategy',
    task: 'build_ecosystem',
    descricao: '🌐 Construindo ecossistema de negócio digital',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'ecosystem_builder', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'strategy/manage_automation': (intencao, sessao) => ({
    domain: 'strategy',
    task: 'manage_automation',
    descricao: '🤖 Criando plano de automação',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'automation_manager' } }
    ]
  }),

  'strategy/assess_risk': (intencao, sessao) => ({
    domain: 'strategy',
    task: 'assess_risk',
    descricao: '🛡️ Avaliando e mitigando riscos',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'risk_guard', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'strategy/optimize_learning': (intencao, sessao) => ({
    domain: 'strategy',
    task: 'optimize_learning',
    descricao: '🧠 Otimizando ciclo de aprendizado',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'learning_optimizer' } }
    ]
  }),

  // ── SKILLS — GROWTH ─────────────────────────────────────────────────────

  'growth/build_audience': (intencao, sessao) => ({
    domain: 'growth',
    task: 'build_audience',
    descricao: '👥 Construindo estratégia de audiência',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'audience_builder', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/optimize_retention': (intencao, sessao) => ({
    domain: 'growth',
    task: 'optimize_retention',
    descricao: '🔄 Otimizando retenção de audiência',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'retention_optimizer', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/optimize_seo': (intencao, sessao) => ({
    domain: 'growth',
    task: 'optimize_seo',
    descricao: '🔍 Otimizando SEO e busca orgânica',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'seo_optimizer', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/optimize_distribution': (intencao, sessao) => ({
    domain: 'growth',
    task: 'optimize_distribution',
    descricao: '📡 Otimizando distribuição de conteúdo',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'distribution_optimizer', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/expand_monetization': (intencao, sessao) => ({
    domain: 'growth',
    task: 'expand_monetization',
    descricao: '💰 Expandindo fontes de monetização',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'monetization_expander', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/remodel_channel': (intencao, sessao) => ({
    domain: 'growth',
    task: 'remodel_channel',
    descricao: '🔧 Remodelando canal de conteúdo',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'channel_remodeler', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/plan_social_media': (intencao, sessao) => ({
    domain: 'growth',
    task: 'plan_social_media',
    descricao: '📱 Criando estratégia de redes sociais',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'social_media_strategist', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/schedule_content': (intencao, sessao) => ({
    domain: 'growth',
    task: 'schedule_content',
    descricao: '📅 Criando calendário editorial',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'content_scheduler', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/optimize_offer': (intencao, sessao) => ({
    domain: 'growth',
    task: 'optimize_offer',
    descricao: '🎯 Otimizando oferta para maximizar conversão',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'offer_optimizer', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  // ── SKILLS — VISUAL AVANÇADO ────────────────────────────────────────────

  'visual/optimize_thumbnail': (intencao, sessao) => ({
    domain: 'visual',
    task: 'optimize_thumbnail',
    descricao: '🖼️ Otimizando thumbnail com análise de CTR',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'thumbnail_optimizer', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  // ── SKILLS — HUNTER/PERSONA ─────────────────────────────────────────────

  'hunter/build_persona': (intencao, sessao) => ({
    domain: 'hunter',
    task: 'build_persona',
    descricao: '🎭 Construindo persona detalhada da audiência',
    useSkill: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executar', params: { skillId: 'persona_builder', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  // ── WORKFLOWS COMPOSTOS (multi-skill) ──────────────────────────────────

  'content/launch_infoproduct': (intencao, sessao) => ({
    domain: 'content',
    task: 'launch_infoproduct',
    descricao: '🚀 Lançamento completo: nicho → persona → produto → oferta → funil → copy',
    useWorkflow: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executarWorkflow', params: { workflowId: 'launch_infoproduct', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'content/content_strategy': (intencao, sessao) => ({
    domain: 'content',
    task: 'content_strategy',
    descricao: '📣 Estratégia de conteúdo completa: nicho → persona → estratégia → hooks → copy',
    useWorkflow: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executarWorkflow', params: { workflowId: 'content_strategy', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'research/market_deep_dive': (intencao, sessao) => ({
    domain: 'research',
    task: 'market_deep_dive',
    descricao: '🔭 Análise profunda de mercado com inteligência competitiva',
    useWorkflow: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executarWorkflow', params: { workflowId: 'market_deep_dive', nicho: intencao.nicho || sessao.nicho } }
    ]
  }),

  'growth/social_optimization': (intencao, sessao) => ({
    domain: 'growth',
    task: 'social_optimization',
    descricao: '📈 Otimização social completa: análise → gaps → plano de melhoria',
    useWorkflow: true,
    steps: [
      { modulo: 'skills/skill-runner', acao: 'executarWorkflow', params: { workflowId: 'social_optimization', nicho: intencao.nicho || sessao.nicho } }
    ]
  })
};

class Planner {
  async montar(intencao, sessao) {
    const chave = `${intencao.domain}/${intencao.task}`;

    // Verifica se existe plano pré-definido
    if (PLANOS_FIXOS[chave]) {
      const plano = PLANOS_FIXOS[chave](intencao, sessao);
      plano.intencao = intencao;
      plano.sessionSnapshot = {
        pedaleira: sessao.pedaleira,
        guitarra: sessao.guitarra,
        amp: sessao.amp,
        estilo: sessao.estilo,
        contexto: sessao.contexto,
        ultimoIR: sessao.ultimoIR,
        ultimaFoto: sessao.ultimaFoto
      };

      log('info', `Plano fixo: ${chave} com ${plano.steps.length} etapas`);
      return plano;
    }

    // Tarefa desconhecida: usa IA para montar plano
    log('warn', `Plano não encontrado para ${chave}, usando IA...`);
    return await this._planoComIA(intencao, sessao);
  }

  // Usa OpenAI para montar plano para tarefas não mapeadas
  async _planoComIA(intencao, sessao) {
    const prompt = `Monte um plano de execução em JSON para a seguinte intenção:
${JSON.stringify(intencao, null, 2)}

Contexto da sessão:
${JSON.stringify({ pedaleira: sessao.pedaleira, guitarra: sessao.guitarra, estilo: sessao.estilo }, null, 2)}

Retorne APENAS JSON com a estrutura:
{
  "domain": "...",
  "task": "...",
  "descricao": "...",
  "steps": [
    { "modulo": "workers/...", "acao": "...", "params": {} }
  ]
}`;

    try {
      const userId = ctx?.userId ?? null;
      const resposta = await openaiStrong([{ role: 'user', content: prompt }], { userId });
      const plano = JSON.parse(resposta);
      plano.intencao = intencao;
      return plano;
    } catch (err) {
      log('error', 'Planner IA falhou:', err.message);
      // Retorna plano mínimo de fallback
      return {
        domain: intencao.domain,
        task: intencao.task,
        descricao: intencao.resumo,
        intencao,
        steps: [
          {
            modulo: 'workers/system/fallback',
            acao: 'responder',
            params: { mensagem: `Não consigo executar "${intencao.task}" ainda. Funcionalidade em desenvolvimento.` }
          }
        ]
      };
    }
  }
}


export const planner = new Planner();

// routes/agents.js — dynamic agent registry endpoint
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Agent definitions mirror the frontend but are authoritative
const AGENTS = [
  {
    id: 'video', name: 'Video Agent', description: 'Cortes, retenção e edição inteligente',
    category: 'video',
    skills: ['hook-skill','retention-optimizer-skill','thumbnail-optimizer-skill','content-repurposer-skill','seo-optimizer-skill','performance-analyst-skill'],
  },
  {
    id: 'audio', name: 'Audio / IR Agent', description: 'IR worship, tone shaping e mic sim',
    category: 'audio',
    skills: ['audio-skill','ir-service','ir-blend','mic-sim','guitar-profiles'],
  },
  {
    id: 'research', name: 'Research Agent', description: 'Trends, nichos e estratégia de mercado',
    category: 'research',
    skills: ['market-skill','niche-skill','trend-predictor-skill','hunter-skill','strategy-planner-skill','persona-builder-skill','audience-builder-skill'],
  },
  {
    id: 'investigator', name: 'Profile Investigator', description: 'Analisa perfis com dados reais',
    category: 'research',
    skills: ['performance-analyst-skill','data-logger-skill','feedback-collector-skill','experiment-manager-skill','risk-guard-skill'],
  },
  {
    id: 'content', name: 'Content Agent', description: 'Copy, hooks e agendamento de conteúdo',
    category: 'content',
    skills: ['copy-skill','angle-generator-skill','hook-skill','content-scheduler-skill','social-media-strategist-skill','creative-tester-skill'],
  },
  {
    id: 'product', name: 'Product Agent', description: 'Infoprodutos, ofertas e funis completos',
    category: 'product',
    skills: ['infoproduct-builder-skill','product-validator-skill','offer-builder-skill','offer-optimizer-skill','mechanism-builder-skill','funnel-architect-skill','monetization-expander-skill'],
  },
  {
    id: 'visual', name: 'Visual / Carousel Agent', description: 'Carrosséis e prompts de imagem para ChatGPT',
    category: 'visual',
    skills: ['visual-skill','thumbnail-optimizer-skill','carousel-generator','prompt-image-generator'],
  },
  {
    id: 'automation', name: 'Skills & Automation Agent', description: 'Automações, workflows e sistemas',
    category: 'automation',
    skills: ['automation-manager-skill','ecosystem-builder-skill','knowledge-manager-skill','learning-optimizer-skill','status-skill','data-logger-skill'],
  },
  {
    id: 'memory', name: 'Memory Agent', description: 'Memória de longo prazo e contexto',
    category: 'memory',
    skills: ['memory-skill','context-manager','knowledge-manager-skill'],
  },
  {
    id: 'growth', name: 'Growth Agent', description: 'Métricas, crescimento e otimização de ROI',
    category: 'analytics',
    skills: ['performance-analyst-skill','data-logger-skill','experiment-manager-skill'],
  },
  {
    id: 'risk', name: 'Risk Guard', description: 'Proteção, auditoria e análise de riscos',
    category: 'automation',
    skills: ['risk-guard-skill','experiment-manager-skill','data-logger-skill'],
  },
  {
    id: 'social', name: 'Social Radar', description: 'YouTube, Instagram, TikTok — dados reais',
    category: 'research',
    skills: ['social-media-strategist-skill','hunter-skill','trend-predictor-skill','audience-builder-skill','channel-remodeler-skill'],
  },
];

router.get('/', requireAuth, (req, res) => {
  res.json({ agents: AGENTS, total: AGENTS.length });
});

router.get('/:id', requireAuth, (req, res) => {
  const agent = AGENTS.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

export default router;

import { chat } from '../lib/llm.js';

const SYSTEMS = {
  default: `You are BotSquad's content specialist. Help with:
- Hooks virais para vídeos (primeiros 3 segundos)
- Copywriting persuasivo (VSL, carrossel, anúncios, email)
- Roteiros completos (YouTube, TikTok, Reels)
- Estrutura de posts (Instagram, TikTok, LinkedIn)
- Sequências de email, bios otimizadas
Responda na língua do usuário. Seja direto e entregue conteúdo pronto para usar.`,

  product: `You are BotSquad's Product & Infoproduct specialist. Help with:
- Criação completa de infoprodutos
- Validação de ideia e produto mínimo viável
- Construção de oferta irresistível com mecanismo único
- Funil de lançamento: VSL, emails e sequência de venda
- Escada de valor, order bump e upsell
Entregue estruturas completas, prontas para implementar. Responda na língua do usuário.`,

  risk: `You are BotSquad's Risk & Compliance specialist. Help with:
- Análise de riscos em campanhas, copy e ofertas
- Compliance com regulamentações de marketing digital
- Identificação de promessas abusivas ou ilícitas
- Auditoria de conteúdo antes de publicar
Seja objetivo e liste riscos com nível de severidade. Responda na língua do usuário.`,

  automation: `You are BotSquad's Automation & Systems specialist. Help with:
- Criação de workflows e automações de marketing
- Ecossistemas de conteúdo e distribuição
- Sequências automáticas
- Integração entre ferramentas
- Processos e SOPs para times de conteúdo
Entregue fluxos detalhados e prontos para implementar. Responda na língua do usuário.`,
};

const TYPES = { hook: /hook|gancho|viral/, script: /roteiro|script|youtube|tiktok|reels/, copy: /copy|anuncio|vsl|vendas/, post: /post|carrossel|legenda/ };

export async function contentAgent({ userId, message, context = [], _systemOverride = null }) {
  const baseSystem = SYSTEMS[_systemOverride] || SYSTEMS.default;
  const type = Object.entries(TYPES).find(([, re]) => re.test(message))?.[0] || '';
  const system = (!_systemOverride && type)
    ? `${baseSystem}\n\nFOCO: gerar ${type}. Entregue completo e pronto para usar.`
    : baseSystem;
  const content = await chat(
    [{ role: 'system', content: system }, ...context, { role: 'user', content: message }],
    { userId, max_tokens: 3000 },
  );
  return { type: 'text', content };
}

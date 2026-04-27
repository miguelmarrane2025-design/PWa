// agents/video/socialMetadataAgent.js
// Gera título, descrição, hashtags e CTA para cada plataforma social.
// Provider: OpenAI via chat. Nunca Anthropic/Gemini.

import { chat, chatFast } from '../../lib/llm.js';
import { agentMemoryService } from '../../memory/agentMemoryService.js';
import { logger } from '../../lib/logger.js';

const PLATFORM_RULES = {
  tiktok:    { maxTitle: 150, hashtagCount: 5,  maxDesc: 200,  cta: 'Siga para mais | Compartilha com alguém que precisa | Salva isso!' },
  reels:     { maxTitle: 2200, hashtagCount: 10, maxDesc: 2200, cta: 'Salva para não perder | Marca alguém | Comenta sua opinião' },
  shorts:    { maxTitle: 100, hashtagCount: 3,  maxDesc: 200,  cta: 'Curte | Se inscreva | Comenta' },
  youtube:   { maxTitle: 100, hashtagCount: 5,  maxDesc: 5000, cta: 'Se inscreva no canal | Ative o sininho | Deixe seu comentário' },
  instagram: { maxTitle: 2200, hashtagCount: 15, maxDesc: 2200, cta: 'Salva esse post | Marca um amigo | Me segue para mais' },
};

export async function socialMetadataAgent({ topic, platform = 'instagram', niche = 'geral', userId = null }) {
  logger.info(`[SocialMetadataAgent] topic=${String(topic).slice(0, 60)} platform=${platform} niche=${niche}`);

  const rules = PLATFORM_RULES[platform] || PLATFORM_RULES.instagram;
  const ctx = await agentMemoryService.loadAgentContext('video').catch(() => ({ goodExamples: [] }));
  const refs = ctx.goodExamples?.slice(-1).map(e => e.metadata?.title || '').filter(Boolean).join(' | ') || '';

  const prompt = `Você é um especialista em marketing de conteúdo para redes sociais.

TEMA DO VÍDEO: ${topic}
PLATAFORMA: ${platform}
NICHO: ${niche}
${refs ? `TÍTULOS APROVADOS ANTERIORES: ${refs}` : ''}

REGRAS DA PLATAFORMA:
- Título: máximo ${rules.maxTitle} caracteres
- Hashtags: ${rules.hashtagCount} hashtags relevantes
- Descrição: máximo ${rules.maxDesc} caracteres
- CTA sugerido: ${rules.cta}

Crie metadados virais e autênticos para este vídeo.

Retorne SOMENTE JSON válido:
{
  "title": "título otimizado",
  "description": "descrição completa com gancho inicial",
  "hashtags": ["hashtag1", "hashtag2"],
  "cta": "chamada para ação",
  "shortDescription": "versão curta para thumbnail caption",
  "hook": "primeiras palavras do vídeo sugeridas",
  "seoKeywords": ["palavra-chave 1", "palavra-chave 2"]
}`;

  let raw = '';
  try {
    raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 800 });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON found');
    const meta = JSON.parse(m[0]);

    const hashtagStr = (meta.hashtags || []).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

    const content = [
      `## 📱 Metadados Sociais — ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
      '',
      `### 🎯 Título`,
      meta.title || '',
      '',
      `### 📝 Descrição`,
      meta.description || '',
      '',
      meta.cta ? `### 📣 CTA\n${meta.cta}` : '',
      '',
      `### # Hashtags`,
      hashtagStr,
      '',
      meta.hook ? `### 🎤 Gancho (primeiras palavras)\n*"${meta.hook}"*` : '',
      '',
      meta.seoKeywords?.length ? `### 🔍 Palavras-chave SEO\n${meta.seoKeywords.join(', ')}` : '',
      '',
      `> 💡 Copie o título e a descrição para a plataforma. Hashtags já estão formatadas.`,
    ].filter(Boolean).join('\n');

    // Save good example to memory
    await agentMemoryService.saveGoodExample('video', {
      topic,
      platform,
      metadata: { title: meta.title, hashtags: meta.hashtags },
      summary: meta.title,
    }).catch(() => {});

    return {
      content,
      metadata: { agent: 'social_metadata_agent', platform, meta },
    };

  } catch (err) {
    logger.error(`[SocialMetadataAgent] error: ${err.message}`);
    return {
      content: `❌ Erro ao gerar metadados sociais: ${err.message}`,
      metadata: { agent: 'social_metadata_agent', error: err.message },
    };
  }
}

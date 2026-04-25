// integrations/integrations-engine.js
// Central integration engine — manages external API connections with
// automatic fallback: Official API → RapidAPI → Apify → LLM-only.
// Normalises all responses to a single schema regardless of source.

import { youtubeAPI, rapidAPI, socialBlade, analyzeProfile } from './social-apis.js';
import { query }  from '../db/index.js';
import { logger } from '../lib/logger.js';
import { chat }   from '../lib/provider-manager.js';

// ── Normalised output schema ──────────────────────────────────────────────
function normalise(raw, source, platform) {
  const ch  = raw.channel  || raw.profile || raw;
  const vids = raw.recentVideos || raw.posts || raw.videos || [];

  return {
    source,
    platform,
    profile: {
      name:        ch.title || ch.username || ch.nickname || ch.handle || '',
      handle:      ch.customUrl || ch.username || ch.uniqueId || '',
      subscribers: ch.subscribers || ch.followers || ch.followerCount || 0,
      views:       ch.totalViews  || ch.totalLikes || 0,
      posts:       ch.videoCount  || ch.mediaCount || ch.posts || 0,
      bio:         ch.description || ch.bio || ch.signature || '',
      verified:    ch.isVerified  || ch.verified || false,
      url:         ch.url         || '',
      thumbnail:   ch.thumbnail   || ch.profilePicUrl || ch.avatarThumb || '',
    },
    items: vids.slice(0, 10).map(v => ({
      title:       v.title || v.caption || '',
      views:       v.views || v.viewCount || 0,
      likes:       v.likes || v.likeCount || 0,
      comments:    v.comments || v.commentCount || 0,
      published:   v.publishedAt || v.timestamp || '',
      duration:    v.duration || '',
      url:         v.url || '',
      type:        v.type || 'video',
      hashtags:    v.hashtags || [],
    })),
    raw: process.env.NODE_ENV === 'development' ? raw : undefined,
  };
}

// ── Integration status for a user ─────────────────────────────────────────
export async function getIntegrationStatus(userId) {
  try {
    const { rows } = await query(
      `SELECT provider, verified, updated_at FROM user_api_keys
       WHERE user_id = $1 AND provider IN ('youtube','rapidapi','apify')`,
      [userId],
    );
    const byProvider = Object.fromEntries(rows.map(r => [r.provider, r]));
    return {
      youtube:  { configured: !!byProvider.youtube?.verified,  provider: 'YouTube Data API v3' },
      rapidapi: { configured: !!byProvider.rapidapi?.verified, provider: 'RapidAPI'             },
      apify:    { configured: !!byProvider.apify?.verified,    provider: 'Apify'                },
    };
  } catch {
    return { youtube: { configured: false }, rapidapi: { configured: false }, apify: { configured: false } };
  }
}

// ── Main profile fetch with fallback chain ────────────────────────────────
export async function fetchProfile({ platform, identifier, userId }) {
  const errors = [];

  // 1. Official API (YouTube only — free, most reliable)
  if (platform === 'youtube') {
    try {
      const raw = await analyzeProfile({ platform, identifier, userId });
      if (raw && !raw.error && (raw.channel || raw.profile)) {
        logger.info(`[IntegrationsEngine] YouTube API OK: ${identifier}`);
        return normalise(raw, 'youtube_api', platform);
      }
    } catch (err) {
      errors.push(`YouTube API: ${err.message}`);
      logger.warn(`[IntegrationsEngine] YouTube API failed: ${err.message}`);
    }
  }

  // 2. RapidAPI (Instagram + TikTok + YouTube fallback)
  try {
    const raw = await analyzeProfile({ platform, identifier, userId });
    if (raw && !raw.error && (raw.channel || raw.profile)) {
      logger.info(`[IntegrationsEngine] RapidAPI OK: ${identifier}`);
      return normalise(raw, 'rapidapi', platform);
    }
    if (raw?.error) errors.push(`RapidAPI: ${raw.error}`);
  } catch (err) {
    errors.push(`RapidAPI: ${err.message}`);
    logger.warn(`[IntegrationsEngine] RapidAPI failed: ${err.message}`);
  }

  // 3. SocialBlade (free scrape — stats only, no posts)
  try {
    const handle = identifier.replace(/^@/, '');
    const sb = platform === 'youtube'
      ? await socialBlade.getYouTube(handle)
      : platform === 'instagram' ? await socialBlade.getInstagram(handle) : null;

    if (sb && !sb.error) {
      logger.info(`[IntegrationsEngine] SocialBlade OK: ${identifier}`);
      return normalise({ profile: { username: handle, ...sb } }, 'socialblade', platform);
    }
  } catch (err) {
    errors.push(`SocialBlade: ${err.message}`);
  }

  // 4. LLM-only (always works — marked as estimate)
  logger.info(`[IntegrationsEngine] LLM-only fallback for ${identifier} (errors: ${errors.join('; ')})`);

  // Build a clear message about what's missing
  let note = 'Nenhuma fonte de dados configurada. ';
  if (platform === 'youtube')   note += 'Adicione sua YouTube Data API key em Configurações → YouTube API.';
  if (platform === 'instagram') note += 'Adicione uma RapidAPI key em Configurações → RapidAPI para dados do Instagram.';
  if (platform === 'tiktok')    note += 'Adicione uma RapidAPI key em Configurações → RapidAPI para dados do TikTok.';

  return {
    source:   'llm_estimate',
    platform,
    profile:  { name: identifier, handle: identifier },
    items:    [],
    errors,
    note,
    configured: false,
  };
}

// ── Analyse profile with intelligence layer ───────────────────────────────
export async function analyseProfileIntelligent({ platform, identifier, userId }) {
  const data = await fetchProfile({ platform, identifier, userId });

  // Build context for LLM analysis
  const profileBlock = JSON.stringify(data.profile, null, 2);
  const itemsBlock   = data.items.length
    ? `\n\nConteúdos recentes:\n${JSON.stringify(data.items.slice(0, 5), null, 2)}`
    : '';

  const prompt = `Analise este perfil de ${platform.toUpperCase()} e extraia:

Dados do perfil:
${profileBlock}${itemsBlock}

Produza uma análise estratégica com:
1. Visão geral do perfil (nicho, posicionamento, tamanho)
2. Padrões de hooks recorrentes (baseado no título dos vídeos/posts)
3. Formatos dominantes
4. CTAs prováveis
5. Taxa de engajamento estimada e benchmark do nicho
6. 5 oportunidades para o usuário adaptar à própria estratégia
7. O que NÃO copiar (pontos fracos detectados)

Responda em português, de forma estruturada e acionável.`;

  const analysis = await chat(
    [{ role: 'system', content: 'Você é um especialista em análise estratégica de criadores de conteúdo.' },
     { role: 'user', content: prompt }],
    { userId, max_tokens: 2000 },
  );

  return { ...data, analysis };
}

// ── Trend detection ───────────────────────────────────────────────────────
export async function detectTrends({ niche, platform, userId }) {
  const prompt = `Identifique tendências atuais de conteúdo para:
Nicho: ${niche || 'criadores em geral'}
Plataforma: ${platform || 'YouTube/Instagram/TikTok'}

Liste:
- 5 formatos em alta agora
- 5 temas com alta demanda
- 3 hooks virais do momento
- 2 oportunidades de nicho pouco exploradas
- Erros que criadores devem evitar

Seja específico e acionável. Responda em português.`;

  return chat(
    [{ role: 'system', content: 'Você é um especialista em tendências de conteúdo digital.' },
     { role: 'user', content: prompt }],
    { userId, max_tokens: 1500 },
  );
}

// ── Singleton export ──────────────────────────────────────────────────────
export const integrationsEngine = {
  fetchProfile,
  analyseProfileIntelligent,
  detectTrends,
  getIntegrationStatus,
};

export default integrationsEngine;

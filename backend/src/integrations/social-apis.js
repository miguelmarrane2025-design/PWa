// integrations/social-apis.js
// Integração plug-and-play com APIs de redes sociais.
// Cada provider é opcional — degrada graciosamente se a chave não estiver configurada.
//
// Suportados:
//   youtube   → YouTube Data API v3 (gratuito, oficial, quota 10k/dia)
//   rapidapi  → RapidAPI scrapers para Instagram/TikTok de terceiros (pago, ~$10/mês)
//
// SocialBlade: scraping público, sem chave, usado automaticamente.

import axios  from 'axios';
import { query } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { decrypt } from '../lib/crypto.js';

// ── Key lookup ────────────────────────────────────────────────────────────
async function getKey(userId, provider) {
  const { rows } = await query(
    `SELECT api_key FROM user_api_keys
     WHERE user_id = $1 AND provider = $2 AND verified = TRUE LIMIT 1`,
    [userId, provider],
  ).catch(() => ({ rows: [] }));
  const raw = rows[0]?.api_key;
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`]
    || (provider === 'rapidapi' ? process.env.RAPIDAPI_KEY : '')
    || (provider === 'apify' ? process.env.APIFY_TOKEN : '');
  return (raw ? decrypt(raw) : null) || envKey || null;
}

// ─────────────────────────────────────────────────────────────────────────
// YOUTUBE DATA API v3
// Docs: https://developers.google.com/youtube/v3
// Gratuita: 10.000 units/dia. Canal público = 1 unit.
// ─────────────────────────────────────────────────────────────────────────
export const youtubeAPI = {

  /**
   * Busca canal por username, handle (@nome) ou channelId.
   * Retorna métricas reais: subscribers, total views, video count.
   */
  async getChannel(identifier, userId) {
    const key = await getKey(userId, 'youtube');
    if (!key) throw new Error('YouTube API key not configured');

    // Try as channelId first, then as username/handle
    const isId = identifier.startsWith('UC');
    const param = isId
      ? `id=${encodeURIComponent(identifier)}`
      : `forHandle=${encodeURIComponent(identifier.replace('@', ''))}`;

    const res = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&${param}&key=${key}`,
      { timeout: 10000 },
    );

    const channel = res.data.items?.[0];
    if (!channel) throw new Error(`Canal não encontrado: ${identifier}`);

    const stats = channel.statistics;
    return {
      id:              channel.id,
      title:           channel.snippet.title,
      description:     channel.snippet.description?.slice(0, 300),
      customUrl:       channel.snippet.customUrl,
      country:         channel.snippet.country,
      publishedAt:     channel.snippet.publishedAt,
      thumbnail:       channel.snippet.thumbnails?.high?.url,
      subscribers:     parseInt(stats.subscriberCount || 0),
      totalViews:      parseInt(stats.viewCount || 0),
      videoCount:      parseInt(stats.videoCount || 0),
      hiddenSubscribers: stats.hiddenSubscriberCount,
    };
  },

  /**
   * Retorna os últimos N vídeos do canal com métricas.
   */
  async getVideos(channelId, userId, maxResults = 10) {
    const key = await getKey(userId, 'youtube');
    if (!key) throw new Error('YouTube API key not configured');

    // Step 1: get uploads playlist id
    const chanRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${key}`,
      { timeout: 10000 },
    );
    const playlistId = chanRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) throw new Error('Playlist de uploads não encontrada');

    // Step 2: get playlist items
    const plRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${maxResults}&key=${key}`,
      { timeout: 10000 },
    );
    const videoIds = plRes.data.items.map(i => i.snippet.resourceId.videoId).join(',');
    if (!videoIds) return [];

    // Step 3: get video statistics
    const vidRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${key}`,
      { timeout: 10000 },
    );

    return vidRes.data.items.map(v => ({
      id:           v.id,
      title:        v.snippet.title,
      publishedAt:  v.snippet.publishedAt,
      thumbnail:    v.snippet.thumbnails?.medium?.url,
      views:        parseInt(v.statistics.viewCount || 0),
      likes:        parseInt(v.statistics.likeCount || 0),
      comments:     parseInt(v.statistics.commentCount || 0),
      engagementRate: v.statistics.viewCount > 0
        ? ((parseInt(v.statistics.likeCount || 0) + parseInt(v.statistics.commentCount || 0)) / parseInt(v.statistics.viewCount) * 100).toFixed(2)
        : '0',
    }));
  },
};

// ─────────────────────────────────────────────────────────────────────────
// SOCIALBLADE (scraping público — sem chave necessária)
// Dados: ranking, grade, subscriber/view growth estimate
// ─────────────────────────────────────────────────────────────────────────
export const socialBlade = {

  async getYouTube(channelId) {
    try {
      const res = await axios.get(
        `https://socialblade.com/youtube/channel/${channelId}`,
        {
          timeout: 12000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
      );

      const html = res.data;
      const extract = (pattern) => {
        const m = html.match(pattern);
        return m ? m[1].trim() : null;
      };

      // Grade (A+, A, B, C...)
      const grade = extract(/id="YouTubeSBRank"[^>]*>.*?<span[^>]*>([A-Z][+-]?)<\/span>/s)
                 || extract(/grade.*?>([A-Z][+-]?)</i);

      // Monthly subs estimate
      const monthlySubs = extract(/Monthly Subscribers[^>]*>[^<]*<[^>]*>([^<]+)/i);
      const monthlyViews = extract(/Monthly Video Views[^>]*>[^<]*<[^>]*>([^<]+)/i);

      return {
        source:       'socialblade',
        grade:        grade || 'N/A',
        monthlySubs:  monthlySubs || 'N/A',
        monthlyViews: monthlyViews || 'N/A',
        url:          `https://socialblade.com/youtube/channel/${channelId}`,
      };
    } catch (err) {
      logger.warn(`[SocialBlade] Failed: ${err.message}`);
      return { source: 'socialblade', error: 'SocialBlade unavailable', grade: null };
    }
  },

  async getInstagram(username) {
    try {
      const res = await axios.get(
        `https://socialblade.com/instagram/user/${username}`,
        {
          timeout: 12000,
          headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120 Safari/537.36' },
        },
      );
      const html = res.data;
      const grade = html.match(/Grade.*?>([A-Z][+-]?)</i)?.[1] || 'N/A';
      return {
        source:  'socialblade',
        grade,
        url:     `https://socialblade.com/instagram/user/${username}`,
      };
    } catch (err) {
      logger.warn(`[SocialBlade] Instagram failed: ${err.message}`);
      return { source: 'socialblade', error: 'SocialBlade unavailable', grade: null };
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────
// RAPIDAPI — scrapers para Instagram e TikTok de terceiros
// Chave paga (~$10/mês). Permite ver métricas de qualquer perfil público.
// Docs: https://rapidapi.com/hub (buscar "instagram scraper" ou "tiktok scraper")
// ─────────────────────────────────────────────────────────────────────────
export const rapidAPI = {

  async getInstagramProfile(username, userId) {
    const key = await getKey(userId, 'rapidapi');
    if (!key) throw new Error('RapidAPI key not configured');

    // Uses: instagram-scraper-api2.p.rapidapi.com (popular, ~$10/mês)
    const res = await axios.get(
      `https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`,
      {
        timeout: 15000,
        headers: {
          'X-RapidAPI-Key':  key,
          'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com',
        },
      },
    );

    const d = res.data?.data || res.data;
    return {
      username:         d.username,
      fullName:         d.full_name,
      bio:              d.biography?.slice(0, 200),
      followers:        d.follower_count,
      following:        d.following_count,
      posts:            d.media_count,
      isVerified:       d.is_verified,
      isPrivate:        d.is_private,
      profilePicUrl:    d.profile_pic_url,
      engagementRate:   d.engagement_rate || null,
      avgLikes:         d.avg_likes || null,
    };
  },

  async getTikTokProfile(username, userId) {
    const key = await getKey(userId, 'rapidapi');
    if (!key) throw new Error('RapidAPI key not configured');

    const res = await axios.get(
      `https://tiktok-scraper7.p.rapidapi.com/user/info?unique_id=${encodeURIComponent(username.replace('@', ''))}`,
      {
        timeout: 15000,
        headers: {
          'X-RapidAPI-Key':  key,
          'X-RapidAPI-Host': 'tiktok-scraper7.p.rapidapi.com',
        },
      },
    );

    const d = res.data?.data?.user || res.data;
    const stats = res.data?.data?.stats || {};
    return {
      username:       d.uniqueId || username,
      nickname:       d.nickname,
      bio:            d.signature?.slice(0, 200),
      followers:      stats.followerCount,
      following:      stats.followingCount,
      likes:          stats.heartCount,
      videos:         stats.videoCount,
      isVerified:     d.verified,
      profilePicUrl:  d.avatarThumb,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// UNIFIED PROFILE ANALYZER
// Tries all available data sources and merges results
// ─────────────────────────────────────────────────────────────────────────
export async function analyzeProfile({ platform, identifier, userId }) {
  const result = { platform, identifier, sources: [] };

  if (platform === 'youtube') {
    try {
      const channel = await youtubeAPI.getChannel(identifier, userId);
      result.channel = channel;
      result.sources.push('youtube-api');

      // Enrich with SocialBlade
      const sb = await socialBlade.getYouTube(channel.id);
      if (!sb.error) { result.socialBlade = sb; result.sources.push('socialblade'); }

      // Get recent videos
      const videos = await youtubeAPI.getVideos(channel.id, userId, 5).catch(() => []);
      if (videos.length) { result.recentVideos = videos; result.sources.push('videos'); }
    } catch (err) {
      result.error = err.message;
    }
  }

  if (platform === 'instagram') {
    try {
      // Try RapidAPI first (real data)
      const profile = await rapidAPI.getInstagramProfile(identifier, userId);
      result.profile = profile;
      result.sources.push('rapidapi-instagram');

      // Add SocialBlade grade
      const sb = await socialBlade.getInstagram(identifier.replace('@', ''));
      if (!sb.error) { result.socialBlade = sb; result.sources.push('socialblade'); }
    } catch (err) {
      result.error = err.message;
      result.note  = 'Instagram real data requires a RapidAPI key';
    }
  }

  if (platform === 'tiktok') {
    try {
      const profile = await rapidAPI.getTikTokProfile(identifier, userId);
      result.profile = profile;
      result.sources.push('rapidapi-tiktok');
    } catch (err) {
      result.error = err.message;
      result.note  = 'TikTok real data requires a RapidAPI key';
    }
  }

  return result;
}

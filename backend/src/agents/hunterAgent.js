// agents/hunterAgent.js — v17
// Hunter Agent: profile analysis with real API data + intelligent fallback.
// Deduplication: hunterAgent handles @handles/profile URLs.
//                researchAgent handles general market research queries.
// Real data: YouTube Data API v3 → RapidAPI → SocialBlade scrape → LLM-only fallback

import { chat }        from '../lib/provider-manager.js';
import { log }         from '../core/logger.js';
import { youtubeAPI, rapidAPI, socialBlade } from '../integrations/social-apis.js';

const TASK_PATTERNS = {
  compare_profiles: /compar[ae]|versus|vs\.?\s|x\s+@|diferença entre|melhor entre/i,
  build_persona:    /persona|avatar|público.alvo|audiência|perfil de cliente|ICP/i,
  analyze_profile:  /.*/,
};

function detectTask(msg)   { for (const [t, re] of Object.entries(TASK_PATTERNS)) if (re.test(msg)) return t; return 'analyze_profile'; }
function extractProfiles(msg) {
  const p = [];
  for (const m of msg.matchAll(/https?:\/\/(www\.)?(instagram|tiktok|youtube)\.com\/[@]?([^\s?#/]+)/gi)) p.push('@' + m[3].replace(/^@/,''));
  for (const m of msg.matchAll(/(?:^|\s)(@[a-z0-9_.]+)/gi)) { const h = m[1]; if (!p.includes(h)) p.push(h); }
  return p;
}
function detectPlatform(msg, handle = '') {
  const ctx = (msg + ' ' + handle).toLowerCase();
  if (ctx.includes('youtube') || ctx.includes('youtu.be') || ctx.includes(' yt')) return 'youtube';
  if (ctx.includes('tiktok') || ctx.includes(' tt')) return 'tiktok';
  return 'instagram';
}

// ── Fetch real data with graceful fallback chain ───────────────────────────
async function fetchProfileData(handle, platform, userId) {
  const identifier = handle.replace(/^@/, '');
  const errors = [];

  // 1. YouTube Data API (free, accurate)
  if (platform === 'youtube') {
    try {
      const data = await youtubeAPI.getChannel(identifier, userId);
      const recent = await youtubeAPI.getVideos(data.id, userId, 5).catch(() => []);
      return { source: 'youtube_api', channel: data, recentVideos: recent, reliable: true };
    } catch (err) { errors.push(`YouTube API: ${err.message}`); }
  }

  // 2. RapidAPI (paid — Instagram/TikTok)
  try {
    const data = await rapidAPI.getProfile(handle, platform, userId);
    if (data) return { source: 'rapidapi', profile: data, reliable: true };
  } catch (err) { errors.push(`RapidAPI: ${err.message}`); }

  // 3. SocialBlade (free scrape)
  try {
    const data = await socialBlade.getStats(handle, platform);
    if (data) return { source: 'socialblade', stats: data, reliable: false };
  } catch (err) { errors.push(`SocialBlade: ${err.message}`); }

  // 4. LLM-only analysis (fallback — clearly marked as estimate)
  log('warn', `[HunterAgent] No real data for ${handle} — using LLM estimate. Errors: ${errors.join('; ')}`);
  return { source: 'llm_estimate', handle, platform, reliable: false, errors };
}

// ── Build LLM prompt from real data or estimate ───────────────────────────
function buildAnalysisPrompt(handle, platform, task, realData, message) {
  let dataSection = '';

  if (realData.source === 'youtube_api' && realData.channel) {
    const c = realData.channel;
    dataSection = `DADOS REAIS (YouTube API):
- Canal: ${c.title}
- Subscribers: ${c.subscriberCount?.toLocaleString('pt-BR')}
- Total views: ${c.viewCount?.toLocaleString('pt-BR')}
- Vídeos: ${c.videoCount}
- País: ${c.country || 'N/A'}
- Descrição: ${c.description?.slice(0,200)}
${realData.recentVideos?.length ? `- Vídeos recentes: ${realData.recentVideos.map(v => `"${v.title}" (${v.views} views)`).join(', ')}` : ''}`;
  } else if (realData.source === 'rapidapi' && realData.profile) {
    const p = realData.profile;
    dataSection = `DADOS REAIS (${platform}):
- Perfil: ${p.username || handle}
- Seguidores: ${p.follower_count?.toLocaleString('pt-BR') || 'N/A'}
- Posts: ${p.media_count || 'N/A'}
- Engajamento estimado: ${p.engagement_rate || 'N/A'}`;
  } else if (realData.source === 'socialblade') {
    dataSection = `DADOS (SocialBlade — estimativas):
${JSON.stringify(realData.stats, null, 2).slice(0, 500)}`;
  } else {
    dataSection = `⚠️ Dados reais indisponíveis para ${handle}.
Faça análise baseada em conhecimento geral do criador, se conhecido.
SEMPRE deixe claro que são estimativas quando não houver dados reais.`;
  }

  const taskDesc = task === 'compare_profiles'
    ? 'Compare os perfis e diga qual tem melhor estratégia e por quê'
    : task === 'build_persona'
    ? 'Construa um avatar/persona detalhado do público-alvo deste criador'
    : 'Faça uma análise completa de crescimento, engajamento e estratégia de conteúdo';

  return `Analise o perfil ${handle} (${platform}).
Pedido: "${message}"
Task: ${taskDesc}

${dataSection}

Forneça análise estruturada em português com:
1. Resumo do perfil e métricas
2. Análise de estratégia de conteúdo
3. Pontos fortes e fracos
4. Oportunidades identificadas
5. Recomendações práticas e acionáveis

${!realData.reliable ? '⚠️ AVISO: dados baseados em estimativas — confirme com dados reais quando possível.' : ''}`;
}

// ── Main agent ────────────────────────────────────────────────────────────
export async function hunterAgent({ userId, message, context = [], tools = {} }) {
  log('info', `[HunterAgent] "${message.slice(0, 80)}"`);

  const task     = detectTask(message);
  const profiles = extractProfiles(message);

  if (!profiles.length) {
    // No handle detected — conversational mode
    const content = await chat(
      [{ role: 'system', content: 'Você é especialista em análise de perfis de criadores de conteúdo. Responda em português.' },
       ...context.slice(-6), { role: 'user', content: message }],
      { userId, max_tokens: 1500 },
    );
    return { content, metadata: { task: 'conversational', agent: 'hunter' } };
  }

  const platform  = detectPlatform(message, profiles[0]);
  const analysisResults = [];

  for (const handle of profiles.slice(0, 3)) {
    const realData = await fetchProfileData(handle, platform, userId);
    const prompt   = buildAnalysisPrompt(handle, platform, task, realData, message);

    const analysis = await chat(
      [{ role: 'system', content: 'Você é um analista de marketing digital especializado em criadores de conteúdo. Seja direto, analítico e prático. Responda em português.' },
       { role: 'user', content: prompt }],
      { userId, max_tokens: 2500 },
    );
    analysisResults.push({ handle, platform, analysis, dataSource: realData.source });
  }

  const content = analysisResults.map(r =>
    `## ${r.handle} (${r.platform})\n_Fonte de dados: ${r.dataSource}_\n\n${r.analysis}`
  ).join('\n\n---\n\n');

  return { content, metadata: { task, profiles, platform, agent: 'hunter' } };
}

export default hunterAgent;

import { Router } from 'express';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { requireAuth } from '../middleware/auth.js';
import { getDatabaseStatus, query } from '../db/index.js';
import { skillManager } from '../skills/skill-manager.js';
import { workflowOrchestrator } from '../modules/workflow-orchestrator.js';
import { checkCamilla } from '../integrations/camilla.js';
import { analyzeProfile } from '../integrations/social-apis.js';
import { researchAgent } from '../agents/researchAgent.js';
import { getSettingsProviderCatalog } from '../lib/settings-catalog.js';
import { config } from '../config/index.js';

const router = Router();
const exec = promisify(execCallback);

async function getProvidersForUser(userId) {
  const catalog = getSettingsProviderCatalog();
  const [{ rows: keyRows }, { rows: providerRows }] = await Promise.all([
    query(
      `SELECT provider, COUNT(*) AS key_count, MAX(verified::int) AS has_verified
       FROM user_api_keys
       WHERE user_id = $1
       GROUP BY provider`,
      [userId],
    ),
    query(
      `SELECT provider, active, priority
       FROM user_providers
       WHERE user_id = $1`,
      [userId],
    ),
  ]);

  const keyByProvider = Object.fromEntries(keyRows.map(row => [row.provider, row]));
  const flagsByProvider = Object.fromEntries(providerRows.map(row => [row.provider, row]));

  return catalog.map(provider => ({
    ...provider,
    keyCount: parseInt(keyByProvider[provider.id]?.key_count ?? 0),
    hasVerified: !!keyByProvider[provider.id]?.has_verified,
    active: !!flagsByProvider[provider.id]?.active,
    priority: parseInt(flagsByProvider[provider.id]?.priority ?? 0),
  }));
}

async function getAudioHealth() {
  try {
    const version = await checkCamilla();
    return { camilla: true, version, status: 'ok' };
  } catch (error) {
    return {
      camilla: false,
      status: 'degraded',
      error: error.message,
      note: 'ir-processor fallback is active',
    };
  }
}

async function getVideoHealth() {
  try {
    const { stdout } = await exec('ffmpeg -version');
    return {
      ffmpeg: true,
      status: 'ok',
      version: stdout.split('\n')[0],
    };
  } catch {
    return {
      ffmpeg: false,
      status: 'degraded',
    };
  }
}

function formatCompact(value) {
  if (value == null || Number.isNaN(Number(value))) return 'N/D';
  const numeric = Number(value);
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
  return String(numeric);
}

function buildFallbackResearchReport(platform, target, raw) {
  if (!raw || raw.error) {
    return `Nao foi possivel gerar um relatorio completo para ${target} em ${platform}. ${raw?.error || 'Verifique as chaves do provider e tente novamente.'}`;
  }

  const profile = raw.channel || raw.profile || {};
  const lines = [
    `Analise real coletada para ${target} em ${platform}.`,
    '',
  ];

  if (profile.title || profile.username || profile.nickname) {
    lines.push(`Perfil: ${profile.title || profile.username || profile.nickname}`);
  }

  const metrics = [];
  if (profile.subscribers != null) metrics.push(`Inscritos: ${formatCompact(profile.subscribers)}`);
  if (profile.followers != null) metrics.push(`Seguidores: ${formatCompact(profile.followers)}`);
  if (profile.totalViews != null) metrics.push(`Views totais: ${formatCompact(profile.totalViews)}`);
  if (profile.videoCount != null) metrics.push(`Videos: ${profile.videoCount}`);
  if (profile.posts != null) metrics.push(`Posts: ${profile.posts}`);
  if (profile.likes != null) metrics.push(`Curtidas: ${formatCompact(profile.likes)}`);
  if (profile.engagementRate != null) metrics.push(`Engajamento: ${profile.engagementRate}%`);
  if (metrics.length) {
    lines.push(`Metricas: ${metrics.join(' | ')}`);
  }

  if (profile.description || profile.bio) {
    lines.push('');
    lines.push(`Bio: ${(profile.description || profile.bio).slice(0, 240)}`);
  }

  if (raw.recentVideos?.length) {
    lines.push('');
    lines.push('Ultimos videos:');
    raw.recentVideos.slice(0, 5).forEach((video, index) => {
      lines.push(
        `${index + 1}. ${video.title} | ${formatCompact(video.views)} views | ${formatCompact(video.likes)} likes`,
      );
    });
  }

  if (raw.socialBlade?.grade) {
    lines.push('');
    lines.push(`SocialBlade: nota ${raw.socialBlade.grade}`);
  }

  return lines.join('\n');
}

function normalizeResearchTarget(platform, target) {
  const value = String(target || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (platform === 'youtube' && value.startsWith('UC')) return value;
  return value.startsWith('@') ? value : `@${value}`;
}

router.get('/health', async (req, res) => {
  const database = getDatabaseStatus();
  const [audio, video] = await Promise.all([getAudioHealth(), getVideoHealth()]);

  res.json({
    status: database.connected ? 'ok' : 'degraded',
    service: 'botsquad-backend',
    version: '22.0.0',
    time: new Date().toISOString(),
    database,
    audio,
    video,
  });
});

router.get('/agents', requireAuth, async (req, res) => {
  const skills = skillManager.listarSkills();
  const workflows = workflowOrchestrator.listarWorkflows();

  const [
    audioHealth,
    videoHealth,
    providers,
    { rows: memoryRows },
    { rows: conversationRows },
    { rows: socialRows },
  ] = await Promise.all([
    getAudioHealth(),
    getVideoHealth(),
    getProvidersForUser(req.user.id),
    query('SELECT COUNT(*)::int AS count FROM memory WHERE user_id = $1', [req.user.id]).catch(() => ({ rows: [{ count: 0 }] })),
    query('SELECT COUNT(*)::int AS count FROM conversations WHERE user_id = $1', [req.user.id]).catch(() => ({ rows: [{ count: 0 }] })),
    query(
      `SELECT provider FROM user_api_keys
       WHERE user_id = $1 AND verified = TRUE AND provider IN ('youtube', 'rapidapi')`,
      [req.user.id],
    ).catch(() => ({ rows: [] })),
  ]);

  const verifiedProviderCount = providers.filter(provider => provider.hasVerified).length;
  const researchSkillCount = skills.filter(skill => (
    (skill.dominios || []).includes('research') || (skill.dominios || []).includes('hunter')
  )).length;
  const monetizationSkillCount = skills.filter(skill => (skill.dominios || []).includes('monetization')).length;
  const youtubeReady = socialRows.some(row => row.provider === 'youtube');
  const rapidApiReady = socialRows.some(row => row.provider === 'rapidapi');

  res.json({
    items: [
      {
        id: 'video',
        name: 'Video Agent',
        route: '/video',
        category: 'Studio',
        status: videoHealth.ffmpeg ? 'ready' : 'degraded',
        summary: 'Pipeline real de edicao, cortes, captions e export.',
        metrics: [
          videoHealth.ffmpeg ? 'FFmpeg online' : 'FFmpeg degradado',
          videoHealth.version || 'Sem versao detectada',
        ],
      },
      {
        id: 'audio',
        name: 'Audio Agent',
        route: '/audio',
        category: 'Studio',
        status: audioHealth.camilla ? 'ready' : 'fallback',
        summary: 'FFmpeg + CamillaDSP + IR processing com jobs reais.',
        metrics: [
          audioHealth.camilla ? 'CamillaDSP online' : 'Fallback IR ativo',
          audioHealth.version || audioHealth.note || 'Status de audio disponivel',
        ],
      },
      {
        id: 'research',
        name: 'Research Agent',
        route: '/investigator?preset=research',
        category: 'Intelligence',
        status: youtubeReady || rapidApiReady ? 'ready' : 'setup',
        summary: 'Pesquisa e analise de mercado com skills e APIs sociais.',
        metrics: [
          `${researchSkillCount} skills de pesquisa`,
          youtubeReady || rapidApiReady ? 'Dados sociais habilitados' : 'Configure YouTube API ou RapidAPI',
        ],
      },
      {
        id: 'investigator',
        name: 'Profile Investigator',
        route: '/investigator?preset=profile',
        category: 'Intelligence',
        status: youtubeReady || rapidApiReady ? 'ready' : 'setup',
        summary: 'Analise real de perfis YouTube, Instagram e TikTok.',
        metrics: [
          youtubeReady ? 'YouTube API pronta' : 'YouTube API ausente',
          rapidApiReady ? 'RapidAPI pronta' : 'RapidAPI ausente',
        ],
      },
      {
        id: 'product',
        name: 'Product Agent',
        route: '/skills?domain=monetization&focus=infoproduct_builder',
        category: 'Monetization',
        status: monetizationSkillCount > 0 ? 'ready' : 'limited',
        summary: 'Fluxos reais para infoproduto, oferta e validacao.',
        metrics: [
          `${monetizationSkillCount} skills de monetizacao`,
          `${workflows.length} workflows disponiveis`,
        ],
      },
      {
        id: 'skills',
        name: 'Skills Agent',
        route: '/skills',
        category: 'Operations',
        status: skills.length ? 'ready' : 'limited',
        summary: 'Biblioteca viva com skills e workflows executaveis.',
        metrics: [
          `${skills.length} skills reais`,
          `${workflows.length} workflows`,
        ],
      },
      {
        id: 'memory',
        name: 'Memory Agent',
        route: '/memory',
        category: 'Operations',
        status: 'ready',
        summary: 'Memoria persistente compartilhada entre skills.',
        metrics: [
          `${memoryRows[0]?.count || 0} memorias`,
          `${conversationRows[0]?.count || 0} conversas`,
        ],
      },
      {
        id: 'settings',
        name: 'API Keys / Providers',
        route: '/settings',
        category: 'Control',
        status: verifiedProviderCount > 0 ? 'ready' : 'setup',
        summary: 'Providers, chaves mascaradas, ativacao e status real.',
        metrics: [
          `${verifiedProviderCount} providers verificados`,
          `${providers.length} providers suportados`,
        ],
      },
    ],
  });
});

router.get('/skills', requireAuth, async (req, res) => {
  const items = skillManager.listarSkills(req.query.domain ? { dominio: req.query.domain } : {});
  const stats = skillManager.stats();
  const workflows = workflowOrchestrator.listarWorkflows();

  res.json({
    items,
    stats,
    workflows,
  });
});

router.get('/providers', requireAuth, async (req, res) => {
  const [items, { rows: keys }] = await Promise.all([
    getProvidersForUser(req.user.id),
    query(
      `SELECT id, provider, model, verified, updated_at, key_slot,
              LEFT(api_key, 4) || '...' AS key_preview
       FROM user_api_keys
       WHERE user_id = $1
       ORDER BY provider, key_slot`,
      [req.user.id],
    ),
  ]);

  res.json({
    items,
    keys,
  });
});

router.get('/integrations', requireAuth, async (req, res) => {
  const [{ rows: driveRows }, { rows: socialRows }] = await Promise.all([
    query(
      `SELECT id
       FROM user_api_keys
       WHERE user_id = $1 AND provider = 'google_drive' AND verified = TRUE`,
      [req.user.id],
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT provider
       FROM user_api_keys
       WHERE user_id = $1 AND verified = TRUE AND provider IN ('youtube', 'rapidapi', 'apify', 'meta', 'tiktok')`,
      [req.user.id],
    ).catch(() => ({ rows: [] })),
  ]);

  const connectedProviders = new Set(socialRows.map(row => row.provider));

  res.json({
    items: [
      {
        id: 'google_drive',
        name: 'Google Drive',
        status: driveRows.length ? 'connected' : (config.google.clientId ? 'available' : 'disabled'),
        configured: !!config.google.clientId,
        connected: driveRows.length > 0,
      },
      {
        id: 'youtube',
        name: 'YouTube API',
        status: connectedProviders.has('youtube') ? 'connected' : 'setup',
        connected: connectedProviders.has('youtube'),
      },
      {
        id: 'rapidapi',
        name: 'RapidAPI',
        status: connectedProviders.has('rapidapi') ? 'connected' : 'setup',
        connected: connectedProviders.has('rapidapi'),
      },
      {
        id: 'apify',
        name: 'Apify',
        status: connectedProviders.has('apify') ? 'connected' : 'setup',
        connected: connectedProviders.has('apify'),
      },
      {
        id: 'meta',
        name: 'Instagram / Meta',
        status: connectedProviders.has('meta') ? 'connected' : 'setup',
        connected: connectedProviders.has('meta'),
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        status: connectedProviders.has('tiktok') ? 'connected' : 'setup',
        connected: connectedProviders.has('tiktok'),
      },
    ],
  });
});

router.post('/research/analyze', requireAuth, async (req, res) => {
  const { platform, target, url, q } = req.body || {};
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const input = target || url || q;

  if (!normalizedPlatform || !input) {
    return res.status(400).json({ error: 'platform e target sao obrigatorios' });
  }

  if (!['youtube', 'instagram', 'tiktok'].includes(normalizedPlatform)) {
    return res.status(400).json({ error: 'platform deve ser youtube, instagram ou tiktok' });
  }

  const normalizedTarget = normalizeResearchTarget(normalizedPlatform, input);

  try {
    const raw = await analyzeProfile({
      platform: normalizedPlatform,
      identifier: normalizedTarget,
      userId: req.user.id,
    });

    let report = buildFallbackResearchReport(normalizedPlatform, normalizedTarget, raw);
    let metadata = {
      platform: normalizedPlatform,
      target: normalizedTarget,
      source: raw?.sources || [],
    };

    try {
      const prompt = /^https?:\/\//i.test(normalizedTarget)
        ? `Analise este perfil ${normalizedTarget}`
        : `Analise o perfil ${normalizedTarget} no ${normalizedPlatform}`;
      const analysis = await researchAgent({
        userId: req.user.id,
        message: prompt,
        context: [],
        tools: {},
      });

      if (analysis?.content) {
        report = analysis.content;
        metadata = { ...metadata, ...(analysis.metadata || {}) };
      }
    } catch {
      // Fallback report already built from real API data.
    }

    res.json({
      platform: normalizedPlatform,
      target: normalizedTarget,
      raw,
      report,
      metadata,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Falha ao analisar perfil' });
  }
});

export default router;

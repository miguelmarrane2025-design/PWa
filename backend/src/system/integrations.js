import { query } from '../db/index.js';
import { decrypt } from '../lib/crypto.js';
import { config } from '../config/index.js';

export function maskSecret(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length <= 8) return 'configured';
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

function boolFromEnv(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function envValue(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value != null && String(value).trim() !== '') return value;
  }
  return null;
}

async function getUserKeyMap(userId) {
  if (!userId) return {};
  try {
    const { rows } = await query(
      `SELECT provider, api_key, verified
       FROM user_api_keys
       WHERE user_id = $1
         AND provider IN ('youtube', 'rapidapi', 'apify', 'meta', 'tiktok', 'google_drive', 'dropbox')
       ORDER BY updated_at DESC`,
      [userId],
    );

    const map = {};
    for (const row of rows) {
      if (!row.verified || map[row.provider]) continue;
      try {
        map[row.provider] = decrypt(row.api_key);
      } catch {
        map[row.provider] = row.api_key;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function makeIntegration({
  id,
  label,
  category,
  configured,
  enabled,
  secret,
  description,
  envVar,
  extra = {},
  status,
}) {
  const resolvedStatus = status || (
    configured
      ? (enabled === false ? 'offline' : 'configured')
      : (enabled ? 'offline' : 'not_configured')
  );

  return {
    id,
    label,
    category,
    configured,
    enabled,
    maskedKey: maskSecret(secret),
    status: resolvedStatus,
    description,
    envVar,
    ...extra,
  };
}

export async function getSystemIntegrations(userId = null) {
  const userKeys = await getUserKeyMap(userId);

  const youtubeKey = userKeys.youtube || envValue('YOUTUBE_API_KEY');
  const rapidApiKey = userKeys.rapidapi || envValue('RAPIDAPI_API_KEY', 'RAPIDAPI_KEY');
  const apifyToken = userKeys.apify || envValue('APIFY_API_TOKEN', 'APIFY_API_KEY', 'APIFY_TOKEN');
  const tiktokKey = userKeys.tiktok || envValue('TIKTOK_API_KEY');
  const instagramKey = userKeys.meta || envValue('META_API_KEY', 'INSTAGRAM_API_KEY');
  const googleDriveToken = userKeys.google_drive || envValue('GOOGLE_DRIVE_REFRESH_TOKEN');
  const dropboxToken = userKeys.dropbox || envValue('DROPBOX_ACCESS_TOKEN', 'DROPBOX_TOKEN');

  const googleDriveConfigured = Boolean(
    googleDriveToken
    || (config.google.clientId && config.google.clientSecret)
  );
  const googleDriveEnabled = boolFromEnv(process.env.GOOGLE_DRIVE_ENABLED, googleDriveConfigured);
  const driveMemoryEnabled = boolFromEnv(process.env.DRIVE_MEMORY_ENABLED, false);

  const integrations = [
    makeIntegration({
      id: 'youtube',
      label: 'YouTube API',
      category: 'social_research',
      configured: Boolean(youtubeKey),
      enabled: Boolean(youtubeKey),
      secret: youtubeKey,
      description: 'Usado para análise de canais e vídeos.',
      envVar: 'YOUTUBE_API_KEY',
    }),
    makeIntegration({
      id: 'rapidapi',
      label: 'RapidAPI',
      category: 'social_research',
      configured: Boolean(rapidApiKey),
      enabled: Boolean(rapidApiKey),
      secret: rapidApiKey,
      description: 'Fallback para análise de Instagram e TikTok.',
      envVar: 'RAPIDAPI_KEY',
    }),
    makeIntegration({
      id: 'apify',
      label: 'Apify',
      category: 'social_research',
      configured: Boolean(apifyToken),
      enabled: Boolean(apifyToken),
      secret: apifyToken,
      description: 'Automação e coleta opcional de dados sociais.',
      envVar: 'APIFY_API_TOKEN',
    }),
    makeIntegration({
      id: 'tiktok',
      label: 'TikTok Provider',
      category: 'social_research',
      configured: Boolean(tiktokKey),
      enabled: Boolean(tiktokKey),
      secret: tiktokKey,
      description: 'Provider opcional para fluxos TikTok.',
      envVar: 'TIKTOK_API_KEY',
    }),
    makeIntegration({
      id: 'instagram',
      label: 'Instagram Provider',
      category: 'social_research',
      configured: Boolean(instagramKey),
      enabled: Boolean(instagramKey),
      secret: instagramKey,
      description: 'Provider opcional para fluxos Instagram/Meta.',
      envVar: 'META_API_KEY',
    }),
    makeIntegration({
      id: 'google_drive',
      label: 'Google Drive',
      category: 'storage_memory',
      configured: googleDriveConfigured,
      enabled: googleDriveEnabled,
      secret: googleDriveToken || config.google.clientId,
      description: 'Importação de vídeos grandes e memória/sync opcional.',
      envVar: 'GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_REFRESH_TOKEN',
      extra: {
        rootFolderId: envValue('DRIVE_MEMORY_ROOT_FOLDER_ID'),
      },
    }),
    makeIntegration({
      id: 'drive_memory',
      label: 'Drive Memory',
      category: 'storage_memory',
      configured: driveMemoryEnabled,
      enabled: driveMemoryEnabled,
      secret: envValue('DRIVE_MEMORY_ROOT_FOLDER_ID'),
      description: 'Espelho opcional da memória dos agentes no Drive.',
      envVar: 'DRIVE_MEMORY_ENABLED',
      extra: {
        localMirror: envValue('DRIVE_MEMORY_LOCAL_MIRROR') || 'storage/drive-memory',
      },
    }),
    makeIntegration({
      id: 'dropbox',
      label: 'Dropbox',
      category: 'storage_memory',
      configured: Boolean(dropboxToken),
      enabled: Boolean(dropboxToken),
      secret: dropboxToken,
      description: 'Storage opcional para biblioteca e outputs.',
      envVar: 'DROPBOX_ACCESS_TOKEN',
    }),
  ];

  return {
    ok: true,
    integrations,
  };
}

export default {
  maskSecret,
  getSystemIntegrations,
};

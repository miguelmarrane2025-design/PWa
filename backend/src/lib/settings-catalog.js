import { getProviderCatalog } from './provider-manager.js';

export const GENERIC_KEY_PROVIDERS = new Set([
  'rapidapi',
  'apify',
  'meta',
  'tiktok',
]);

export const EXTRA_PROVIDER_CATALOG = [
  {
    id: 'rapidapi',
    label: 'RapidAPI',
    defaultModel: null,
    fastModel: null,
    envKey: 'RAPIDAPI_API_KEY',
    available: !!(process.env.RAPIDAPI_API_KEY || process.env.RAPIDAPI_KEY),
    category: 'integration',
  },
  {
    id: 'apify',
    label: 'Apify',
    defaultModel: null,
    fastModel: null,
    envKey: 'APIFY_API_TOKEN',
    available: !!(process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY || process.env.APIFY_TOKEN),
    category: 'integration',
  },
  {
    id: 'meta',
    label: 'Instagram / Meta',
    defaultModel: null,
    fastModel: null,
    envKey: 'META_API_KEY',
    available: !!process.env.META_API_KEY,
    category: 'integration',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    defaultModel: null,
    fastModel: null,
    envKey: 'TIKTOK_API_KEY',
    available: !!process.env.TIKTOK_API_KEY,
    category: 'integration',
  },
  {
    id: 'youtube',
    label: 'YouTube API',
    defaultModel: null,
    fastModel: null,
    envKey: 'YOUTUBE_API_KEY',
    available: !!process.env.YOUTUBE_API_KEY,
    category: 'integration',
  },
  {
    id: 'google_drive',
    label: 'Google Drive',
    defaultModel: null,
    fastModel: null,
    envKey: 'GOOGLE_DRIVE_CLIENT_ID',
    available: !!(process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
    category: 'integration',
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    defaultModel: null,
    fastModel: null,
    envKey: 'DROPBOX_ACCESS_TOKEN',
    available: !!(process.env.DROPBOX_ACCESS_TOKEN || process.env.DROPBOX_TOKEN),
    category: 'integration',
  },
];

export function getSettingsProviderCatalog() {
  return [...getProviderCatalog(), ...EXTRA_PROVIDER_CATALOG];
}

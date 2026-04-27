import { Router } from 'express';
import { getSystemDiagnostics } from '../system/catalog.js';
import { getDatabaseStatus, query } from '../db/index.js';
import { checkCamilla } from '../integrations/camilla.js';
import { getSystemProviderStatus } from '../system/providers.js';
import { getSystemIntegrations } from '../system/integrations.js';
import { optionalAuth } from '../middleware/auth.js';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const router = Router();
const exec = promisify(execCallback);

router.use(optionalAuth);

async function getAudioHealth() {
  try {
    const version = await checkCamilla();
    return { camilla: true, version, status: 'ok' };
  } catch (error) {
    return { camilla: false, status: 'degraded', error: error.message };
  }
}

async function getVideoHealth() {
  try {
    const { stdout } = await exec('ffmpeg -version');
    return { ffmpeg: true, status: 'ok', version: stdout.split('\n')[0] };
  } catch {
    return { ffmpeg: false, status: 'degraded' };
  }
}

router.get('/health', async (req, res) => {
  const [audio, video] = await Promise.all([getAudioHealth(), getVideoHealth()]);
  const diagnostics = await getSystemDiagnostics();
  const providerStatus = getSystemProviderStatus();
  const integrationStatus = await getSystemIntegrations(req.user?.id || null);
  const integrations = Object.fromEntries(
    (integrationStatus.integrations || []).map(item => [item.id, item.status]),
  );
  let database = 'degraded';
  try {
    await query('SELECT 1');
    database = 'ok';
  } catch {
    database = 'degraded';
  }
  const agentsCount = diagnostics.agents?.length || diagnostics.stats?.agentsCount || 0;
  const skillsCount = diagnostics.skills?.length || diagnostics.stats?.skillsCount || 0;
  const reviewersCount = diagnostics.reviewers?.length
    || diagnostics.skills?.filter(skill => skill.isReviewer).length
    || diagnostics.stats?.reviewersCount
    || 0;
  const providersCount = (providerStatus.providers || []).filter(item => item.configured || item.enabled).length;

  res.json({
    ok: true,
    backend: database === 'ok' ? 'healthy' : 'degraded',
    status: database === 'ok' ? 'ok' : 'degraded',
    service: 'botsquad-backend',
    agentsCount,
    skillsCount,
    reviewersCount,
    providersCount,
    integrations,
    database,
    audio: audio.status || 'degraded',
    video: video.status || 'degraded',
    privateMode: process.env.APP_PRIVATE_MODE === 'true',
    disablePublicRegistration: process.env.DISABLE_PUBLIC_REGISTRATION === 'true',
    details: {
      database: getDatabaseStatus(),
      audio,
      video,
    },
  });
});

router.get('/providers', async (req, res) => {
  res.json(getSystemProviderStatus());
});

router.get('/integrations', async (req, res) => {
  res.json(await getSystemIntegrations(req.user?.id || null));
});

router.get('/agents', async (req, res) => {
  const diagnostics = await getSystemDiagnostics();
  res.json({
    agents: diagnostics.agents,
    skills: diagnostics.skills,
    orphanAgents: diagnostics.orphanAgents,
    orphanSkills: diagnostics.orphanSkills,
    duplicateMappings: diagnostics.duplicateMappings,
    activeMappings: diagnostics.activeMappings,
    missingRequiredAgents: diagnostics.missingRequiredAgents,
    missingRequiredSkills: diagnostics.missingRequiredSkills,
    inactiveMappings: diagnostics.inactiveMappings,
    health: diagnostics.health,
  });
});

router.get('/skills', async (req, res) => {
  const diagnostics = await getSystemDiagnostics();
  const filteredSkills = req.query.domain
    ? diagnostics.skills.filter(skill => (skill.dominios || []).includes(String(req.query.domain)))
    : diagnostics.skills;

  res.json({
    agents: diagnostics.agents,
    skills: filteredSkills,
    orphanAgents: diagnostics.orphanAgents,
    orphanSkills: diagnostics.orphanSkills,
    duplicateMappings: diagnostics.duplicateMappings,
    activeMappings: diagnostics.activeMappings,
    missingRequiredAgents: diagnostics.missingRequiredAgents,
    missingRequiredSkills: diagnostics.missingRequiredSkills,
    inactiveMappings: diagnostics.inactiveMappings,
    workflows: diagnostics.workflows,
    stats: diagnostics.stats,
    health: diagnostics.health,
  });
});

export default router;

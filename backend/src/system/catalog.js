import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { skillManager } from '../skills/skill-manager.js';
import { workflowOrchestrator } from '../modules/workflow-orchestrator.js';
import { checkCamilla } from '../integrations/camilla.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const AGENTS_ROOT = path.resolve(__dirname, '../agents');
const EXECUTORS_ROOT = path.resolve(__dirname, '../skills/executors');
const LOCAL_SKILLS_ROOT = path.resolve(REPO_ROOT, 'skills');

const AGENT_ALIASES = {
  'audio/audioGearSquad.js': 'audio_gear_squad',
  'audio/gearVisionAgent.js': 'gear_vision',
  'agency/agencyCommandSquad.js': 'agency_command_squad',
  'audioAgent.js': 'audio',
  'channel-niche/channelNicheResearchSquad.js': 'channel_niche_research_squad',
  'carouselAssemblerAgent.js': 'carousel_assembler',
  'creative-review/creativeReviewSquad.js': 'creative_review_squad',
  'contentAgent.js': 'content',
  'copy/copySquad.js': 'copy_squad',
  'dark-channel/darkChannelSquad.js': 'dark_channel_squad',
  'growth/channelGrowthStrategistAgent.js': 'channel_growth_strategist',
  'growth/competitorGapAgent.js': 'competitor_gap',
  'growth/contentPatternAnalystAgent.js': 'content_pattern_analyst',
  'growth/hookResearchAgent.js': 'hook_research',
  'growth/profileInvestigatorAgent.js': 'profile_investigator',
  'hunterAgent.js': 'hunter',
  'infoproduct/infoProductPublishingSquad.js': 'infoproduct_publishing_squad',
  'imagePromptDirectorAgent.js': 'carousel_image_prompt_director',
  'infoproduct/infoproductSquad.js': 'infoproduct_squad',
  'marketing/marketingStrategySquad.js': 'marketing_strategy_squad',
  'niche/nicheVisionarySquad.js': 'niche_visionary_squad',
  'researchAgent.js': 'research',
  'reviewers/qualityReviewAgent.js': 'quality_review',
  'thumbnail/thumbnailSquad.js': 'thumbnail_squad',
  'traffic/trafficScaleSquad.js': 'traffic_scale_squad',
  'video/captionStyleAgent.js': 'caption_style_agent',
  'video/socialMetadataAgent.js': 'social_metadata_agent',
  'video/videoClipDirectorAgent.js': 'video_clip_director',
  'video/videoCuttingSquad.js': 'video_cutting_squad',
  'videoAgent.js': 'video',
  'visual/visualSquad.js': 'visual_squad',
  'visualAgent.js': 'visual',
};

const AGENT_META = {
  audio: { name: 'Audio Agent', category: 'Studio', route: '/audio' },
  audio_gear_squad: { name: 'Audio Gear Squad', category: 'Studio', route: '/skills?focus=audio_gear_squad' },
  gear_vision: { name: 'Gear Vision', category: 'Studio', route: '/audio' },
  agency_command_squad: { name: 'Agency Command Squad', category: 'Operations', route: '/skills?focus=agency_command_squad' },
  carousel_assembler: { name: 'Carousel Assembler', category: 'Studio', route: '/chat' },
  carousel_image_prompt_director: { name: 'Carousel Image Prompt Director', category: 'Studio', route: '/chat' },
  caption_style_agent: { name: 'Caption Style Agent', category: 'Studio', route: '/skills?focus=caption_style_agent' },
  channel_niche_research_squad: { name: 'Channel Niche Research Squad', category: 'Intelligence', route: '/skills?focus=channel_niche_research_squad' },
  channel_growth_strategist: { name: 'Channel Growth Strategist', category: 'Intelligence', route: '/skills?focus=growth_strategy' },
  competitor_gap: { name: 'Competitor Gap', category: 'Intelligence', route: '/skills?focus=competitor_gap' },
  content: { name: 'Content Agent', category: 'Content', route: '/chat' },
  content_pattern_analyst: { name: 'Content Pattern Analyst', category: 'Intelligence', route: '/skills?focus=content_pattern_analyst' },
  copy_squad: { name: 'Copy Squad', category: 'Content', route: '/skills?focus=copy_squad' },
  creative_review_squad: { name: 'Creative Review Squad', category: 'Operations', route: '/training' },
  dark_channel_squad: { name: 'Dark Channel Squad', category: 'Monetization', route: '/skills?focus=dark_channel_squad' },
  hook_research: { name: 'Hook Research', category: 'Intelligence', route: '/skills?focus=hook_research' },
  hunter: { name: 'Hunter Agent', category: 'Intelligence', route: '/investigator?preset=profile' },
  infoproduct_publishing_squad: { name: 'Infoproduct Publishing Squad', category: 'Monetization', route: '/skills?focus=infoproduct_publishing_squad' },
  infoproduct_squad: { name: 'Infoproduct Squad', category: 'Monetization', route: '/skills?focus=infoproduct_squad' },
  marketing_strategy_squad: { name: 'Marketing Strategy Squad', category: 'Monetization', route: '/skills?focus=marketing_strategy_squad' },
  niche_visionary_squad: { name: 'Niche Visionary Squad', category: 'Intelligence', route: '/skills?focus=niche_visionary_squad' },
  profile_investigator: { name: 'Profile Investigator', category: 'Intelligence', route: '/investigator?preset=profile' },
  quality_review: { name: 'Quality Review', category: 'Operations', route: '/training' },
  research: { name: 'Research Agent', category: 'Intelligence', route: '/investigator?preset=research' },
  social_metadata_agent: { name: 'Social Metadata Agent', category: 'Studio', route: '/skills?focus=social_metadata_agent' },
  thumbnail_squad: { name: 'Thumbnail Squad', category: 'Studio', route: '/skills?focus=thumbnail_squad' },
  traffic_scale_squad: { name: 'Traffic Scale Squad', category: 'Monetization', route: '/skills?focus=traffic_scale_squad' },
  video: { name: 'Video Agent', category: 'Studio', route: '/video' },
  video_clip_director: { name: 'Video Clip Director', category: 'Studio', route: '/skills?focus=video_clip_director' },
  video_cutting_squad: { name: 'Video Cutting Squad', category: 'Studio', route: '/video' },
  visual: { name: 'Visual Agent', category: 'Studio', route: '/chat' },
  visual_squad: { name: 'Visual Squad', category: 'Studio', route: '/chat' },
};

const REQUIRED_AGENT_IDS = [
  'copy_squad',
  'infoproduct_squad',
  'audio_gear_squad',
  'gear_vision',
  'thumbnail_squad',
  'visual_squad',
  'carousel_image_prompt_director',
  'carousel_assembler',
  'video_clip_director',
  'caption_style_agent',
  'social_metadata_agent',
  'quality_review',
  'profile_investigator',
  'content_pattern_analyst',
  'hook_research',
  'competitor_gap',
  'channel_growth_strategist',
  'channel_niche_research_squad',
  'video_cutting_squad',
];

const REQUIRED_SKILL_IDS = [
  'copy_squad',
  'infoproduct_squad',
  'audio_gear_squad',
  'gear_vision',
  'thumbnail_squad',
  'carousel_image_prompt_director',
  'carousel_assembler',
  'video_clip_director',
  'caption_style_agent',
  'social_metadata_agent',
  'quality_review',
  'profile_investigator',
  'hook_research',
  'competitor_gap',
  'growth_strategy',
  'channel_niche_research_squad',
  'video_cutting_squad',
];

const CORE_AGENT_IDS = ['audio', 'content', 'hunter', 'research', 'video', 'visual'];

function humanizeId(id) {
  return String(id || '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeIdKey(value) {
  return String(value || '').replace(/[-_]/g, '').toLowerCase();
}

function normalizeDomain(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function mergeSkillShapes(primary, extra) {
  return {
    ...primary,
    localPath: extra.path,
    localSource: extra.source,
    inputSchema: primary.inputSchema || extra.inputSchema || {},
    outputSchema: primary.outputSchema || extra.outputSchema || {},
  };
}

async function walkFiles(root, relative = '') {
  const dir = path.join(root, relative);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.includes('.bak')) continue;
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, rel));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
      files.push(rel);
    }
  }
  return files;
}

async function scanAgentEntries() {
  const files = await walkFiles(AGENTS_ROOT);
  const items = [];
  for (const relPath of files) {
    if (relPath.endsWith('orchestrator.js') || relPath.includes('.bak')) continue;
    if (!relPath.endsWith('.js')) continue;
    const id = AGENT_ALIASES[relPath] || relPath.replace(/\.js$/i, '').replace(/[\\/]/g, '_');
    const meta = AGENT_META[id] || {};
    items.push({
      id,
      name: meta.name || humanizeId(id),
      category: meta.category || 'Operations',
      route: meta.route || '/chat',
      status: 'ready',
      summary: meta.summary || `Agente conectado a partir de ${relPath}.`,
      source: 'backend-agent',
      path: path.relative(REPO_ROOT, path.join(AGENTS_ROOT, relPath)),
      kind: 'agent',
    });
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

async function scanLocalSkills() {
  const entries = await fs.readdir(LOCAL_SKILLS_ROOT, { withFileTypes: true }).catch(() => []);
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillJsonPath = path.join(LOCAL_SKILLS_ROOT, entry.name, 'skill.json');
    const raw = await fs.readFile(skillJsonPath, 'utf8').catch(() => null);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      items.push({
        id: parsed.id || entry.name,
        nome: parsed.name || parsed.title || humanizeId(entry.name),
        descricao: parsed.description || 'Skill local encontrada em skills/.',
        dominios: normalizeDomain(parsed.domain || parsed.domains),
        executor: parsed.executor || null,
        inputSchema: parsed.input || {},
        outputSchema: parsed.output || {},
        source: 'local-skill-json',
        path: path.relative(REPO_ROOT, skillJsonPath),
        kind: 'local-skill',
      });
    } catch {
      // Ignore malformed manifest.
    }
  }
  return items;
}

async function scanExecutors() {
  const files = await walkFiles(EXECUTORS_ROOT);
  return files
    .filter(file => file.endsWith('.js'))
    .map(file => ({
      id: file.replace(/\.js$/i, ''),
      path: path.relative(REPO_ROOT, path.join(EXECUTORS_ROOT, file)),
    }));
}

async function getMappingSnapshot() {
  const orchestrator = await import('../agents/orchestrator.js');
  const activeMappings = Object.entries(orchestrator.DOMAIN_TASK_TO_SKILL || {}).map(([intent, skillId]) => ({
    intent,
    skillId,
  }));
  const duplicateBuckets = new Map();
  for (const mapping of activeMappings) {
    if (!duplicateBuckets.has(mapping.intent)) duplicateBuckets.set(mapping.intent, []);
    duplicateBuckets.get(mapping.intent).push(mapping.skillId);
  }
  const duplicateMappings = Array.from(duplicateBuckets.entries())
    .filter(([, values]) => new Set(values).size > 1)
    .map(([intent, values]) => ({ intent, skillIds: values }));
  return { activeMappings, duplicateMappings };
}

export async function getVideoHealthSummary() {
  try {
    const { execSync } = await import('child_process');
    const stdout = execSync('ffmpeg -version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { status: 'ok', ffmpeg: true, version: stdout.split('\n')[0] };
  } catch {
    return { status: 'degraded', ffmpeg: false };
  }
}

export async function getAudioHealthSummary() {
  try {
    const version = await checkCamilla();
    return { status: 'ok', camilla: true, version };
  } catch (error) {
    return { status: 'degraded', camilla: false, error: error.message };
  }
}

export async function listSystemAgents() {
  return scanAgentEntries();
}

export async function listSystemSkills({ domain = null } = {}) {
  const managed = skillManager.listarSkills(domain ? { dominio: domain } : {});
  const localSkills = await scanLocalSkills();
  const workflows = workflowOrchestrator.listarWorkflows();
  const items = [...managed];
  const seen = new Map(items.map(item => [normalizeIdKey(item.id), item]));

  for (const localSkill of localSkills) {
    if (domain && !(localSkill.dominios || []).includes(domain)) continue;
    const key = normalizeIdKey(localSkill.id);
    if (seen.has(key)) {
      Object.assign(seen.get(key), mergeSkillShapes(seen.get(key), localSkill));
      continue;
    }
    items.push(localSkill);
    seen.set(key, localSkill);
  }

  return {
    items: items.sort((a, b) => (a.nome || a.id).localeCompare(b.nome || b.id)),
    workflows,
    stats: skillManager.stats(),
  };
}

export async function getSystemDiagnostics() {
  const [agents, skillsCatalog, executors, mappings, audioHealth, videoHealth] = await Promise.all([
    listSystemAgents(),
    listSystemSkills(),
    scanExecutors(),
    getMappingSnapshot(),
    getAudioHealthSummary(),
    getVideoHealthSummary(),
  ]);

  const skills = skillsCatalog.items;
  const agentIds = new Set(agents.map(agent => agent.id));
  const skillIds = new Set(skills.map(skill => skill.id));
  const executorIds = new Set(executors.map(executor => executor.id));

  const orphanAgents = agents.filter(agent => {
    const key = normalizeIdKey(agent.id);
    return REQUIRED_AGENT_IDS.includes(agent.id) || CORE_AGENT_IDS.includes(agent.id)
      ? false
      : !skillIds.has(agent.id) && !Array.from(skillIds).some(skillId => normalizeIdKey(skillId) === key);
  });

  const orphanSkills = skills.filter(skill => {
    if (!skill.executor) return false;
    return !executorIds.has(skill.executor);
  });

  const missingRequiredAgents = REQUIRED_AGENT_IDS.filter(id => !agentIds.has(id));
  const missingRequiredSkills = REQUIRED_SKILL_IDS.filter(id => !skillIds.has(id));
  const inactiveMappings = mappings.activeMappings.filter(mapping => !skillIds.has(mapping.skillId));

  return {
    agents,
    skills,
    orphanAgents,
    orphanSkills,
    duplicateMappings: mappings.duplicateMappings,
    activeMappings: mappings.activeMappings,
    missingRequiredAgents,
    missingRequiredSkills,
    inactiveMappings,
    workflows: skillsCatalog.workflows,
    stats: skillsCatalog.stats,
    health: {
      backend: { status: 'ok' },
      audio: audioHealth,
      video: videoHealth,
    },
  };
}

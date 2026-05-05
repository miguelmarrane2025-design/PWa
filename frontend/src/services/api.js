import axios from 'axios';

function normalizeApiBase(raw) {
  if (!raw) return null;
  const value = String(raw).trim().replace(/\/+$/, '');
  if (!value) return null;
  return value.endsWith('/api') ? value : `${value}/api`;
}

function resolveBaseUrl() {
  const configured =
    normalizeApiBase(import.meta?.env?.VITE_API_URL) ||
    normalizeApiBase(import.meta?.env?.VITE_BACKEND_URL);

  return configured || '/api';
}

export const BASE = resolveBaseUrl();
const api  = axios.create({ baseURL: BASE, timeout: 30000 });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => res.data,
  err => {
    if (!err.response) {
      return Promise.reject(new Error(
        `Servidor inacessível (${BASE}). Verifique se o backend está rodando e se /api está publicado corretamente no domínio.`,
      ));
    }
    if (err.response?.status === 413) {
      return Promise.reject(new Error('Arquivo muito grande. Verifique client_max_body_size do Nginx.'));
    }
    if (err.response?.status === 415) {
      return Promise.reject(new Error('Formato não suportado. Use MP4, MOV, MKV ou WEBM.'));
    }
    return Promise.reject(new Error(
      err.response?.data?.error
      ?? err.response?.data?.message
      ?? err.message
      ?? 'Erro desconhecido',
    ));
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  register: d => api.post('/auth/register', d),
  login:    d => api.post('/auth/login',    d),
  forgotPassword: d => api.post('/auth/forgot-password', d),
  resetPassword:  d => api.post('/auth/reset-password', d),
  me:       () => api.get('/auth/me'),
};

// ── Agents ────────────────────────────────────────────────────────────────
export const agentsApi = {
  health: () => api.get('/system/health'),
  list:   () => api.get('/system/agents'),
  tools:  () => api.get('/system/tools'),
};

// ── Chat ──────────────────────────────────────────────────────────────────
export const chatApi = {
  getConversations:   ()      => api.get('/chat/conversations'),
  createConversation: t       => api.post('/chat/conversations', { title: t }),
  renameConversation: (id, t) => api.patch(`/chat/conversations/${id}`, { title: t }),
  deleteConversation: id      => api.delete(`/chat/conversations/${id}`),
  getMessages:        id      => api.get(`/chat/conversations/${id}/messages`),
  sendMessage: (id, msg, files = [], agentHint = null) => {
    const fd = new FormData();
    const hint = agentHint
      ? String(agentHint).trim().toLowerCase().replace(/\s+/g, '-')
      : null;
    fd.append('message', hint ? `[agent:${hint}] ${msg}` : msg);
    files.forEach(f => fd.append('files', f));
    return api.post(`/chat/conversations/${id}/messages`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ── Audio ─────────────────────────────────────────────────────────────────
export const audioApi = {
  getHealth:    ()   => api.get('/audio/health'),
  getConfigs:   ()   => api.get('/audio/configs'),

  // Standard process — pass a pre-built FormData with all params
  processAudioRaw: fd => api.post('/audio/process', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Simple shortcut (used by legacy paths)
  processAudio: (file, cfg = 'default') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('config', cfg);
    return api.post('/audio/process', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },

  // Blend two IRs
  blendIRs: fd => api.post('/audio/blend', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  analyzePedalboard: fdOrPayload => {
    if (fdOrPayload instanceof FormData) {
      return api.post('/audio/pedalboard/analyze', fdOrPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post('/audio/pedalboard/analyze', fdOrPayload || {});
  },

  getJob:    id => api.get(`/audio/jobs/${id}`),
  getJobs:   () => api.get('/audio/jobs'),

  downloadJob: async (jobId, filename = 'botsquad-ir.wav') => {
    const token = localStorage.getItem('token');
    const res   = await fetch(`${BASE}/audio/jobs/${jobId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const headerName = filenameFromDisposition(res.headers.get('content-disposition'));
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = headerName || filename; a.click();
    URL.revokeObjectURL(url);
  },
};

function filenameFromDisposition(value = '') {
  value = value || '';
  const utf = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf) return decodeURIComponent(utf[1].replace(/"/g, ''));
  const plain = value.match(/filename="?([^";]+)"?/i);
  return plain?.[1] || null;
}

// ── Usage ─────────────────────────────────────────────────────────────────
export const usageApi = {
  getToday: () => api.get('/settings/usage'),
};

// ── Video ─────────────────────────────────────────────────────────────────
export const videoApi = {
  upload: (formData, onUploadProgress) => api.post('/video/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
    onUploadProgress,
  }),

  initUpload: data => api.post('/video/upload/init', data),
  uploadInit: data => api.post('/video/upload/init', data),
  uploadChunk: (formData, onUploadProgress) => api.post('/video/upload/chunk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
    onUploadProgress,
  }),
  completeUpload: data => api.post('/video/upload/complete', data),
  uploadComplete: data => api.post('/video/upload/complete', data),
  importUrl: data => api.post('/video/import-url', data, { timeout: 10 * 60 * 1000 }),
  importServerFile: data => api.post('/video/import-server-file', data),
  createJob: data => api.post('/video/pipeline/jobs', data),
  createPipelineJob: data => api.post('/video/pipeline/jobs', data),
  createSquadJob: data => api.post('/video/squad/jobs', data, { timeout: 10 * 60 * 1000 }),
  analyzeVideo: data => api.post('/video/analyze', data, { timeout: 10 * 60 * 1000 }),
  generateEditPlan: data => api.post('/video/edit-plan/generate', data, { timeout: 10 * 60 * 1000 }),
  renderEditPlan: data => api.post('/video/render', data, { timeout: 10 * 60 * 1000 }),
  getVideoJob: jobId => api.get(`/video/jobs/${jobId}`),
  getRenderResults: jobId => api.get(`/video/results/${jobId}`),
  getVideoToolsStatus: () => api.get('/video/tools/status'),
  getVideoProToolchainStatus: () => api.get('/video/pro-toolchain/status'),
  getVideoProPresets: () => api.get('/video/pro/presets'),
  getVideoProColorPresets: () => api.get('/video/pro/color-presets'),
  getVideoProAudioPresets: () => api.get('/video/pro/audio-presets'),
  analyzeVideoPro: data => api.post('/video/pro/analyze', data, { timeout: 10 * 60 * 1000 }),
  getVideoHighlightsPro: data => api.post('/video/pro/highlights', data, { timeout: 10 * 60 * 1000 }),
  createVideoEditPlanPro: data => api.post('/video/pro/edit-plan', data, { timeout: 10 * 60 * 1000 }),
  reviewVideoSupervisorPro: data => api.post('/video/pro/supervisor/review', data, { timeout: 10 * 60 * 1000 }),
  renderVideoPro: data => api.post('/video/pro/render', data, { timeout: 10 * 60 * 1000 }),
  validateVideoOutputPro: data => api.post('/video/pro/validate-output', data, { timeout: 10 * 60 * 1000 }),
  runSmartCut: data => api.post('/video/smartcut', data, { timeout: 10 * 60 * 1000 }),

  // Poll job status
  getJob:  (jobId) => api.get(`/video/pipeline/jobs/${jobId}`),
  getPipelineJob:  (jobId) => api.get(`/video/pipeline/jobs/${jobId}`),
  getSquadJob: (jobId) => api.get(`/video/squad/jobs/${jobId}`),
  getJobs: ()      => api.get('/video/pipeline/jobs'),
  getDownloadToken: (jobId, fileName) => api.get('/video/download-token', {
    params: { jobId, file: fileName },
  }),

  chat: (message, context = []) => api.post('/video/chat', { message, context }),
  listEditPlans: () => api.get('/video/edit-plans'),
  createEditPlan: data => api.post('/video/edit-plans', data),
  updateEditPlan: (id, data) => api.put(`/video/edit-plans/${id}`, data),
  deleteEditPlan: id => api.delete(`/video/edit-plans/${id}`),
  duplicateEditPlan: id => api.post(`/video/edit-plans/${id}/duplicate`),
  listPlanReferences: id => api.get(`/video/edit-plans/${id}/references`),
  addPlanReference: (id, formData) => api.post(`/video/edit-plans/${id}/references`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  }),
  listReferences: (planId = null) => api.get('/video/references', { params: planId ? { planId } : {} }),
  createReference: data => api.post('/video/references', data),
  updateReference: (id, data) => api.put(`/video/references/${id}`, data),
  uploadReference: (id, formData) => api.post(`/video/references/${id}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  }),
  deleteReference: id => api.delete(`/video/references/${id}`),
  getReferenceAnalysis: id => api.get(`/video/references/${id}/analysis`),
  createEditingReferenceLink: data => api.post('/video/editing-references/link', data),
  uploadReferenceVideo: (formData, onUploadProgress) => api.post('/video/reference-videos', formData, {
    timeout: 10 * 60 * 1000,
    onUploadProgress,
  }),
  listReferenceVideos: () => api.get('/video/reference-videos'),
  analyzeStyleFromReferenceVideo: data => api.post('/video/analyze-style', data || {}),
  uploadEditingReference: formData => api.post('/video/editing-references/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  }),
  listEditingReferences: () => api.get('/video/editing-references'),
  analyzeEditingReference: id => api.post(`/video/editing-references/${id}/analyze`, {}),
  getEditingReferenceAnalysis: id => api.get(`/video/editing-references/${id}/analysis`),
  uploadTutorialReference: formData => api.post('/video/references/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  }),
  analyzeTutorialReference: data => api.post('/video/references/analyze', data, { timeout: 10 * 60 * 1000 }),
  getReferenceLearningJob: jobId => api.get(`/video/references/jobs/${jobId}`),
  getReferenceTutorialAnalysis: id => api.get(`/video/references/${id}/analysis`),
  savePresetFromReference: data => api.post('/video/edit-presets/save-from-reference', data),
  editingLibraryPlans: () => api.get('/video/editing-library/plans'),
  createEditingLibraryPlan: data => api.post('/video/editing-library/plans', data),
  updateEditingLibraryPlan: (id, data) => api.put(`/video/editing-library/plans/${id}`, data),
  deleteEditingLibraryPlan: id => api.delete(`/video/editing-library/plans/${id}`),
  uploadEditingLibraryReference: formData => api.post('/video/editing-library/references/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  }),
  listEditingLibraryReferences: () => api.get('/video/editing-library/references'),
  analyzeEditingLibraryReference: id => api.post(`/video/editing-library/references/${id}/analyze`, {}),
  supervisorSuggest: data => api.post('/video/editing-library/supervisor/suggest', data),
  supervisorValidate: data => api.post('/video/editing-library/supervisor/validate', data),
  analyzeReferenceStyle: id => api.post(`/video/references/${id}/analyze-style`, {}),
  analyzeReferenceFrames: id => api.post(`/video/references/${id}/analyze-frames`, {}),
  getReferenceFrameCuts: id => api.get(`/video/references/${id}/frame-cuts`),
  getEditPresets: presetId => api.get('/video/editing-presets', { params: presetId ? { presetId } : {} }),

  // Motor Pro — import leve + referência
  importVideoLight: data => api.post('/video/import-light', data, { timeout: 5 * 60 * 1000 }),
  analyzeVideoReference: data => api.post('/video/pro/analyze-reference', data, { timeout: 10 * 60 * 1000 }),
  renderWithReference: data => api.post('/video/pro/render-with-reference', data, { timeout: 15 * 60 * 1000 }),

  health: () => api.get('/video/health'),
};

export const carouselApi = {
  promptPack: data => api.post('/carousel/prompts/generate', data),
  plan: data => api.post('/carousel/plan', data),
  render: data => api.post('/carousel/render', { ...data, manualFallback: true }),
  uploadImages: (planId, files) => {
    const fd = files instanceof FormData ? files : new FormData();
    if (!(files instanceof FormData)) {
      (files || []).forEach(file => fd.append('images', file));
    }
    return api.post(`/carousel/${planId}/images`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 2 * 60 * 1000,
    });
  },
  finalize: planId => api.post(`/carousel/${planId}/finalize`, {}, { timeout: 2 * 60 * 1000 }),
};

// ── Memory ────────────────────────────────────────────────────────────────
export const memoryApi = {
  getMemories:  s         => api.get('/memory', { params: s ? { search: s } : {} }),
  addMemory:    (c, tags) => api.post('/memory', { content: c, tags }),
  deleteMemory: id        => api.delete(`/memory/${id}`),
};

// ── Skills ────────────────────────────────────────────────────────────────
export const skillsApi = {
  list:      async domain => {
    const data = await api.get('/system/skills', { params: domain ? { domain } : {} });
    return data.skills || data.items || data;
  },
  catalog:   domain    => api.get('/system/skills', { params: domain ? { domain } : {} }),
  stats:     ()        => api.get('/skills/stats'),
  workflows: ()        => api.get('/skills/workflows'),
  runSkill:  (id, params, files = []) => {
    if (files.length > 0) {
      const fd = new FormData();
      Object.entries(params).forEach(([k, v]) => v != null && fd.append(k, String(v)));
      files.forEach(f => fd.append('files', f));
      return api.post(`/skills/${id}/run`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    return api.post(`/skills/${id}/run`, params);
  },
  runWorkflow: (id, params) => api.post(`/skills/workflows/${id}/run`, params),
};

// ── Training ──────────────────────────────────────────────────────────────
export const trainingApi = {
  sendFeedback: data => api.post('/training/feedback', data),
  approvePrompt: data => api.post('/training/approve-prompt', data),
  rejectPrompt: data => api.post('/training/reject-prompt', data),
  getMemory: agentId => api.get(`/training/memory/${agentId}`),
  getMemoryItems: (agentId, type) => api.get(`/training/memory/${agentId}/${type}`),
  getTokenBudget: () => api.get('/training/token-budget'),
  listAgents: () => api.get('/training/agents'),
  bootstrap: () => api.post('/training/bootstrap'),
  audit: () => api.post('/training/audit'),
  command: message => api.post('/training/command', { message }),
  getProfile: id => api.get(`/training/agents/${id}/profile`),
  addRule: (id, rule) => api.post(`/training/agents/${id}/rules`, rule),
  listRules: id => api.get(`/training/agents/${id}/rules`),
  addFeedback: (id, data) => api.post(`/training/agents/${id}/feedback`, data),
  getPlaybook: id => api.get(`/training/agents/${id}/playbook`),
  buildPlaybook: id => api.post(`/training/agents/${id}/playbook/build`),
};

export const expertiseApi = {
  bootstrap: () => api.post('/expertise/bootstrap'),
  getAgent: id => api.get(`/expertise/agents/${id}`),
};

export const fitnessApi = {
  getProfile: () => api.get('/fitness/profile'),
  getCurrentPlan: () => api.get('/fitness/plan/current'),
  getCheckins: () => api.get('/fitness/checkins'),
  getExercises: () => api.get('/fitness/exercises'),
  generatePlan: data => api.post('/fitness/plan/generate', data),
  checkin: data => api.post('/fitness/checkin', data),
  expertMode: data => api.post('/fitness/expert', data),
  exportPdf: async (plan) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/fitness/export-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) {
      let message = 'Erro ao exportar PDF.';
      try {
        const data = await res.json();
        message = data?.error || data?.message || message;
      } catch {}
      throw new Error(message);
    }
    const disposition = res.headers.get('content-disposition') || '';
    const filename = filenameFromDisposition(disposition) || 'fitness-plan.pdf';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  },
};

export const thumbApi = {
  generate: data => api.post('/thumb/generate', data),
};

export const sportsApi = {
  providers: () => api.get('/sports/providers'),
  usage: () => api.get('/sports/usage'),
  analyze: message => api.post('/sports/analyze', { message }),
  researchFeed: data => api.post('/sports/research-feed', data),
  analyzeToday: league => api.post('/sports/analyze-today', { league }),
  saveResult: data => api.post('/sports/save-result', data),
};

// ── Settings / API Keys ───────────────────────────────────────────────────
export const settingsApi = {
  getApiKeys:       ()                          => api.get('/settings/apikeys'),
  getStatus:        ()                          => api.get('/settings/apikeys/status'),
  getSystemProviders: ()                        => api.get('/system/providers'),
  getSystemIntegrations: ()                     => api.get('/system/integrations'),
  getProviders:     ()                          => api.get('/settings/providers'),
  getModels:        (provider, key)             => api.get(`/settings/models?provider=${provider}${key ? `&key=${encodeURIComponent(key)}` : ''}`),
  saveApiKey:       (provider, key, model, slot = 0) => api.post('/settings/apikeys', { provider, api_key: key, model, slot }),
  testProvider:     provider                    => api.post(`/settings/providers/${provider}/test`),
  updateModel:      (provider, model)           => api.patch(`/settings/apikeys/${provider}/model`, { model }),
  updateOpenAIModel:(model)                     => api.patch('/settings/apikeys/openai/model', { model }),
  setProviderState: (provider, active, priority = 0) => api.patch(`/settings/providers/${provider}`, { active, priority }),
  deleteApiKey:     (provider)                  => api.delete(`/settings/apikeys/${provider}`),
  deleteKeySlot:    (provider, slot)            => api.delete(`/settings/apikeys/${provider}/${slot}`),
  ollamaStatus:     ()                          => api.get('/settings/ollama/status'),
  saveOllama:       (host, model)               => api.post('/settings/apikeys', { provider: 'ollama', api_key: host || 'local', model }),
};


// ── Drive ─────────────────────────────────────────────────────────────────
export const driveApi = {
  status:     () => api.get('/drive/status'),
  getAuthUrl: () => api.get('/drive/auth'),
  listFiles:  () => api.get('/drive/files'),
  disconnect: () => api.delete('/drive/disconnect'),
};


// ── Social APIs ──────────────────────────────────────────────────────────
export const socialApi = {
  getProfile:   (platform, q) => api.get('/social/profile', { params: { platform, q } }),
  getKeysStatus: ()           => api.get('/social/keys/status'),
};

// ── v26 Dashboard / Catalog ──────────────────────────────────────────────
export const catalogApi = {
  getAgents:       ()       => api.get('/agents'),
  getSkills:       (domain) => api.get('/skills', { params: domain ? { domain } : {} }),
  getProviders:    ()       => api.get('/providers'),
  getIntegrations: ()       => api.get('/integrations'),
  getHealth:       ()       => api.get('/health'),
  getSystemProviders: ()    => api.get('/system/providers'),
  getSystemIntegrations: () => api.get('/system/integrations'),
  getSystemHealth: ()       => api.get('/system/health'),
  getSystemAgents: ()       => api.get('/system/agents'),
  getSystemSkills: (domain) => api.get('/system/skills', { params: domain ? { domain } : {} }),
};

// ── Research / Investigator ──────────────────────────────────────────────
export const researchApi = {
  analyze:        payload => api.post('/research/analyze', payload),
  analyzeProfile: data    => api.post('/research/analyze', data),
  compare:        data    => api.post('/research/compare', data),
  trends:         data    => api.post('/research/trends', data),
  profileReal:    data    => api.post('/research/profile', data),
  trendsDetect:   data    => api.post('/research/trends-detect', data),
  status:         ()      => api.get('/research/status'),
};

export const healthApi = {
  check: () => api.get('/health'),
};

export const integrationsApi = researchApi;

export default api;

export function resolveDownloadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  const value = String(pathOrUrl);
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  const base = BASE || "/api";

  if (value.startsWith("/")) {
    if (base === "/api") return value.startsWith("/api/") ? value : `/api${value}`;
    return `${String(base).replace(/\/$/, "")}${value}`;
  }

  return `${String(base).replace(/\/$/, "")}/${value}`;
}

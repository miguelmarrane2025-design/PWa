import axios from 'axios';

export const BASE = import.meta.env.VITE_API_URL || '/api';
const api  = axios.create({ baseURL: BASE, timeout: 30000 });

if (typeof window !== 'undefined' && BASE.includes('localhost')) {
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.warn(`[BotSquad] VITE_API_URL usa localhost, mas a página está em ${host}. Ajuste frontend/.env.`);
  }
}

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
        `Servidor inacessível (${BASE}). Verifique se o backend está rodando e se VITE_API_URL aponta para o IP correto.`,
      ));
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
  list: () => api.get('/agents'),
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
    fd.append('message', agentHint ? `[agent:${agentHint}] ${msg}` : msg);
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
  uploadChunk: (formData, onUploadProgress) => api.post('/video/upload/chunk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
    onUploadProgress,
  }),
  completeUpload: data => api.post('/video/upload/complete', data),
  importUrl: data => api.post('/video/import-url', data, { timeout: 10 * 60 * 1000 }),
  importServerFile: data => api.post('/video/import-server-file', data),
  createJob: data => api.post('/video/jobs', data),

  // Edit: sends video + message, returns { jobId } immediately (async processing)
  edit: (formData) => api.post('/video/edit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60 * 1000, // 60s just for upload; processing happens async
  }),

  // Poll job status
  getJob:  (jobId) => api.get(`/video/jobs/${jobId}`),
  getJobs: ()      => api.get('/video/jobs'),

  chat: (message, context = []) => api.post('/video/chat', { message, context }),

  health: () => api.get('/video/health'),
};

export const carouselApi = {
  plan: data => api.post('/carousel/plan', data),
  render: data => api.post('/carousel/render', { ...data, manualFallback: true }),
  uploadImages: (planId, files) => {
    const fd = new FormData();
    files.forEach((file, index) => fd.append(`slide_${String(index + 1).padStart(2, '0')}`, file));
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
  list:      domain    => api.get('/skills', { params: domain ? { domain } : {} }),
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

// ── Settings / API Keys ───────────────────────────────────────────────────
export const settingsApi = {
  getApiKeys:       ()                          => api.get('/settings/apikeys'),
  getStatus:        ()                          => api.get('/settings/apikeys/status'),
  getProviders:     ()                          => api.get('/settings/providers'),
  getModels:        (provider, key)             => api.get(`/settings/models?provider=${provider}${key ? `&key=${encodeURIComponent(key)}` : ''}`),
  saveApiKey:       (provider, key, model, slot = 0) => api.post('/settings/apikeys', { provider, api_key: key, model, slot }),
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
  getAgents:       ()       => api.get('/api/agents'),
  getSkills:       (domain) => api.get('/api/skills', { params: domain ? { domain } : {} }),
  getProviders:    ()       => api.get('/api/providers'),
  getIntegrations: ()       => api.get('/api/integrations'),
  getHealth:       ()       => api.get('/api/health'),
};

// ── Research / Investigator ──────────────────────────────────────────────
export const researchApi = {
  analyze:        payload => api.post('/api/research/analyze', payload),
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

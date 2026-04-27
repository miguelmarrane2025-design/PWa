import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  KeyRound,
  Loader,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { catalogApi, driveApi, settingsApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const PROVIDER_META = {
  openai: { label: 'OpenAI', note: 'GPT, vision, image and speech', url: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Gemini', note: 'Google models and multimodal flows', url: 'https://aistudio.google.com/apikey' },
  anthropic: { label: 'Anthropic', note: 'Claude family', url: 'https://console.anthropic.com/settings/keys' },
  groq: { label: 'Groq', note: 'Ultra-fast inference', url: 'https://console.groq.com/keys' },
  ollama: { label: 'Ollama / Gemma Local', note: 'Gemma local via Ollama, sem API key', url: 'https://ollama.com' },
  openrouter: { label: 'OpenRouter', note: 'Multi-model gateway', url: 'https://openrouter.ai/keys' },
  xai: { label: 'xAI / Grok', note: 'Grok models', url: 'https://x.ai/api' },
  deepseek: { label: 'DeepSeek', note: 'Reasoning and chat', url: 'https://platform.deepseek.com/api_keys' },
  rapidapi: { label: 'RapidAPI', note: 'Instagram/TikTok research data', url: 'https://rapidapi.com/' },
  apify: { label: 'Apify', note: 'Scrapers and automation tokens', url: 'https://console.apify.com/account/integrations' },
  meta: { label: 'Instagram / Meta', note: 'Meta platform access token', url: 'https://developers.facebook.com/' },
  tiktok: { label: 'TikTok', note: 'TikTok platform token', url: 'https://developers.tiktok.com/' },
  youtube: { label: 'YouTube API', note: 'Channel and profile data', url: 'https://console.cloud.google.com/' },
};

function ProviderCard({ provider, selected, onSelect }) {
  const meta = PROVIDER_META[provider.id] || { label: provider.label || provider.id, note: provider.category || 'Provider' };

  return (
    <button
      onClick={() => onSelect(provider.id)}
      className={clsx(
        'group min-w-[240px] rounded-[24px] border p-4 text-left transition duration-300',
        selected
          ? 'border-brand-500/40 bg-brand-500/10'
          : 'border-white/[0.08] bg-[#111116] hover:border-brand-500/30 hover:bg-[#17171d]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{meta.label}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{meta.note}</p>
        </div>
        <span className={clsx(
          'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
          provider.configured
            ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300'
            : provider.enabled
              ? 'border-amber-500/30 bg-amber-500/[0.12] text-amber-200'
              : 'border-white/10 bg-white/[0.06] text-zinc-300',
        )}>
          {provider.configured ? 'configured' : provider.enabled ? 'enabled' : 'setup'}
        </span>
      </div>

      <div className="mt-6 flex items-end justify-between">
        <div>
          <p className="text-2xl font-black text-white">{provider.keyCount || 0}</p>
          <p className="text-xs text-zinc-500">saved keys</p>
        </div>
        <div className="text-right text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          {provider.category === 'integration' ? 'integration' : 'llm'}
        </div>
      </div>
    </button>
  );
}

function KeyCard({ item, onDelete }) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{item.provider}</p>
          <p className="mt-1 text-xs text-zinc-500">
            slot {item.key_slot ?? 0}
            {item.model ? ` | ${item.model}` : ''}
          </p>
        </div>
        <span className={clsx(
          'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
          item.verified ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300' : 'border-white/10 bg-white/[0.06] text-zinc-300',
        )}>
          {item.verified ? 'verified' : 'saved'}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
        <KeyRound size={15} className="shrink-0 text-brand-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-zinc-300">{item.key_preview}</p>
          <p className="mt-1 text-xs text-zinc-500">{new Date(item.updated_at).toLocaleString('pt-BR')}</p>
        </div>
        <button
          onClick={() => onDelete(item.provider, item.key_slot ?? 0)}
          className="btn-ghost rounded-full px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
        >
          <Trash2 size={13} />
          Remove
        </button>
      </div>
    </div>
  );
}

function IntegrationCard({ item, storedKey, onOpenSettings }) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#111116] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{item.label}</p>
          <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
          <p className="mt-2 text-[11px] text-zinc-500">{item.envVar}</p>
        </div>
        <span className={clsx(
          'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
          item.configured
            ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300'
            : item.enabled
              ? 'border-amber-500/30 bg-amber-500/[0.12] text-amber-200'
              : 'border-white/10 bg-white/[0.06] text-zinc-300',
        )}>
          {item.status}
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Masked key</p>
        <p className="mt-2 font-mono text-sm text-zinc-300">{storedKey?.key_preview || item.maskedKey || 'not configured'}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onOpenSettings} className="btn-ghost rounded-full px-3 py-2 text-xs">
          Configurar em Keys
        </button>
        <button onClick={onOpenSettings} className="btn-ghost rounded-full px-3 py-2 text-xs">
          Testar conexão
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setupMode = searchParams.get('setup') === '1';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [providers, setProviders] = useState([]);
  const [socialProviders, setSocialProviders] = useState([]);
  const [keys, setKeys] = useState([]);
  const [systemIntegrations, setSystemIntegrations] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState('openai');
  const [driveStatus, setDriveStatus] = useState(null);
  const [form, setForm] = useState({ key: '', model: '' });
  const [models, setModels] = useState([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const allSelectableProviders = [...providers, ...socialProviders];

  const selectedProvider = useMemo(
    () => allSelectableProviders.find(item => item.id === selectedProviderId) || allSelectableProviders[0],
    [allSelectableProviders, selectedProviderId],
  );

  const providerMeta = PROVIDER_META[selectedProvider?.id] || { label: selectedProvider?.label || selectedProvider?.id || 'Provider' };
  const keysByProvider = useMemo(
    () => keys.reduce((accumulator, item) => {
      (accumulator[item.provider] ||= []).push(item);
      return accumulator;
    }, {}),
    [keys],
  );
  const currentKeys = keysByProvider[selectedProvider?.id] || [];
  const hasAnyVerifiedKey = keys.some(item => item.verified);
  const hasAnyConfiguredProvider = providers.some(item => item.configured);
  const socialResearchIntegrations = systemIntegrations.filter(item => item.category === 'social_research');
  const storageIntegrations = systemIntegrations.filter(item => item.category === 'storage_memory');
  const displayCount = value => (loadError ? '—' : value);

  const load = async () => {
    setLoading(true);
    try {
      const [providerData, authProviderData, keyData, integrationData, driveData] = await Promise.all([
        catalogApi.getSystemProviders(),
        settingsApi.getProviders().catch(() => []),
        settingsApi.getApiKeys().catch(() => []),
        settingsApi.getSystemIntegrations().catch(() => catalogApi.getIntegrations().catch(() => ({ integrations: [], items: [] }))),
        driveApi.status().catch(() => ({ configured: false, connected: false })),
      ]);

      setProviders(providerData.providers || []);
      setSocialProviders((authProviderData || []).filter(item => item.category === 'integration'));
      setKeys(Array.isArray(keyData) ? keyData : []);
      setSystemIntegrations(integrationData.integrations || integrationData.items || []);
      setDriveStatus(driveData);
      setLoadError('');
      if (!selectedProviderId && providerData.providers?.length) {
        setSelectedProviderId(providerData.providers[0].id);
      }
    } catch (error) {
      setLoadError('backend/settings endpoint indisponível');
      toast.error(error.message || 'Nao foi possivel carregar os providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!allSelectableProviders.length) return;
    if (!allSelectableProviders.some(item => item.id === selectedProviderId)) {
      setSelectedProviderId(allSelectableProviders[0].id);
    }
  }, [allSelectableProviders, selectedProviderId]);

  useEffect(() => {
    if (!selectedProvider) return;
    setForm({ key: '', model: selectedProvider.defaultModel || '' });
    setModels([]);
  }, [selectedProvider?.id]);

  const nextSlot = currentKeys.length
    ? Math.max(...currentKeys.map(item => item.key_slot ?? 0)) + 1
    : 0;

  const loadModels = async () => {
    if (!selectedProvider) return;
    if (!form.key.trim() && selectedProvider.id !== 'ollama') return;

    setModelLoading(true);
    try {
      const response = await settingsApi.getModels(
        selectedProvider.id,
        selectedProvider.id === 'ollama' ? (form.key.trim() || 'http://localhost:11434') : form.key.trim(),
      );
      setModels(response.models || []);
      if (!form.model && response.models?.length) {
        setForm(prev => ({ ...prev, model: response.models[0] }));
      }
    } catch {
      setModels([]);
    } finally {
      setModelLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProvider) return;
    const isOllama = selectedProvider.id === 'ollama';
    if (!isOllama && !form.key.trim()) {
      toast.error('Informe uma chave antes de salvar');
      return;
    }

    setSaving(true);
    try {
      if (isOllama) {
        await settingsApi.saveOllama(form.key.trim() || 'http://localhost:11434', form.model || selectedProvider.defaultModel || 'gemma3:27b');
      } else {
        await settingsApi.saveApiKey(selectedProvider.id, form.key.trim(), form.model || undefined, nextSlot);
      }
      toast.success(`${providerMeta.label} salvo com sucesso`);
      await load();
      setForm({ key: '', model: selectedProvider.defaultModel || '' });
      setModels([]);
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel salvar a chave');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider, slot) => {
    try {
      await settingsApi.deleteKeySlot(provider, slot);
      toast.success('Chave removida');
      await load();
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel remover a chave');
    }
  };

  const handleToggleProvider = async () => {
    if (!selectedProvider) return;

    setToggling(true);
    try {
      await settingsApi.setProviderState(selectedProvider.id, !selectedProvider.enabled, selectedProvider.priority || 0);
      toast.success(`${providerMeta.label} ${selectedProvider.enabled ? 'desativado' : 'ativado'}`);
      await load();
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel atualizar o provider');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-zinc-300">
          <Loader size={16} className="animate-spin text-brand-400" />
          Carregando providers e chaves reais...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {setupMode && !hasAnyVerifiedKey && (
        <div className="rounded-[28px] border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-amber-200">Configure pelo menos uma chave para liberar o BotSquad.</p>
              <p className="mt-1 text-sm leading-6 text-amber-100/80">
                A home e o shell v26 estao ativos, mas os fluxos protegidos continuam exigindo provider valido.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[#0f0f14]">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(229,9,20,0.22),_transparent_32%),linear-gradient(135deg,_rgba(255,255,255,0.04),_transparent)] px-6 py-7 sm:px-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400/90">
                <ShieldCheck size={14} />
                Provider Control
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                API Keys e providers ligados ao backend real.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
                Nada aqui e placeholder: os cards leem o catalogo seguro do backend, mostram status mascarado do ambiente e continuam permitindo salvar chaves do usuario sem expor segredo.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Overview</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-4">
                  <p className="text-3xl font-black text-white">{displayCount(providers.length)}</p>
                  <p className="mt-1 text-xs text-zinc-500">AI providers</p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-4">
                  <p className="text-3xl font-black text-white">{displayCount(providers.filter(item => item.configured).length)}</p>
                  <p className="mt-1 text-xs text-zinc-500">providers configurados</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3">
                  <span className="text-sm text-zinc-200">Chaves salvas no usuario</span>
                  <span className="text-sm font-bold text-white">{displayCount(keys.length)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3">
                  <span className="text-sm text-zinc-200">Google Drive</span>
                  <span className={clsx(
                    'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                    driveStatus?.connected ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300' : 'border-white/10 bg-white/[0.06] text-zinc-300',
                  )}>
                    {driveStatus?.connected ? 'connected' : driveStatus?.configured ? 'available' : 'disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3">
                  <span className="text-sm text-zinc-200">Social APIs</span>
                  <span className="text-sm font-bold text-white">{displayCount(socialResearchIntegrations.filter(item => item.configured).length)}</span>
                </div>
              </div>
              {loadError && (
                <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {loadError}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Providers</p>
            <h3 className="mt-2 text-2xl font-black text-white">AI Providers</h3>
          </div>
          <button onClick={load} className="btn-ghost rounded-full px-4 py-2.5 text-sm">
            <RefreshCw size={15} />
            Atualizar
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {providers.map(provider => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              selected={provider.id === selectedProvider?.id}
              onSelect={setSelectedProviderId}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Social Research APIs</p>
          <h3 className="mt-2 text-2xl font-black text-white">YouTube, RapidAPI, Apify e fallbacks</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {socialResearchIntegrations.map(item => (
            <IntegrationCard
              key={item.id}
              item={item}
              storedKey={(keysByProvider[item.id] || [])[0]}
              onOpenSettings={() => setSelectedProviderId(item.id)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Storage & Memory</p>
          <h3 className="mt-2 text-2xl font-black text-white">Google Drive, Drive Memory e Dropbox</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {storageIntegrations.map(item => (
            <IntegrationCard
              key={item.id}
              item={item}
              storedKey={(keysByProvider[item.id] || [])[0]}
              onOpenSettings={() => item.id === 'google_drive' ? navigate('/integrations') : setSelectedProviderId(item.id)}
            />
          ))}
        </div>
      </section>

      {selectedProvider && (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="space-y-5 rounded-[30px] border border-white/10 bg-[#111116] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Selected provider</p>
                <h3 className="mt-2 text-2xl font-black text-white">{providerMeta.label}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{providerMeta.note}</p>
              </div>
              {providerMeta.url ? (
                <a href={providerMeta.url} target="_blank" rel="noreferrer" className="btn-ghost rounded-full px-4 py-2.5 text-sm">
                  <ExternalLink size={15} />
                  Abrir console
                </a>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Status</p>
                <p className="mt-3 text-lg font-bold text-white">{selectedProvider.configured ? 'Configured' : 'Waiting setup'}</p>
                <p className="mt-1 text-sm text-zinc-500">Provider configurado no ambiente ou no backend do usuario.</p>
              </div>
              <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Activation</p>
                <p className="mt-3 text-lg font-bold text-white">{selectedProvider.enabled ? 'Enabled' : 'Disabled'}</p>
                <p className="mt-1 text-sm text-zinc-500">OpenAI fica ativa por padrao quando configurada.</p>
              </div>
              <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Masked key</p>
                <p className="mt-3 text-sm font-mono text-white">{selectedProvider.maskedKey || 'not configured'}</p>
                <p className="mt-1 text-sm text-zinc-500">Nunca exibimos a chave completa no frontend.</p>
              </div>
              <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Default models</p>
                <p className="mt-3 text-sm font-semibold text-white">{selectedProvider.models?.strong || 'N/D'}</p>
                <p className="mt-1 text-xs text-zinc-500">strong</p>
                <p className="mt-3 text-sm font-semibold text-white">{selectedProvider.models?.mini || 'N/D'}</p>
                <p className="mt-1 text-xs text-zinc-500">mini</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Provider status do ambiente</p>
                  <p className="mt-1 text-xs text-zinc-500">Leitura segura de `backend/.env` e `.env`, sem expor segredos.</p>
                </div>
                <span className={clsx(
                  'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                  selectedProvider.configured
                    ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300'
                    : 'border-white/10 bg-white/[0.06] text-zinc-300',
                )}>
                  {selectedProvider.status || 'unknown'}
                </span>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Toggle provider</p>
                  <p className="mt-1 text-xs text-zinc-500">Ativar ou desativar o provider sem apagar as chaves.</p>
                </div>
                <button
                  onClick={handleToggleProvider}
                  disabled={toggling}
                  className={clsx(
                    'btn rounded-full px-4 py-2.5 text-sm',
                    selectedProvider.enabled
                      ? 'border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/[0.16]'
                      : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/[0.16]',
                  )}
                >
                  {toggling ? <Loader size={15} className="animate-spin" /> : <Power size={15} />}
                  {selectedProvider.enabled ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Add new key</p>
                  <p className="mt-1 text-xs text-zinc-500">A chave e salva no backend com mascara de exibicao.</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/[0.12] text-brand-400">
                  <Plus size={16} />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <input
                  className="input rounded-[22px]"
                  placeholder={selectedProvider.id === 'ollama' ? 'http://localhost:11434' : `Cole a chave de ${providerMeta.label}`}
                  value={form.key}
                  onChange={event => setForm(prev => ({ ...prev, key: event.target.value }))}
                  onBlur={loadModels}
                />

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    className="input rounded-[22px]"
                    value={form.model}
                    onChange={event => setForm(prev => ({ ...prev, model: event.target.value }))}
                  >
                    <option value="">Modelo padrao</option>
                    {[...(selectedProvider.defaultModel ? [selectedProvider.defaultModel] : []), ...models]
                      .filter((value, index, array) => value && array.indexOf(value) === index)
                      .map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                  </select>
                  <button onClick={loadModels} className="btn-ghost justify-center rounded-[22px] px-4 py-3 text-sm" disabled={modelLoading || (!form.key.trim() && selectedProvider.id !== 'ollama')}>
                    {modelLoading ? <Loader size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    Modelos
                  </button>
                </div>

                {selectedProvider.id === 'ollama' && (
                  <div className="rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100/80">
                    Use o host do Ollama. Modelo recomendado: <span className="font-semibold text-emerald-200">gemma3:27b</span>. O backend verifica `/api/tags` antes de salvar.
                  </div>
                )}

                <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center rounded-[22px] py-3 text-sm">
                  {saving ? <Loader size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {saving ? 'Salvando...' : `Salvar em slot ${nextSlot}`}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5 rounded-[30px] border border-white/10 bg-[#111116] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Stored keys</p>
                <h3 className="mt-2 text-2xl font-black text-white">{providerMeta.label}</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300">
                {currentKeys.length} slot(s)
              </span>
            </div>

            {currentKeys.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/[0.12] text-brand-400">
                  <KeyRound size={26} />
                </div>
                <h4 className="mt-5 text-xl font-black text-white">Nenhuma chave salva para {providerMeta.label}</h4>
                <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
                  {selectedProvider.configured
                    ? 'Este provider ja aparece como configurado pelo ambiente do backend. Se quiser, voce ainda pode salvar slots adicionais por usuario.'
                    : 'Adicione uma chave acima para este provider aparecer como configurado na home e nos cards v26.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentKeys.map(item => (
                  <KeyCard key={`${item.provider}-${item.key_slot}`} item={item} onDelete={handleDelete} />
                ))}
              </div>
            )}

            <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
              <div className="flex items-start gap-3">
                <Cloud size={18} className="mt-1 shrink-0 text-brand-400" />
                <div>
                  <p className="text-sm font-semibold text-white">Google Drive</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    A integracao existente continua disponivel. O estado abaixo vem do backend atual.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className={clsx(
                      'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                      driveStatus?.connected ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300' : 'border-white/10 bg-white/[0.06] text-zinc-300',
                    )}>
                      {driveStatus?.connected ? 'connected' : driveStatus?.configured ? 'available' : 'disabled'}
                    </span>
                    <button onClick={() => navigate('/integrations')} className="btn-ghost rounded-full px-4 py-2 text-sm">
                      Abrir Integrations
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {setupMode && (hasAnyVerifiedKey || hasAnyConfiguredProvider) && (
        <button onClick={() => navigate('/')} className="btn-primary w-full justify-center rounded-[24px] py-4 text-sm">
          <CheckCircle2 size={16} />
          Ir para a home v26
        </button>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader,
  MessageSquare,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { catalogApi, chatApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';

function statusTone(status) {
  if (status === 'ready' || status === 'connected' || status === 'ok') {
    return 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/30';
  }
  if (status === 'degraded' || status === 'fallback' || status === 'available') {
    return 'bg-amber-500/[0.12] text-amber-200 border-amber-500/30';
  }
  return 'bg-white/[0.06] text-zinc-300 border-white/10';
}

function sectionTitle(icon, title, caption) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400/90">
          {icon}
          {title}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-[2rem]">{caption}</h2>
      </div>
    </div>
  );
}

function AgentCard({ item, onOpen }) {
  return (
    <button
      onClick={() => onOpen(item.route)}
      className="group relative flex min-h-[220px] min-w-[280px] max-w-[320px] snap-start flex-col justify-between overflow-hidden rounded-[28px] border border-white/10 bg-[#111116] p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-brand-500/50 hover:bg-[#18181f]"
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-500/[0.18] to-transparent opacity-80" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{item.category}</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{item.name}</h3>
        </div>
        <span className={clsx('rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', statusTone(item.status))}>
          {item.status}
        </span>
      </div>

      <div className="relative z-10 mt-5 flex-1">
        <p className="max-w-[24rem] text-sm leading-6 text-zinc-300">{item.summary}</p>
        <div className="mt-5 space-y-2">
          {(item.metrics || []).map(metric => (
            <div key={metric} className="flex items-center gap-2 text-xs text-zinc-400">
              <CheckCircle2 size={13} className="text-brand-400" />
              <span>{metric}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-sm font-semibold text-white">
        <span>Abrir fluxo real</span>
        <ArrowRight size={16} className="transition duration-300 group-hover:translate-x-1" />
      </div>
    </button>
  );
}

function ProviderStripCard({ provider, onOpen }) {
  return (
    <button
      onClick={() => onOpen('/settings')}
      className="group min-w-[220px] snap-start rounded-[24px] border border-white/[0.08] bg-[#111116] p-4 text-left transition duration-300 hover:border-brand-500/40 hover:bg-[#17171d]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{provider.label || provider.id}</p>
          <p className="mt-1 text-xs text-zinc-500">{provider.category === 'integration' ? 'Integration provider' : 'LLM provider'}</p>
        </div>
        <span className={clsx('rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', statusTone(provider.hasVerified ? 'ready' : provider.active ? 'available' : 'setup'))}>
          {provider.hasVerified ? 'configured' : provider.active ? 'enabled' : 'setup'}
        </span>
      </div>
      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-white">{provider.keyCount || 0}</p>
          <p className="text-xs text-zinc-500">saved keys</p>
        </div>
        <ChevronRight size={18} className="text-zinc-500 transition duration-300 group-hover:text-brand-400" />
      </div>
    </button>
  );
}

function IntegrationCard({ item, onOpen }) {
  return (
    <button
      onClick={() => onOpen('/integrations')}
      className="group min-w-[220px] snap-start rounded-[24px] border border-white/[0.08] bg-[#111116] p-4 text-left transition duration-300 hover:border-brand-500/40 hover:bg-[#17171d]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{item.name}</p>
          <p className="mt-1 text-xs text-zinc-500">Estado real do sistema</p>
        </div>
        <span className={clsx('rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', statusTone(item.status))}>
          {item.status}
        </span>
      </div>
      <div className="mt-6 text-xs text-zinc-400">
        {item.connected ? 'Conectado e pronto para uso.' : item.configured === false ? 'Nao configurado no ambiente.' : 'Conecte para liberar o fluxo.'}
      </div>
    </button>
  );
}

function ConversationCard({ conversation, onOpen }) {
  return (
    <button
      onClick={() => onOpen(`/chat/${conversation.id}`)}
      className="group min-w-[280px] snap-start rounded-[24px] border border-white/[0.08] bg-[#111116] p-4 text-left transition duration-300 hover:border-brand-500/40 hover:bg-[#17171d]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/[0.14] text-brand-400">
          <MessageSquare size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{conversation.title}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {new Date(conversation.updated_at).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between text-xs font-semibold text-zinc-300">
        <span>Continuar conversa</span>
        <ChevronRight size={15} className="transition duration-300 group-hover:text-brand-400" />
      </div>
    </button>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [skills, setSkills] = useState({ items: [], stats: {}, workflows: [] });
  const [providers, setProviders] = useState({ items: [], keys: [] });
  const [integrations, setIntegrations] = useState({ items: [] });
  const [health, setHealth] = useState(null);
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [
          agentData,
          skillData,
          providerData,
          integrationData,
          healthData,
          conversationData,
        ] = await Promise.all([
          catalogApi.getAgents(),
          catalogApi.getSkills(),
          catalogApi.getProviders(),
          catalogApi.getIntegrations(),
          catalogApi.getHealth(),
          chatApi.getConversations().catch(() => []),
        ]);

        if (cancelled) return;
        setAgents(agentData.items || []);
        setSkills(skillData);
        setProviders(providerData);
        setIntegrations(integrationData);
        setHealth(healthData);
        setConversations(Array.isArray(conversationData) ? conversationData.slice(0, 8) : []);
      } catch (error) {
        if (!cancelled) {
          toast.error(error.message || 'Nao foi possivel carregar a home');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const featuredAgents = useMemo(
    () => agents.filter(agent => ['Studio', 'Intelligence', 'Monetization'].includes(agent.category)),
    [agents],
  );
  const opsAgents = useMemo(
    () => agents.filter(agent => !featuredAgents.some(featured => featured.id === agent.id)),
    [agents, featuredAgents],
  );
  const healthyProviders = providers.items?.filter(provider => provider.hasVerified) || [];
  const readyIntegrations = integrations.items?.filter(item => item.connected) || [];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-zinc-300">
          <Loader size={16} className="animate-spin text-brand-400" />
          Carregando catalogo real do BotSquad...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[#0c0c11] px-6 py-7 sm:px-8 sm:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(229,9,20,0.24),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_30%)]" />
        <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_360px]">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400/90">
              <Sparkles size={14} />
              BotSquad v26
            </p>
            <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              Catalogo premium de agentes conectado ao sistema real.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
              A casca visual foi reorganizada para home estilo catalogo, mantendo chat, video, audio,
              settings, skills e memory na mesma base funcional.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => navigate('/chat')} className="btn-primary rounded-full px-5 py-3 text-sm">
                <PlayCircle size={16} />
                Abrir chat real
              </button>
              <button onClick={() => navigate('/settings')} className="btn-ghost rounded-full px-5 py-3 text-sm">
                <ShieldCheck size={16} />
                Revisar providers
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[28px] border border-white/10 bg-black/30 p-5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">System status</p>
              <div className="mt-4 flex items-center gap-3">
                <div className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl border', statusTone(health?.status))}>
                  <Bot size={20} />
                </div>
                <div>
                  <p className="text-lg font-black text-white">{health?.status || 'unknown'}</p>
                  <p className="text-xs text-zinc-500">{health?.service || 'botsquad-backend'}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-3">
                  <p className="text-2xl font-black text-white">{skills.items?.length || 0}</p>
                  <p className="mt-1 text-xs text-zinc-500">skills vivas</p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-3">
                  <p className="text-2xl font-black text-white">{healthyProviders.length}</p>
                  <p className="mt-1 text-xs text-zinc-500">providers ativos</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/30 p-5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Realtime stack</p>
              <div className="mt-4 space-y-3">
                {[
                  { label: 'Database', status: health?.database?.connected ? 'ok' : 'degraded' },
                  { label: 'Audio stack', status: health?.audio?.status || 'degraded' },
                  { label: 'Video stack', status: health?.video?.status || 'degraded' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3">
                    <span className="text-sm text-zinc-200">{item.label}</span>
                    <span className={clsx('rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', statusTone(item.status))}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(<Sparkles size={14} />, 'Featured Agents', 'Catalogo de agentes e fluxos principais')}
        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {featuredAgents.map(item => (
            <AgentCard key={item.id} item={item} onOpen={navigate} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(<Wrench size={14} />, 'Operations', 'Paginas existentes preservadas e acessiveis')}
        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {opsAgents.map(item => (
            <AgentCard key={item.id} item={item} onOpen={navigate} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(<ShieldCheck size={14} />, 'Provider Stack', 'Providers reais, status real e chaves mascaradas')}
        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {(providers.items || []).map(provider => (
            <ProviderStripCard key={provider.id} provider={provider} onOpen={navigate} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(<CheckCircle2 size={14} />, 'Integrations', 'Conectores e servicos externos ativos')}
        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {(integrations.items || []).map(item => (
            <IntegrationCard key={item.id} item={item} onOpen={navigate} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(<MessageSquare size={14} />, 'Recent Conversations', 'Chat real e historico existente')}
        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {conversations.length > 0 ? conversations.map(conversation => (
            <ConversationCard key={conversation.id} conversation={conversation} onOpen={navigate} />
          )) : (
            <button
              onClick={() => navigate('/chat')}
              className="min-w-[320px] snap-start rounded-[24px] border border-dashed border-white/12 bg-white/[0.03] p-5 text-left transition duration-300 hover:border-brand-500/40 hover:bg-white/[0.05]"
            >
              <p className="text-lg font-black text-white">Nenhuma conversa recente</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Abra o chat principal para iniciar um fluxo com roteamento real por agente.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-brand-400">
                <span>Ir para o chat</span>
                <ArrowRight size={16} />
              </div>
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-white/10 bg-[#111116] p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Coverage</p>
          <h3 className="mt-3 text-2xl font-black tracking-tight text-white">Mapa do stack ativo</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: 'Skills', value: skills.items?.length || 0, help: 'skills registradas' },
              { label: 'Workflows', value: skills.workflows?.length || 0, help: 'fluxos encadeados' },
              { label: 'Providers', value: providers.items?.length || 0, help: 'catalogados' },
              { label: 'Verified', value: healthyProviders.length, help: 'providers verificados' },
              { label: 'Integrations', value: readyIntegrations.length, help: 'conectadas' },
              { label: 'Conversations', value: conversations.length, help: 'recentes na home' },
            ].map(item => (
              <div key={item.label} className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                <p className="text-3xl font-black text-white">{item.value}</p>
                <p className="mt-1 text-sm text-zinc-300">{item.label}</p>
                <p className="mt-2 text-xs text-zinc-500">{item.help}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#111116] p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Quick Access</p>
          <h3 className="mt-3 text-2xl font-black tracking-tight text-white">Rotas principais</h3>
          <div className="mt-5 space-y-3">
            {[
              { label: 'Video Agent', route: '/video', note: 'Geracao de cortes, captions e exports reais' },
              { label: 'Audio Agent', route: '/audio', note: 'Processamento com pipeline e jobs reais' },
              { label: 'Profile Investigator', route: '/investigator?preset=profile', note: 'Analise social com dados reais' },
              { label: 'API Keys / Settings', route: '/settings', note: 'Providers, chaves e toggles ativos' },
            ].map(link => (
              <button
                key={link.route}
                onClick={() => navigate(link.route)}
                className="flex w-full items-center justify-between rounded-[22px] border border-white/[0.08] bg-black/20 px-4 py-4 text-left transition duration-300 hover:border-brand-500/40 hover:bg-black/30"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{link.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{link.note}</p>
                </div>
                <ChevronRight size={18} className="text-zinc-500" />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

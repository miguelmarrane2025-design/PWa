import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader,
  Search,
  ShieldCheck,
  Sparkles,
  Tv,
} from 'lucide-react';
import { catalogApi, researchApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const PLATFORM_OPTIONS = [
  { id: 'youtube', label: 'YouTube', hint: '@channel ou URL do canal' },
  { id: 'instagram', label: 'Instagram', hint: '@perfil ou URL do perfil' },
  { id: 'tiktok', label: 'TikTok', hint: '@perfil ou URL do perfil' },
];

function formatMetricValue(value) {
  if (value == null) return 'N/D';
  if (typeof value === 'number') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

function StatTile({ label, value, tone = 'default' }) {
  return (
    <div className={clsx(
      'rounded-[24px] border p-4',
      tone === 'accent' ? 'border-brand-500/30 bg-brand-500/[0.08]' : 'border-white/[0.08] bg-black/20',
    )}>
      <p className="text-2xl font-black text-white">{formatMetricValue(value)}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
    </div>
  );
}

export default function InvestigatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preset = searchParams.get('preset') || 'profile';

  const [platform, setPlatform] = useState('youtube');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [integrations, setIntegrations] = useState({ items: [] });

  useEffect(() => {
    catalogApi.getIntegrations().then(setIntegrations).catch(() => {});
  }, []);

  useEffect(() => {
    const initialTarget = searchParams.get('target');
    const initialPlatform = searchParams.get('platform');
    if (initialTarget) setTarget(initialTarget);
    if (initialPlatform && PLATFORM_OPTIONS.some(option => option.id === initialPlatform)) {
      setPlatform(initialPlatform);
    }
  }, [searchParams]);

  const availability = useMemo(() => {
    const map = Object.fromEntries((integrations.items || []).map(item => [item.id, item]));
    return {
      youtube: map.youtube?.connected,
      instagram: map.rapidapi?.connected || map.meta?.connected,
      tiktok: map.rapidapi?.connected || map.tiktok?.connected,
    };
  }, [integrations]);

  const currentOption = PLATFORM_OPTIONS.find(option => option.id === platform) || PLATFORM_OPTIONS[0];
  const profile = result?.raw?.channel || result?.raw?.profile || {};
  const recentVideos = result?.raw?.recentVideos || [];

  const handleAnalyze = async () => {
    if (!target.trim()) {
      toast.error('Informe uma URL ou perfil para analisar');
      return;
    }

    setLoading(true);
    try {
      const data = await researchApi.analyze({ platform, target: target.trim() });
      setResult(data);
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel analisar o perfil');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[#0f0f14]">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(229,9,20,0.22),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.04),_transparent)] px-6 py-7 sm:px-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400/90">
                <Sparkles size={14} />
                {preset === 'research' ? 'Research Agent' : 'Profile Investigator'}
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                Analise social com URL, handle e dados reais.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
                Escolha a plataforma, informe um perfil ou URL publica e dispare a analise real.
                O fluxo usa dados do backend, fontes sociais e relatorio analitico sem exemplos fixos.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Key readiness</p>
              <div className="mt-4 space-y-3">
                {[
                  { label: 'YouTube API', ready: !!availability.youtube },
                  { label: 'Instagram data', ready: !!availability.instagram },
                  { label: 'TikTok data', ready: !!availability.tiktok },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3">
                    <span className="text-sm text-zinc-200">{item.label}</span>
                    <span className={clsx(
                      'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                      item.ready ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300' : 'border-white/10 bg-white/[0.06] text-zinc-300',
                    )}>
                      {item.ready ? 'ready' : 'setup'}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/settings')} className="btn-ghost mt-5 w-full justify-center rounded-full py-3 text-sm">
                <ShieldCheck size={15} />
                Abrir API Keys
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
        <div className="space-y-5 rounded-[30px] border border-white/10 bg-[#111116] p-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Analyzer</p>
            <h3 className="mt-2 text-2xl font-black text-white">Entrada real do Investigator</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {PLATFORM_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setPlatform(option.id)}
                className={clsx(
                  'rounded-full border px-4 py-2 text-sm font-semibold transition',
                  platform === option.id
                    ? 'border-brand-500/40 bg-brand-500/[0.14] text-white'
                    : 'border-white/10 bg-white/5 text-zinc-400 hover:border-brand-500/30 hover:text-zinc-200',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Perfil ou URL
            </label>
            <div className="mt-3 flex gap-3">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  className="input rounded-[22px] border-white/10 bg-[#0d0d11] pl-11"
                  value={target}
                  onChange={event => setTarget(event.target.value)}
                  placeholder={currentOption.hint}
                  onKeyDown={event => {
                    if (event.key === 'Enter') handleAnalyze();
                  }}
                />
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="btn-primary rounded-[22px] px-5 py-3 text-sm"
              >
                {loading ? <Loader size={16} className="animate-spin" /> : <Tv size={16} />}
                {loading ? 'Analisando' : 'Analisar'}
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Notes</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
              <p className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-1 shrink-0 text-brand-400" />
                YouTube funciona com YouTube API. Instagram e TikTok usam RapidAPI e podem usar Meta ou TikTok se voce guardar as chaves.
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-1 shrink-0 text-brand-400" />
                O resultado remove exemplos fixos e responde apenas com dados do alvo informado.
              </p>
              <p className="flex items-start gap-2">
                <AlertCircle size={15} className="mt-1 shrink-0 text-amber-300" />
                Se alguma plataforma estiver sem chave, a tela mostra o status real e o backend devolve a mensagem correspondente.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {!result ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[30px] border border-dashed border-white/12 bg-white/[0.03] p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/[0.12] text-brand-400">
                <Search size={26} />
              </div>
              <h3 className="mt-5 text-2xl font-black text-white">Nenhuma analise carregada</h3>
              <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
                Rode o fluxo acima para preencher esta area com relatorio, metricas reais e fontes coletadas do backend.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-[30px] border border-white/10 bg-[#111116] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Result</p>
                    <h3 className="mt-2 text-2xl font-black text-white">{result.target}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{result.platform}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(result.raw?.sources || []).map(source => (
                      <span key={source} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300">
                        {source}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatTile label="Followers" value={profile.followers ?? profile.subscribers} tone="accent" />
                  <StatTile label="Views" value={profile.totalViews} />
                  <StatTile label="Posts / Videos" value={profile.posts ?? profile.videoCount ?? recentVideos.length} />
                  <StatTile label="Engagement" value={profile.engagementRate ? `${profile.engagementRate}%` : profile.likes} />
                </div>

                {(profile.description || profile.bio) && (
                  <div className="mt-5 rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Bio</p>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">{profile.description || profile.bio}</p>
                  </div>
                )}
              </section>

              {recentVideos.length > 0 && (
                <section className="rounded-[30px] border border-white/10 bg-[#111116] p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Recent Media</p>
                      <h3 className="mt-2 text-2xl font-black text-white">Ultimos videos detectados</h3>
                    </div>
                    <button onClick={() => navigate('/video')} className="btn-ghost rounded-full px-4 py-2 text-sm">
                      Abrir Video Agent
                    </button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {recentVideos.map(video => (
                      <div key={video.id} className="rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row">
                          {video.thumbnail && (
                            <img
                              src={video.thumbnail}
                              alt={video.title}
                              className="h-28 w-full rounded-[20px] object-cover sm:w-44"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white">{video.title}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                              <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1">
                                {formatMetricValue(video.views)} views
                              </span>
                              <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1">
                                {formatMetricValue(video.likes)} likes
                              </span>
                              <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1">
                                {formatMetricValue(video.comments)} comentarios
                              </span>
                            </div>
                            {video.engagementRate && (
                              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-brand-400">
                                engagement {video.engagementRate}%
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-[30px] border border-white/10 bg-[#111116] p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Report</p>
                    <h3 className="mt-2 text-2xl font-black text-white">Relatorio do Investigator</h3>
                  </div>
                  <button onClick={() => navigate('/chat')} className="btn-ghost rounded-full px-4 py-2 text-sm">
                    <ArrowRight size={15} />
                    Levar insights ao chat
                  </button>
                </div>
                <div className="prose prose-invert mt-5 max-w-none text-sm leading-7 prose-headings:font-black prose-headings:text-white prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-white">
                  <ReactMarkdown>{result.report}</ReactMarkdown>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

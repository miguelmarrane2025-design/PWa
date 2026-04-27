// pages/SocialResearchPage.jsx
// Social Research — Profile Investigator + Trend Radar
// Uses integrations-engine fallback chain on the backend.

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, TrendingUp, Globe, Youtube, Instagram,
  Loader, AlertCircle, CheckCircle, ChevronDown,
  ChevronUp, ExternalLink, BarChart2, Zap, Copy,
} from 'lucide-react';
import { catalogApi, researchApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ─── Platform selector ────────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'youtube',   label: 'YouTube',   color: '#ff0000', icon: Youtube   },
  { id: 'instagram', label: 'Instagram', color: '#e1306c', icon: Instagram  },
  { id: 'tiktok',    label: 'TikTok',    color: '#69c9d0', icon: Globe      },
];

// ─── Status badge ─────────────────────────────────────────────────────────
function ApiStatusBadge({ status }) {
  if (!status) return null;
  const entries = Array.isArray(status) ? status : Object.values(status);
  return (
    <div className="flex gap-2 flex-wrap">
      {entries.map(val => {
        const resolvedStatus = val.status || (val.connected ? 'configured' : val.configured ? 'configured' : 'not_configured');
        const isConfigured = resolvedStatus === 'configured';
        const isOffline = resolvedStatus === 'offline';

        return (
          <div
            key={val.id}
            className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-medium"
            style={{
              background: isConfigured
                ? 'rgba(16,185,129,0.12)'
                : isOffline
                  ? 'rgba(245,158,11,0.12)'
                  : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isConfigured
                ? 'rgba(16,185,129,0.3)'
                : isOffline
                  ? 'rgba(245,158,11,0.3)'
                  : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            {isConfigured
              ? <CheckCircle size={10} style={{ color: '#34d399' }} />
              : <AlertCircle size={10} style={{ color: isOffline ? '#f59e0b' : '#6b6b7b' }} />}
            <span style={{ color: isConfigured ? '#34d399' : isOffline ? '#fbbf24' : '#6b6b7b' }}>
              {val.label} · {resolvedStatus}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Profile card ─────────────────────────────────────────────────────────
function ProfileCard({ profile, source }) {
  if (!profile?.name && !profile?.handle) return null;
  const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n||0);
  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: '#111116', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start gap-3">
        {profile.thumbnail && (
          <img src={profile.thumbnail} alt="" className="w-12 h-12 rounded-full object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate">{profile.name}</p>
          <p className="text-xs text-gray-500">{profile.handle}</p>
          {profile.verified && <span className="text-[10px] text-blue-400">✓ Verificado</span>}
        </div>
        <div className="text-[10px] px-2 py-1 rounded-lg"
          style={{ background: 'rgba(229,9,20,0.1)', color: '#f87171', border: '1px solid rgba(229,9,20,0.2)' }}>
          {source}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Seguidores', val: fmt(profile.subscribers) },
          { label: 'Views',      val: fmt(profile.views)       },
          { label: 'Conteúdos',  val: fmt(profile.posts)       },
        ].map(({ label, val }) => (
          <div key={label} className="text-center py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-base font-bold text-white">{val}</p>
            <p className="text-[10px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>
      {profile.bio && (
        <p className="text-xs text-gray-400 line-clamp-3">{profile.bio}</p>
      )}
    </div>
  );
}

// ─── Analysis section ─────────────────────────────────────────────────────
function AnalysisBlock({ text, title, icon: Icon }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3"
        style={{ background: '#111116' }}>
        <div className="flex items-center gap-2">
          <Icon size={15} style={{ color: '#e50914' }} />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2" style={{ background: '#0b0b0b' }}>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed font-sans">{text}</pre>
          <button onClick={() => { navigator.clipboard?.writeText(text); toast.success('Copiado!'); }}
            className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-600">
            <Copy size={11} /> copiar análise
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Recent items ─────────────────────────────────────────────────────────
function RecentItems({ items }) {
  if (!items?.length) return null;
  const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n||0);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Conteúdos recentes</p>
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: '#111116', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white line-clamp-2">{item.title || item.caption || '(sem título)'}</p>
            <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
              {item.views > 0    && <span>👁 {fmt(item.views)}</span>}
              {item.likes > 0    && <span>❤ {fmt(item.likes)}</span>}
              {item.comments > 0 && <span>💬 {fmt(item.comments)}</span>}
              {item.duration     && <span>⏱ {item.duration}</span>}
            </div>
          </div>
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              className="text-gray-600 shrink-0">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────
export default function SocialResearchPage() {
  const navigate = useNavigate();
  const [tab,        setTab]        = useState('profile'); // 'profile' | 'trends'
  const [platform,   setPlatform]   = useState('youtube');
  const [url,        setUrl]        = useState('');
  const [niche,      setNiche]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [apiStatus,  setApiStatus]  = useState([]);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    catalogApi.getSystemIntegrations()
      .catch(() => catalogApi.getIntegrations())
      .then(data => {
        setApiStatus((data.integrations || data.items || []).filter(item => item.category === 'social_research' || item.id === 'google_drive'));
        setStatusError('');
      })
      .catch(() => {
        setStatusError('backend/settings endpoint indisponível');
      });
  }, []);

  const byId = Object.fromEntries(apiStatus.map(item => [item.id, item]));

  const selectedPlatformWarning = (() => {
    if (platform === 'youtube' && !byId.youtube?.configured) {
      return 'YouTube API não configurada. Configure YOUTUBE_API_KEY em Keys/Settings ou use Apify/RapidAPI como fallback.';
    }
    if (platform === 'instagram' && !byId.rapidapi?.configured && !byId.instagram?.configured && !byId.apify?.configured) {
      return 'Instagram API não configurada. Configure RapidAPI, Apify ou provider Instagram em Keys/Settings.';
    }
    if (platform === 'tiktok' && !byId.rapidapi?.configured && !byId.tiktok?.configured && !byId.apify?.configured) {
      return 'TikTok API não configurada. Configure RapidAPI, Apify ou provider TikTok em Keys/Settings.';
    }
    return '';
  })();

  const handleAnalyze = async () => {
    if (!url.trim()) return toast.error('Cole a URL ou @handle do perfil');
    if (selectedPlatformWarning) {
      toast.error(selectedPlatformWarning);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await researchApi.profileReal({ url: url.trim(), platform });
      setResult({ type: 'profile', data });
      if (data?.note) toast(data.note, { icon: 'ℹ️' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTrends = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await researchApi.trendsDetect({ niche, platform });
      setResult({ type: 'trends', data });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-5 pb-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Search size={20} style={{ color: '#e50914' }} />
          Social Research
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Analise perfis e tendências com dados reais
        </p>
      {apiStatus && (
        <div className="mt-2">
          <ApiStatusBadge status={apiStatus} />
        </div>
      )}
      {statusError && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{statusError}</span>
        </div>
      )}
      </div>

      {/* Tab */}
      <div className="flex rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        {[
          { id: 'profile', label: 'Analisar Perfil', icon: BarChart2 },
          { id: 'trends',  label: 'Tendências',      icon: TrendingUp },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all"
            style={tab === id ? { background: '#e50914', color: '#fff' } : { background: '#111116', color: '#6b6b7b' }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Platform picker */}
      <div className="flex gap-2">
        {PLATFORMS.map(({ id, label, icon: Icon, color }) => (
          <button key={id} onClick={() => setPlatform(id)}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all"
            style={platform === id
              ? { background: `${color}18`, border: `1px solid ${color}60`, color }
              : { background: '#111116', borderColor: 'rgba(255,255,255,0.08)', color: '#6b6b7b' }}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Profile mode */}
      {tab === 'profile' && (
        <div className="space-y-3">
          <input
            className="input"
            placeholder="URL ou @handle — ex: @MrBeast ou youtube.com/@MrBeast"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
          />
          {selectedPlatformWarning && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#fbbf24' }}>
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{selectedPlatformWarning}</p>
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-400/30 px-2 py-1 text-[11px] font-semibold text-amber-200"
                >
                  Configurar em Keys
                </button>
              </div>
            </div>
          )}
          <button onClick={handleAnalyze} disabled={loading}
            className="w-full py-3 rounded-2xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2"
            style={{ background: loading ? '#6b0008' : '#e50914' }}>
            {loading ? <><Loader size={15} className="animate-spin" />Analisando…</> : <><Search size={15} />Analisar Perfil</>}
          </button>
        </div>
      )}

      {result?.data?.note && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd' }}>
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{result.data.note}</p>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-blue-400/30 px-2 py-1 text-[11px] font-semibold text-blue-200"
            >
              Configurar em Keys
            </button>
          </div>
        </div>
      )}

      {/* Trends mode */}
      {tab === 'trends' && (
        <div className="space-y-3">
          <input
            className="input"
            placeholder="Nicho (ex: guitarra worship, marketing digital…)"
            value={niche}
            onChange={e => setNiche(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTrends()}
          />
          <button onClick={handleTrends} disabled={loading}
            className="w-full py-3 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2"
            style={{ background: loading ? '#6b0008' : '#e50914' }}>
            {loading ? <><Loader size={15} className="animate-spin" />Buscando tendências…</> : <><TrendingUp size={15} />Detectar Tendências</>}
          </button>
        </div>
      )}

      {/* Results */}
      {result?.type === 'profile' && result.data && (
        <div className="space-y-4">
          {/* Source note — shown when running on LLM-only (no API configured) */}
          {result.data.note && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#fbbf24' }}>
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{result.data.note}</span>
              </div>
              <p className="text-[10px] text-gray-600 px-1">
                Fonte: <span className="font-mono">{result.data.source}</span>
                {result.data.errors?.length > 0 && ` · Tentativas: ${result.data.errors.join(' | ')}`}
              </p>
            </div>
          )}

          {/* Profile card */}
          <ProfileCard profile={result.data.profile} source={result.data.source} />

          {/* Recent items */}
          <RecentItems items={result.data.items} />

          {/* AI Analysis */}
          {result.data.analysis && (
            <AnalysisBlock
              text={result.data.analysis}
              title="Análise Estratégica"
              icon={Zap}
            />
          )}
        </div>
      )}

      {result?.type === 'trends' && result.data?.analysis && (
        <AnalysisBlock
          text={result.data.analysis}
          title="Tendências Detectadas"
          icon={TrendingUp}
        />
      )}
    </div>
  );
}

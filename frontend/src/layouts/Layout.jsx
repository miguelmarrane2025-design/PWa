import React, { useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Brain,
  Cloud,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Music,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  User,
  Video,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/auth.js';

const PRIMARY_NAV = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/video', icon: Video, label: 'Video' },
  { to: '/audio', icon: Music, label: 'Audio' },
  { to: '/investigator', icon: Search, label: 'Investigator' },
  { to: '/social', icon: TrendingUp, label: 'Social' },
];

const SECONDARY_NAV = [
  { to: '/skills', icon: Zap, label: 'Skills' },
  { to: '/memory', icon: Brain, label: 'Memory' },
  { to: '/training', icon: Brain, label: 'Training' },
  { to: '/settings', icon: Settings, label: 'API Keys' },
  { to: '/integrations', icon: Cloud, label: 'Integrations' },
];

const MOBILE_NAV = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/investigator', icon: Search, label: 'Research' },
  { to: '/social', icon: TrendingUp, label: 'Social' },
  { to: '/video', icon: Video, label: 'Video' },
  { to: '/settings', icon: Settings, label: 'Keys' },
];

const PAGE_META = [
  { test: path => path === '/', title: 'Home', caption: 'Catalogo premium de agentes e status em tempo real' },
  { test: path => path.startsWith('/chat'), title: 'Chat', caption: 'Roteamento real por agente e historico persistente' },
  { test: path => path.startsWith('/video'), title: 'Video Agent', caption: 'Clipes, captions e jobs reais no backend' },
  { test: path => path.startsWith('/audio'), title: 'Audio Agent', caption: 'Pipeline com FFmpeg, CamillaDSP e IR processing' },
  { test: path => path.startsWith('/investigator'), title: 'Investigator', caption: 'Pesquisa social e analise de perfis com dados reais' },
  { test: path => path.startsWith('/social'), title: 'Social Research', caption: 'Profile Investigator, Metrics Research e Trend Radar' },
  { test: path => path.startsWith('/skills'), title: 'Skills', caption: 'Biblioteca executavel de skills e workflows' },
  { test: path => path.startsWith('/memory'), title: 'Memory', caption: 'Memoria persistente compartilhada entre fluxos' },
  { test: path => path.startsWith('/training'), title: 'Training', caption: 'Feedback, exemplos e budget dos agentes' },
  { test: path => path.startsWith('/settings'), title: 'API Keys', caption: 'Providers, chaves mascaradas e status ativo' },
  { test: path => path.startsWith('/integrations'), title: 'Integrations', caption: 'Google Drive e conectores externos' },
];

function NavGroup({ items, onNavigate }) {
  return (
    <div className="space-y-1.5">
      {items.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => clsx(
            'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
            isActive
              ? 'border border-brand-500/30 bg-brand-500/[0.12] text-white shadow-[0_0_0_1px_rgba(229,9,20,0.15)]'
              : 'border border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white',
          )}
        >
          <Icon size={17} />
          <span>{label}</span>
        </NavLink>
      ))}
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pageMeta = useMemo(
    () => PAGE_META.find(entry => entry.test(location.pathname)) || PAGE_META[0],
    [location.pathname],
  );

  const handleLogout = () => {
    setDrawerOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060606] text-[#f5f5f5]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(229,9,20,0.18),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.06),_transparent_28%)]" />

      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden w-[292px] shrink-0 border-r border-white/[0.08] bg-black/40 px-5 py-6 backdrop-blur-xl lg:flex lg:flex-col">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-left">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-[0_10px_30px_rgba(229,9,20,0.28)]">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-brand-400/90">BotSquad</p>
              <p className="mt-1 text-lg font-black text-white">v26 Control Room</p>
            </div>
          </button>

          <div className="mt-8">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Primary</p>
            <div className="mt-3">
              <NavGroup items={PRIMARY_NAV} />
            </div>
          </div>

          <div className="mt-8">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Operations</p>
            <div className="mt-3">
              <NavGroup items={SECONDARY_NAV} />
            </div>
          </div>

          <div className="mt-auto rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Signed in</p>
            <p className="mt-3 truncate text-sm font-semibold text-white">{user?.name || user?.email || 'BotSquad user'}</p>
            <p className="mt-1 truncate text-xs text-zinc-500">{user?.email}</p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => navigate('/settings')} className="btn-ghost justify-center rounded-full py-2.5 text-sm">
                <Settings size={15} />
                API Keys
              </button>
              <button onClick={handleLogout} className="btn-ghost justify-center rounded-full py-2.5 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200">
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-black/[0.35] px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-brand-500/30 hover:text-white lg:hidden"
              >
                <Menu size={18} />
              </button>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400/90">BotSquad</p>
                <h1 className="truncate text-2xl font-black tracking-tight text-white">{pageMeta.title}</h1>
                <p className="mt-1 truncate text-sm text-zinc-500">{pageMeta.caption}</p>
              </div>

              <div className="ml-auto hidden items-center gap-2 sm:flex">
                <button onClick={() => navigate('/chat')} className="btn-ghost rounded-full px-4 py-2.5 text-sm">
                  <MessageSquare size={15} />
                  Chat
                </button>
                <button onClick={() => navigate('/settings')} className="btn-primary rounded-full px-4 py-2.5 text-sm">
                  <Wrench size={15} />
                  Control
                </button>
              </div>

              <button
                onClick={() => navigate('/settings')}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-brand-500/30 hover:text-white sm:hidden"
              >
                <User size={17} />
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">
            <Outlet />
          </main>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[320px] flex-col border-r border-white/10 bg-[#0c0c10] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <button onClick={() => { navigate('/'); setDrawerOpen(false); }} className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-white">
                  <Sparkles size={18} />
                </div>
                <div className="text-left">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-brand-400/90">BotSquad</p>
                  <p className="text-lg font-black text-white">v26</p>
                </div>
              </button>
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-8">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Primary</p>
              <div className="mt-3">
                <NavGroup items={PRIMARY_NAV} onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>

            <div className="mt-8">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Operations</p>
              <div className="mt-3">
                <NavGroup items={SECONDARY_NAV} onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>

            <div className="mt-auto rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">{user?.name || user?.email || 'BotSquad user'}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{user?.email}</p>
              <button onClick={handleLogout} className="btn-ghost mt-4 w-full justify-center rounded-full py-2.5 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200">
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <nav className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-[28px] border border-white/10 bg-black/70 px-2 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:hidden">
        {MOBILE_NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => clsx(
              'flex min-w-[60px] flex-1 flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition',
              isActive ? 'bg-brand-500 text-white' : 'text-zinc-500',
            )}
          >
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

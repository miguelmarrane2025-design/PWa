import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap, Search, Play, ChevronRight, Loader, BookOpen } from 'lucide-react';
import { skillsApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const DOMAIN_COLOR = {
  audio:        'bg-red-500/[0.14] text-red-200 border-red-500/25',
  content:      'bg-orange-500/[0.14] text-orange-200 border-orange-500/25',
  visual:       'bg-rose-500/[0.14] text-rose-200 border-rose-500/25',
  research:     'bg-amber-500/[0.14] text-amber-200 border-amber-500/25',
  analytics:    'bg-emerald-500/[0.14] text-emerald-200 border-emerald-500/25',
  system:       'bg-zinc-500/[0.14] text-zinc-300 border-zinc-500/25',
  hunter:       'bg-red-400/[0.14] text-red-100 border-red-400/25',
  pedal:        'bg-stone-500/[0.14] text-stone-200 border-stone-500/25',
  monetization: 'bg-yellow-500/[0.14] text-yellow-200 border-yellow-500/25',
  growth:       'bg-orange-400/[0.14] text-orange-100 border-orange-400/25',
};

export default function SkillsPage() {
  const [searchParams] = useSearchParams();
  const [skills,   setSkills]   = useState([]);
  const [search,   setSearch]   = useState('');
  const [domain,   setDomain]   = useState(searchParams.get('domain') || 'all');
  const [running,  setRunning]  = useState(null);  // skillId being run
  const [result,   setResult]   = useState(null);  // last result
  const [selected, setSelected] = useState(null);  // skill to run
  const [params,   setParams]   = useState({ texto: '', nicho: '', estilo: '' });

  useEffect(() => {
    skillsApi.list().then(data => {
      if (Array.isArray(data)) {
        setSkills(data);

        const focus = searchParams.get('focus');
        if (focus) {
          const target = data.find(skill => skill.id === focus);
          if (target) setSelected(target);
        }
      }
    }).catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    const domainParam = searchParams.get('domain');
    if (domainParam) setDomain(domainParam);
  }, [searchParams]);

  const domains = ['all', ...new Set(skills.flatMap(s => s.dominios ?? []))].sort();

  const filtered = skills.filter(s => {
    const matchDomain = domain === 'all' || (s.dominios ?? []).includes(domain);
    const matchSearch = !search || s.nome?.toLowerCase().includes(search.toLowerCase())
      || s.descricao?.toLowerCase().includes(search.toLowerCase());
    return matchDomain && matchSearch;
  });

  const runSkill = async () => {
    if (!selected || running) return;
    setRunning(selected.id);
    setResult(null);
    try {
      const r = await skillsApi.runSkill(selected.id, params);
      setResult(r.text || r.data);
      toast.success(`${selected.nome} executed`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(null);
    }
  };

  // Skill runner sheet
  if (selected) return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <button onClick={() => { setSelected(null); setResult(null); }}
          className="text-gray-400 active:text-gray-100 p-1">
          <ChevronRight size={20} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">{selected.nome}</p>
          <p className="text-xs text-gray-500 truncate">{selected.descricao}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container px-4 py-4 space-y-4">
        {/* Params form */}
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Parameters</p>
          <input className="input" placeholder="Topic / message"
            value={params.texto}
            onChange={e => setParams(p => ({ ...p, texto: e.target.value }))} />
          <input className="input" placeholder="Niche (e.g. fitness, worship, marketing)"
            value={params.nicho}
            onChange={e => setParams(p => ({ ...p, nicho: e.target.value }))} />
          <input className="input" placeholder="Style (optional)"
            value={params.estilo}
            onChange={e => setParams(p => ({ ...p, estilo: e.target.value }))} />
          <button onClick={runSkill} disabled={!!running}
            className="btn-primary w-full justify-center py-3">
            {running === selected.id
              ? <><Loader size={16} className="animate-spin" /> Running…</>
              : <><Play size={16} /> Run {selected.nome}</>
            }
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Result</p>
            <pre className="text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed font-sans">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );

  // Skill list
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 space-y-3">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Zap size={20} className="text-brand-400" /> Skills
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {skills.length} AI skills ready to use
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9 py-2.5 text-sm" placeholder="Search skills…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Domain filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {domains.map(d => (
            <button key={d} onClick={() => setDomain(d)}
              className={clsx(
                'shrink-0 text-xs px-3 py-1.5 rounded-xl border transition-colors capitalize',
                domain === d
                  ? 'bg-brand-500 border-brand-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400',
              )}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container px-4 pb-6 space-y-2">
        {filtered.length === 0 && (
          <p className="text-gray-600 text-sm py-8 text-center">No skills found</p>
        )}
        {filtered.map(skill => (
          <div key={skill.id}
            onClick={() => setSelected(skill)}
            className="card flex items-start gap-3 cursor-pointer active:bg-gray-800 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100">{skill.nome}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{skill.descricao}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(skill.dominios ?? []).map(d => (
                  <span key={d}
                    className={clsx('text-[10px] px-2 py-0.5 rounded-full border', DOMAIN_COLOR[d] ?? DOMAIN_COLOR.system)}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight size={16} className="text-gray-600 shrink-0 mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

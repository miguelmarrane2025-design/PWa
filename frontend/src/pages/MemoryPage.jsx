import React, { useState, useEffect, useCallback } from 'react';
import { Brain, Plus, Trash2, Search, Tag, X, Loader } from 'lucide-react';
import { memoryApi } from '../services/api.js';
import toast from 'react-hot-toast';

export default function MemoryPage() {
  const [memories,   setMemories]   = useState([]);
  const [search,     setSearch]     = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags,    setNewTags]    = useState('');
  const [adding,     setAdding]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [showAdd,    setShowAdd]    = useState(false);

  const load = useCallback(async (q) => {
    setLoading(true);
    try {
      const data = await memoryApi.getMemories(q || undefined);
      setMemories(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const addMemory = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
      const m = await memoryApi.addMemory(newContent.trim(), tags);
      setMemories(p => [m, ...p]);
      setNewContent('');
      setNewTags('');
      setShowAdd(false);
      toast.success('Memory saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const deleteMemory = useCallback(async (id) => {
    await memoryApi.deleteMemory(id).catch(() => {});
    setMemories(p => p.filter(m => m.id !== id));
    toast.success('Deleted');
  }, []);

  return (
    <div className="px-4 py-4 space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Brain size={20} className="text-brand-400" /> Memory
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Knowledge accessible to all 37 skills
          </p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="btn-primary text-sm py-2 px-3">
          {showAdd ? <X size={15} /> : <Plus size={15} />}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">New Memory</p>
          <textarea
            className="input min-h-[80px] resize-none"
            placeholder="What should the AI remember? (e.g. 'My niche is worship guitar. My pedalboard is HX Stomp.')"
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            autoFocus
          />
          <input
            className="input"
            placeholder="Tags (comma-separated, e.g. audio, guitar, niche)"
            value={newTags}
            onChange={e => setNewTags(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMemory()}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="btn-ghost text-sm flex-1 justify-center">
              Cancel
            </button>
            <button
              onClick={addMemory}
              disabled={adding || !newContent.trim()}
              className="btn-primary text-sm flex-1 justify-center">
              {adding ? <><Loader size={14} className="animate-spin" /> Saving…</> : 'Save Memory'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="input pl-9 py-2.5 text-sm"
          placeholder="Search memories…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Stats */}
      {memories.length > 0 && (
        <p className="text-xs text-gray-600">{memories.length} memor{memories.length === 1 ? 'y' : 'ies'}</p>
      )}

      {/* List */}
      <div className="space-y-2 pb-4">
        {loading && memories.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader size={20} className="animate-spin text-gray-600" />
          </div>
        )}

        {!loading && memories.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-600">
            <Brain size={32} />
            <p className="text-sm">No memories yet</p>
            <p className="text-xs text-center text-gray-700">
              Add facts about yourself, your niche, tools, or goals — skills will use them.
            </p>
            <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-4 py-2 mt-1">
              Add first memory
            </button>
          </div>
        )}

        {memories.map(m => (
          <div key={m.id} className="card">
            <div className="flex gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm text-gray-200 leading-relaxed">{m.content}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {(m.tags ?? []).map(tag => (
                    <span key={tag}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400">
                      <Tag size={8} />{tag}
                    </span>
                  ))}
                  <span className="text-[11px] text-gray-600">
                    {new Date(m.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => deleteMemory(m.id)}
                className="text-gray-700 active:text-red-400 transition-colors p-1.5 shrink-0 rounded-xl">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

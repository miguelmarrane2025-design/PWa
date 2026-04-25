import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send, Plus, Paperclip, X, Bot, User,
  ChevronLeft, Trash2, Image as ImageIcon,
  Zap, ChevronDown, Download,
} from 'lucide-react';
import { carouselApi, chatApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';

// ── Agent options the user can force ─────────────────────────────────────
const AGENTS = [
  { id: null,      label: 'Auto',     emoji: '🤖', desc: 'Orquestrador decide' },
  { id: 'audio',   label: 'Audio',    emoji: '🎸', desc: 'IR, CamillaDSP, presets' },
  { id: 'content', label: 'Content',  emoji: '✍️', desc: 'Copy, hooks, roteiros' },
  { id: 'visual',  label: 'Visual',   emoji: '🎨', desc: 'Imagens, carrosséis' },
  { id: 'research',label: 'Research', emoji: '🔍', desc: 'Pesquisa, análise' },
  { id: 'hunter',  label: 'Hunter',   emoji: '🎯', desc: 'Perfis e canais sociais' },
  { id: 'video',   label: 'Video',    emoji: '🎬', desc: 'Cortes, legendas, shorts' },
];

const VISUAL_ACTIONS = [
  { label: 'Gerar prompts das imagens', prefix: 'Gerar prompts de imagem do carrossel: ' },
  { label: 'Gerar HTML do carrossel', prefix: 'Gerar HTML do carrossel: ' },
  { label: 'Montar carrossel com imagens', prefix: 'Montar carrossel com imagens: ' },
];

// ── Agent selector pill ───────────────────────────────────────────────────
function AgentPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const current = AGENTS.find(a => a.id === selected) ?? AGENTS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors',
          selected
            ? 'bg-brand-500/20 border-brand-500/60 text-brand-300'
            : 'bg-gray-800 border-gray-700 text-gray-400',
        )}>
        <span>{current.emoji}</span>
        <span>{current.label}</span>
        <ChevronDown size={11} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded-2xl shadow-xl overflow-hidden w-52">
            {AGENTS.map(a => (
              <button
                key={String(a.id)}
                onClick={() => { onChange(a.id); setOpen(false); }}
                className={clsx(
                  'flex items-start gap-3 w-full px-4 py-3 text-left transition-colors',
                  selected === a.id ? 'bg-brand-500/20' : 'hover:bg-gray-700',
                )}>
                <span className="text-base mt-0.5">{a.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-100">{a.label}</p>
                  <p className="text-xs text-gray-500">{a.desc}</p>
                </div>
                {selected === a.id && <span className="ml-auto text-brand-400 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Bot message renderer ──────────────────────────────────────────────────
function BotMessage({ content, metadata }) {
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  const imageFiles = files.filter(file => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(file));
  const previewUrls = imageFiles.length
    ? imageFiles.map(resolveAssetUrl).filter(Boolean)
    : [resolveAssetUrl(metadata?.previewUrl || metadata?.imageUrl)].filter(Boolean);
  const downloadUrl = resolveAssetUrl(metadata?.downloadUrl || files[0]);
  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFromUrl(downloadUrl);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-1.5">
      {previewUrls.length > 0 && (
        <div className="space-y-2">
          <div className={clsx(
            previewUrls.length > 1 && 'grid grid-cols-2 gap-2',
            previewUrls.length === 1 && 'space-y-2',
          )}>
            {previewUrls.map((url, index) => (
              <img key={url} src={url} alt={`Slide ${index + 1}`}
                className="rounded-xl w-full border border-gray-700 bg-gray-900"
                onError={e => (e.target.style.display = 'none')} />
            ))}
          </div>
          {downloadUrl && (
            <button type="button" onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/70 px-3 py-1.5 text-xs font-semibold text-gray-200 active:bg-gray-700">
              <Download size={13} />
              Download
            </button>
          )}
        </div>
      )}
      <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none
        prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0
        prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-code:text-xs">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      {metadata?.agent && metadata.agent !== 'fallback' && (
        <div className="text-[10px] text-gray-600 flex items-center gap-1 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500/50 inline-block" />
          {metadata.agent}
        </div>
      )}
    </div>
  );
}

function resolveAssetUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) {
    const base = import.meta.env.VITE_API_URL || '/api';
    return `${base.replace(/\/$/, '')}${url}`;
  }
  return url;
}

function filenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean).pop() || 'visual.png';
  } catch {
    return 'visual.png';
  }
}

// ── Main component ────────────────────────────────────────────────────────
export default function ChatPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [files,         setFiles]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [view,          setView]          = useState(id ? 'chat' : 'list');
  const [agentHint,     setAgentHint]     = useState(null); // null = auto
  const [carouselPlan,  setCarouselPlan]  = useState(null);

  const bottomRef = useRef(null);
  const fileRef   = useRef(null);
  const textRef   = useRef(null);

  useEffect(() => { chatApi.getConversations().then(setConversations).catch(() => {}); }, []);

  useEffect(() => {
    if (id) { setView('chat'); chatApi.getMessages(id).then(setMessages).catch(() => {}); }
    else    { setView('list'); setMessages([]); }
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const currentTitle = conversations.find(c => c.id === id)?.title || 'Chat';

  const newConversation = useCallback(async () => {
    try {
      const conv = await chatApi.createConversation('New chat');
      setConversations(p => [conv, ...p]);
      navigate(`/chat/${conv.id}`);
    } catch (err) { toast.error(err.message); }
  }, [navigate]);

  const deleteConversation = useCallback(async (e, convId) => {
    e.stopPropagation();
    await chatApi.deleteConversation(convId).catch(() => {});
    setConversations(p => p.filter(c => c.id !== convId));
    if (id === convId) navigate('/chat');
  }, [id, navigate]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    let convId = id;
    if (!convId) {
      try {
        const conv = await chatApi.createConversation('New chat');
        setConversations(p => [conv, ...p]);
        convId = conv.id;
        navigate(`/chat/${conv.id}`, { replace: true });
      } catch (err) { toast.error(err.message); return; }
    }

    const text    = input.trim();
    const userMsg = { id: `tmp-${Date.now()}`, role: 'user', content: text };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setFiles([]);
    setLoading(true);
    if (textRef.current) textRef.current.style.height = '36px';

    try {
      const response = await chatApi.sendMessage(convId, text, files, agentHint);
      setMessages(p => [...p.filter(m => m.id !== userMsg.id), response]);
      setConversations(p => p.map(c =>
        c.id === convId ? { ...c, title: text.slice(0, 60), updated_at: new Date().toISOString() } : c,
      ));
    } catch (err) {
      toast.error(err.message);
      setMessages(p => p.filter(m => m.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  }, [input, loading, id, files, agentHint, navigate]);

  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  const autoResize = useCallback(e => {
    e.target.style.height = '36px';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }, []);

  const createCarouselPlan = useCallback(async () => {
    const topic = input.trim();
    if (!topic) return toast.error('Informe o tema do carrossel');
    try {
      const plan = await carouselApi.plan({
        topic,
        slides: 6,
        style: 'premium dark neon',
        visualMode: 'html_svg_only',
      });
      setCarouselPlan(plan);
      toast.success('Prompts gerados para revisão');
    } catch (err) {
      toast.error(err.message);
    }
  }, [input]);

  const renderCarouselPlan = useCallback(async () => {
    if (!carouselPlan) return;
    try {
      const rendered = await carouselApi.render({
        planId: carouselPlan.planId,
        slides: carouselPlan.slides,
        visualMode: 'html_svg_only',
      });
      setMessages(p => [...p, {
        id: `carousel-${Date.now()}`,
        role: 'assistant',
        content: 'Carrossel renderizado com HTML/SVG usando os prompts aprovados como direção visual.',
        metadata: { agent: 'visual', type: 'visual', files: rendered.files, previewUrl: rendered.previewUrl, downloadUrl: rendered.downloadUrl },
      }]);
      setCarouselPlan(null);
      toast.success('Carrossel renderizado');
    } catch (err) {
      toast.error(err.message);
    }
  }, [carouselPlan]);

  // ── Conversation list ────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-base font-semibold text-gray-100">Conversations</h2>
        <button onClick={newConversation} className="btn-primary text-sm py-1.5 px-3">
          <Plus size={15} /> New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-container">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-600 gap-2">
            <Bot size={36} />
            <p className="text-sm">No conversations yet</p>
            <button onClick={newConversation} className="btn-primary text-xs py-2 px-4 mt-1">Start chatting</button>
          </div>
        )}
        {conversations.map(c => (
          <div key={c.id}
            className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer transition-colors"
            onClick={() => navigate(`/chat/${c.id}`)}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{c.title}</p>
              <p className="text-xs text-gray-600 mt-0.5">{new Date(c.updated_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <button onClick={e => deleteConversation(e, c.id)}
              className="text-gray-700 active:text-red-400 transition-colors p-1.5 rounded-xl shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Chat view ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <button onClick={() => navigate('/chat')} className="text-gray-400 active:text-gray-100 p-1.5 -ml-1 rounded-xl">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-medium text-gray-200 truncate flex-1">{currentTitle}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-container px-3 py-3 space-y-3 pb-2">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600 gap-2">
            <Bot size={32} />
            <p className="text-sm">Start the conversation</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={clsx('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={13} className="text-brand-400" />
              </div>
            )}
            <div className={clsx(
              'max-w-[84%] rounded-2xl px-3.5 py-2.5',
              msg.role === 'user' ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-gray-800 text-gray-100 rounded-tl-sm',
            )}>
              {msg.role === 'assistant'
                ? <BotMessage content={msg.content} metadata={msg.metadata} />
                : <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-0"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
              }
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={13} className="text-gray-300" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center">
              <Bot size={13} className="text-brand-400" />
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Attached files */}
      {files.length > 0 && (
        <div className="px-3 pb-1.5 flex gap-2 flex-wrap">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300">
              {f.type.startsWith('image/') ? <ImageIcon size={11} /> : <Paperclip size={11} />}
              <span className="truncate max-w-[90px]">{f.name}</span>
              <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))}>
                <X size={11} className="text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-800 space-y-2">
        {/* Agent picker row */}
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-gray-600 shrink-0" />
          <span className="text-xs text-gray-600">Agent:</span>
          <AgentPicker selected={agentHint} onChange={setAgentHint} />
          {agentHint && (
            <button onClick={() => setAgentHint(null)}
              className="text-xs text-gray-600 active:text-gray-300 ml-auto">
              Reset to Auto
            </button>
          )}
        </div>

        {agentHint === 'visual' && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {VISUAL_ACTIONS.map(action => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setInput(prev => prev.startsWith(action.prefix) ? prev : `${action.prefix}${prev}`);
                  setTimeout(() => textRef.current?.focus(), 0);
                }}
                className="shrink-0 rounded-xl border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-semibold text-gray-300 active:bg-gray-700"
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={createCarouselPlan}
              className="shrink-0 rounded-xl border border-green-500/30 bg-green-500/10 px-2.5 py-1.5 text-xs font-semibold text-green-300 active:bg-green-500/20"
            >
              Planejar 6 prompts editáveis
            </button>
          </div>
        )}

        {agentHint === 'visual' && carouselPlan && (
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-2 space-y-2">
            {carouselPlan.slides.map((slide, index) => (
              <div key={slide.index} className="rounded-xl border border-gray-800 bg-gray-950/40 p-2 space-y-1.5">
                <input
                  value={slide.headline}
                  onChange={e => setCarouselPlan(plan => ({
                    ...plan,
                    slides: plan.slides.map((s, i) => i === index ? { ...s, headline: e.target.value } : s),
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-100"
                />
                <textarea
                  value={slide.visualPrompt}
                  onChange={e => setCarouselPlan(plan => ({
                    ...plan,
                    slides: plan.slides.map((s, i) => i === index ? { ...s, visualPrompt: e.target.value } : s),
                  }))}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 resize-none"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={renderCarouselPlan}
              className="w-full rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white"
            >
              Gerar carrossel com estes prompts
            </button>
          </div>
        )}

        {/* Text input */}
        <div className="flex gap-2 items-end bg-gray-800 rounded-2xl px-3 py-2">
          <input ref={fileRef} type="file" multiple accept="audio/*,video/*,image/*,.pdf,.txt,.md,.csv" className="hidden"
            onChange={e => setFiles(p => [...p, ...Array.from(e.target.files)])} />
          <button onClick={() => fileRef.current?.click()}
            className="text-gray-500 active:text-gray-300 p-1 shrink-0 transition-colors">
            <Paperclip size={18} />
          </button>
          <textarea ref={textRef}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none leading-relaxed"
            style={{ height: '36px', maxHeight: '120px', fontSize: '16px' }}
            placeholder="Message…"
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(e); }}
            onKeyDown={handleKeyDown}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            className="text-brand-400 disabled:opacity-30 p-1 shrink-0 active:scale-90 transition-transform">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

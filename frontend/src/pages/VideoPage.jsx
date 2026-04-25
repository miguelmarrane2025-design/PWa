// VideoPage.jsx — v23
// Real async job processing. Real explanations. No fake progress.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import {
  Video, X, Play, Scissors, MessageSquare,
  Download, CheckCircle, Loader, Film,
  Captions, ChevronDown, ChevronUp, Star,
  BookOpen, BarChart2, Wand2, Settings2, AlertCircle,
  TrendingUp, Zap, Clock,
} from 'lucide-react';
import toast  from 'react-hot-toast';
import clsx   from 'clsx';
import { videoApi } from '../services/api.js';

// ── Constants ─────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: null,      icon: '🤖', label: 'Auto' },
  { id: 'tiktok',  icon: '🎵', label: 'TikTok' },
  { id: 'reels',   icon: '📸', label: 'Reels' },
  { id: 'shorts',  icon: '▶️', label: 'Shorts' },
  { id: 'youtube', icon: '🖥️', label: 'YouTube' },
];

const MODES = [
  { id: 'short', icon: '✂️', label: 'Short Form', desc: 'Melhor janela viral · 30–90s' },
  { id: 'long',  icon: '📽', label: 'Long Form',  desc: 'Completo · remove pausas + vícios' },
  { id: 'auto',  icon: '🤖', label: 'Auto',       desc: 'Analisa e decide' },
];

const CAPTION_STYLES = [
  { id: 'default',      label: 'Clássico',    color: 'bg-white text-black' },
  { id: 'fire',         label: '🔥 Fire',      color: 'bg-orange-500 text-white' },
  { id: 'neon',         label: '💚 Neon',      color: 'bg-green-400 text-black' },
  { id: 'gospel',       label: '✝ Gospel',     color: 'bg-yellow-600 text-white' },
  { id: 'highcontrast', label: '⬛ Contraste', color: 'bg-black text-white border border-white' },
];

// Human-friendly stage labels — product language, not technical
const STAGE_LABELS = {
  received:    '📥 Arquivo recebido',
  uploading:   '⬆️ Enviando arquivo...',
  processing:  '⚙️ Processando arquivo...',
  queued:      '🕐 Aguardando na fila...',
  recovering:  '🔄 Retomando job anterior...',
  transcribing:'🎙️ Transcrevendo fala com Whisper...',
  detecting:   '📊 Analisando energia e pausas...',
  analyzing:   '🧠 Identificando os melhores momentos...',
  planning:    '✂️ Selecionando cortes de alto impacto...',
  captions:    '💬 Gerando legendas dinâmicas...',
  rendering:   '🎬 Renderizando vídeo final...',
  done:        '✅ Pronto para publicar',
  error:       '❌ Erro no processamento',
};

const TONE_LABELS = {
  excitement: '⚡ Alta energia',
  authority:  '💼 Autoridade',
  curiosity:  '🤔 Gancho de curiosidade',
  story:      '📖 Momento narrativo',
  humor:      '😄 Humor',
  neutral:    '📌 Valor direto',
};

const fmtSize = b => b > 1e9 ? `${(b/1e9).toFixed(1)}GB` : b > 1e6 ? `${(b/1e6).toFixed(1)}MB` : `${Math.round(b/1e3)}KB`;
const fmtTime = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const CHUNK_THRESHOLD = 100 * 1024 * 1024;

// ── Score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ score, max = 13 }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-500 w-6 text-right">{score?.toFixed(1)}</span>
    </div>
  );
}

// ── Clip card: shows one ranked clip candidate with 4-dimension scores ──────
function DimBar({ label, score }) {
  const pct   = Math.min(100, Math.round((score / 10) * 100));
  const color = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-gray-600 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-gray-600 w-4 text-right">{score?.toFixed ? score.toFixed(0) : score}</span>
    </div>
  );
}

function ClipCard({ clip, isTop }) {
  const [expanded, setExpanded] = React.useState(isTop);
  const has4dim = clip.hookScore != null && clip.impactScore != null;
  // v25: curiosityScore may also be present

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden',
      isTop ? 'border-brand-500/40 bg-brand-500/5' : 'border-gray-800 bg-gray-900/50',
    )}>
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        {isTop && <Zap size={11} className="text-brand-400 shrink-0" />}
        <span className="text-xs font-bold text-gray-200 flex-1">
          {isTop ? '✅ Clip principal' : `Alternativa ${clip.rank}`}
        </span>
        <span className="font-mono text-[10px] text-gray-500 mr-2">
          {fmtTime(clip.start)}–{fmtTime(clip.end)}
        </span>
        {/* Composite score badge */}
        <span className={clsx(
          'text-[10px] font-bold px-1.5 py-0.5 rounded-lg',
          clip.score >= 8 ? 'bg-green-500/20 text-green-400'
            : clip.score >= 6 ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-gray-700 text-gray-400'
        )}>
          {clip.score?.toFixed(1)}
        </span>
        {expanded ? <ChevronUp size={11} className="text-gray-600 shrink-0" /> : <ChevronDown size={11} className="text-gray-600 shrink-0" />}
      </button>

      {/* Expanded: 4-dimension bars + explanation */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-800/50">
          {/* Tone label */}
          <p className="text-[10px] text-gray-500 pt-2">
            {TONE_LABELS[clip.tone] ?? clip.tone}
          </p>

          {/* 5 dimensions */}
          {has4dim && (
            <div className="space-y-1">
              <DimBar label="Hook"       score={clip.hookScore} />
              <DimBar label="Impacto"    score={clip.impactScore} />
              <DimBar label="Valor"      score={clip.valueScore} />
              <DimBar label="Clareza"    score={clip.clarityScore} />
              <DimBar label="Curiosidade" score={clip.curiosityScore} />
            </div>
          )}

          {/* Start adjustment note */}
          {clip.startIdeal && (
            <p className="text-[10px] text-yellow-600/80 flex items-center gap-1">
              ✂️ Início ajustado — preamble fraco removido automaticamente
            </p>
          )}
          {clip.hasCleanEnd === false && (
            <p className="text-[10px] text-orange-300/80 flex items-center gap-1">
              🔚 Final estendido para completar a ideia
            </p>
          )}

          {/* Why this clip */}
          {clip.explanation && (
            <p className="text-[10px] text-gray-500 leading-relaxed italic">
              {clip.explanation}
            </p>
          )}

          {/* Opening line */}
          {clip.hookText && (
            <p className="text-[10px] text-brand-400/70 italic border-t border-gray-800 pt-1.5 truncate">
              "{clip.hookText}"
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────
function JobCard({ job, onDismiss }) {
  const [showClips, setShowClips] = useState(true);
  const s    = job.stats || {};
  const outputs = job.outputs || s.outputs || [];
  const done = job.status === 'done';
  const err  = job.status === 'error';

  return (
    <div className={clsx('border rounded-2xl overflow-hidden',
      done ? 'border-gray-800 bg-gray-900'
           : err ? 'border-red-900/50 bg-red-950/20'
           : 'border-brand-800/50 bg-gray-900')}>

      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-800">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          done ? 'bg-green-500/20' : err ? 'bg-red-500/20' : 'bg-brand-500/20')}>
          {done ? <CheckCircle size={20} className="text-green-400" />
               : err ? <AlertCircle size={20} className="text-red-400" />
               : <Loader size={20} className="animate-spin text-brand-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-100">
            {done ? (s.suggestedTitle || 'Vídeo pronto para publicar') : err ? 'Falha no processamento' : 'Gerando conteúdo...'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {err
              ? 'Verifique o formato do vídeo ou tente um arquivo diferente.'
              : (STAGE_LABELS[job.stage] || job.stage)}
          </p>
        </div>
        {(done || err) && (
          <button onClick={onDismiss} className="text-gray-700 hover:text-gray-400 transition-colors shrink-0">
            <X size={14} />
          </button>
        )}
      </div>

      {done && (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-4 gap-px bg-gray-800">
            {[
              { icon: Clock,     label: 'Duração',    value: `${s.originalDuration?.toFixed(0)}s→${s.editedDuration?.toFixed(0)}s` },
              { icon: Scissors,  label: 'Cortes',     value: s.cutsApplied ?? 0 },
              { icon: Captions,  label: 'Legendas',   value: s.captionBlocks ?? 0 },
              { icon: TrendingUp,label: 'Removidos',  value: `${s.fillerRemoved ?? 0} vícios` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-gray-900 px-2 py-2.5 text-center">
                <Icon size={12} className="mx-auto text-gray-600 mb-1" />
                <p className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</p>
                <p className="text-xs font-bold text-gray-200 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Clip intelligence — why this clip was chosen */}
          {s.topClips?.length > 0 && (
            <div className="border-t border-gray-800">
              <button
                onClick={() => setShowClips(v => !v)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-gray-200 transition-colors"
              >
                <TrendingUp size={11} />
                Análise de momentos ({s.topClips.length} clips identificados)
                {showClips ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
              </button>
              {showClips && (
                <div className="px-4 pb-3 space-y-2">
                  {s.topClips.map((clip, i) => (
                    <ClipCard key={i} clip={clip} isTop={i === 0} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chapters */}
          {s.chapters?.length > 1 && (
            <div className="px-4 py-3 border-t border-gray-800 space-y-1">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <BookOpen size={10} /> Capítulos detectados
              </p>
              {s.chapters.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-brand-400 w-10 shrink-0">{fmtTime(c.time)}</span>
                  <span className="text-gray-400">{c.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Downloads */}
          <div className="p-4 flex flex-col gap-2 border-t border-gray-800">
            {outputs.length > 0 ? outputs.map((output, index) => (
              <a key={output.file || index} href={output.downloadUrl || output.url} download
                className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold py-3 rounded-xl transition-all active:scale-95">
                <Download size={15} /> {output.title || `Baixar Corte ${index + 1}`}
              </a>
            )) : (
              <a href={job.downloadUrl} download
                className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold py-3 rounded-xl transition-all active:scale-95">
                <Download size={15} /> Baixar Vídeo
              </a>
            )}
            {job.captionsUrl && (
              <a href={job.captionsUrl} download
                className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold py-3 px-4 rounded-xl transition-colors">
                <Captions size={15} /> SRT
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function VideoPage() {
  const [files,        setFiles]        = useState([]);
  const [mode,         setMode]         = useState('auto');
  const [platform,     setPlatform]     = useState(null);
  const [captionStyle, setCaptionStyle] = useState('default');
  const [extraInstr,   setExtraInstr]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [jobs,         setJobs]         = useState([]);
  const [chatMsg,      setChatMsg]      = useState('');
  const [chatHistory,  setChatHistory]  = useState([]);
  const [chatLoading,  setChatLoading]  = useState(false);
  const [activeTab,    setActiveTab]    = useState('editor');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadState,   setUploadState]   = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoAsset, setVideoAsset] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const chatEndRef = useRef(null);
  const pollRefs   = useRef({});

  const startPolling = (jobId) => {
    if (pollRefs.current[jobId]) return;
    const id = setInterval(async () => {
      try {
        const data = await videoApi.getJob(jobId);
        setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...data } : j));
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRefs.current[jobId]);
          delete pollRefs.current[jobId];
          if (data.status === 'done') {
            setUploadState('done');
            toast.success('Vídeo pronto para publicar!');
          } else {
            setUploadState('error');
            toast.error('Não conseguimos processar esse vídeo. Verifique o formato ou tente outro arquivo.');
          }
        }
      } catch { /* network hiccup — try next cycle */ }
    }, 3000);
    pollRefs.current[jobId] = id;
  };

  useEffect(() => () => Object.values(pollRefs.current).forEach(clearInterval), []);

  const onDrop = useCallback((accepted) => {
    setFiles(prev => [
      ...prev,
      ...accepted.filter(f => !prev.some(p => p.name === f.name)).slice(0, 3 - prev.length),
    ]);
    if (accepted.length) setUploadState('received');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 3, maxSize: 500 * 1024 * 1024,
    onDropRejected: rej => rej.forEach(r => toast.error(r.errors[0]?.message ?? 'Arquivo inválido')),
  });

  const handleEdit = async () => {
    if (!files.length && !videoAsset) return toast.error('Adicione um vídeo para continuar');
    setSubmitting(true);
    setUploadState('uploading');
    try {
      let uploaded = videoAsset;
      if (!uploaded) {
        uploaded = await uploadVideoFile(files[0], pct => setUploadProgress(pct));
        setVideoAsset(uploaded);
      }
      setUploadState('processing');
      const parts = [];
      if (mode !== 'auto')            parts.push(`editar para ${mode}`);
      if (platform)                   parts.push(`plataforma ${platform}`);
      if (captionStyle !== 'default') parts.push(`estilo de legenda ${captionStyle}`);
      if (extraInstr.trim())          parts.push(extraInstr.trim());
      const { jobId } = await videoApi.createJob({
        videoId: uploaded.videoId,
        cutType: mode === 'short' ? 'short_form' : mode === 'long' ? 'long_form' : 'auto',
        platform: platform || 'auto',
        captionStyle,
        instruction: parts.join(', ') || 'gerar corte viral automaticamente com legendas',
      });
      setJobs(prev => [{ jobId, status: 'processing', stage: 'queued' }, ...prev]);
      setFiles([]);
      setVideoAsset(null);
      setUploadProgress(0);
      toast.success('Vídeo enviado! Analisando os melhores momentos...');
      startPolling(jobId);
    } catch (err) {
      setUploadState('error');
      const msg = err?.response?.data?.error || err.message || 'Erro ao enviar vídeo';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const uploadVideoFile = async (file, onProgress) => {
    if (file.size < CHUNK_THRESHOLD) {
      const fd = new FormData();
      fd.append('file', file);
      return videoApi.upload(fd, evt => {
        if (evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
      });
    }

    const init = await videoApi.initUpload({ fileName: file.name, fileSize: file.size, mimeType: file.type });
    const chunkSize = init.chunkSize || 10 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    for (let i = 0; i < totalChunks; i += 1) {
      const start = i * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const fd = new FormData();
      fd.append('uploadId', init.uploadId);
      fd.append('chunkIndex', String(i));
      fd.append('totalChunks', String(totalChunks));
      fd.append('chunk', file.slice(start, end), file.name);
      await videoApi.uploadChunk(fd);
      onProgress(Math.round(((i + 1) / totalChunks) * 100));
    }
    return videoApi.completeUpload({ uploadId: init.uploadId, fileName: file.name, totalChunks });
  };

  const handleImportUrl = async () => {
    if (!sourceUrl.trim()) return;
    setSubmitting(true);
    setUploadState('uploading');
    try {
      const data = await videoApi.importUrl({ url: sourceUrl.trim(), source: sourceUrl.includes('drive.google.com') ? 'google_drive' : 'direct' });
      setVideoAsset(data);
      setFiles([]);
      setUploadState('received');
      toast.success('Vídeo recebido. Pronto para análise.');
    } catch (err) {
      setUploadState('error');
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChat = async () => {
    const msg = chatMsg.trim();
    if (!msg) return;
    setChatMsg('');
    setChatHistory(h => [...h, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const data = await videoApi.chat(msg, chatHistory.slice(-10));
      setChatHistory(h => [...h, { role: 'assistant', content: data.content }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { toast.error('Erro na consulta'); }
    finally { setChatLoading(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-800 shrink-0">
        {[
          { id: 'editor', icon: Scissors, label: 'Gerador de Clips' },
          { id: 'chat',   icon: MessageSquare, label: 'Estrategista' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={clsx('flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
              activeTab === t.id ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'editor' && (
          <div className="p-4 space-y-4 pb-10">

            {/* Value prop */}
            <div className="bg-brand-500/[0.08] border border-brand-500/20 rounded-xl px-3 py-2.5">
              <p className="text-xs font-bold text-brand-300">🔥 Gerador de Cortes Virais</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                IA analisa cada segundo do seu vídeo, identifica os momentos de maior retenção e gera clips prontos para publicar.
              </p>
            </div>

            {/* Drop zone */}
            <div {...getRootProps()} className={clsx(
              'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all',
              isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-gray-800 hover:border-gray-600 bg-gray-900/40')}>
              <input {...getInputProps()} />
              <Film size={28} className={clsx('mx-auto mb-2', isDragActive ? 'text-brand-400' : 'text-gray-700')} />
              <p className="text-sm font-semibold text-gray-300">{isDragActive ? 'Solte aqui' : 'Arraste ou toque para selecionar'}</p>
              <p className="text-xs text-gray-600 mt-1">MP4 · MOV · AVI · MKV · WEBM · máx 500MB</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
                    <Video size={14} className="text-brand-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{f.name}</p>
                      <p className="text-[11px] text-gray-600">{fmtSize(f.size)}</p>
                    </div>
                    <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                      className="text-gray-700 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="Importar por link público ou direto..."
                className="min-w-0 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={handleImportUrl}
                disabled={submitting || !sourceUrl.trim()}
                className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-bold text-gray-300 disabled:opacity-40"
              >
                Importar
              </button>
            </div>

            {videoAsset && (
              <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-300">
                Vídeo recebido. Pronto para análise.
              </div>
            )}

            {uploadState !== 'idle' && (
              <div className={clsx(
                'rounded-xl border px-3 py-2 text-xs font-semibold',
                uploadState === 'error' ? 'border-red-900/50 bg-red-950/20 text-red-300' : 'border-gray-800 bg-gray-900 text-gray-400',
              )}>
                {uploadState === 'received' && 'Arquivo recebido'}
                {uploadState === 'uploading' && 'Enviando'}
                {uploadState === 'processing' && 'Processando'}
                {uploadState === 'done' && 'Concluído'}
                {uploadState === 'error' && 'Erro'}
                {uploadState === 'uploading' && uploadProgress > 0 && ` · ${uploadProgress}%`}
              </div>
            )}

            {/* Mode */}
            <div>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Tipo de corte</p>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)}
                    className={clsx('p-3 rounded-xl border text-left transition-all',
                      mode === m.id ? 'bg-brand-500/15 border-brand-500/50' : 'bg-gray-900 border-gray-800 hover:border-gray-700')}>
                    <p className="text-lg mb-1">{m.icon}</p>
                    <p className={clsx('text-xs font-bold', mode === m.id ? 'text-brand-300' : 'text-gray-300')}>{m.label}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5 leading-tight">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Plataforma</p>
              <div className="flex gap-2 flex-wrap">
                {PLATFORMS.map(p => (
                  <button key={String(p.id)} onClick={() => setPlatform(p.id)}
                    className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors',
                      platform === p.id ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600')}>
                    <span>{p.icon}</span><span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Caption style */}
            <div>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Estilo de legenda</p>
              <div className="flex gap-2 flex-wrap">
                {CAPTION_STYLES.map(s => (
                  <button key={s.id} onClick={() => setCaptionStyle(s.id)}
                    className={clsx('px-3 py-2 rounded-xl border text-xs font-bold transition-all',
                      captionStyle === s.id ? 'border-brand-500/50 ring-1 ring-brand-500/30 scale-[1.04]' : 'border-gray-800 hover:border-gray-700',
                      s.color)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced */}
            <button onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors">
              <Settings2 size={12} />Instruções adicionais
              {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showAdvanced && (
              <textarea value={extraInstr} onChange={e => setExtraInstr(e.target.value)}
                placeholder="Ex: manter a intro, focar nos momentos mais intensos, incluir o fechamento..."
                rows={3}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 resize-none focus:outline-none focus:border-brand-500" />
            )}

            <button
              type="button"
              onClick={() => {
                setExtraInstr('cenas quentes: melhores momentos, trechos de maior impacto, maior retenção e cortes fortes');
                setShowAdvanced(true);
              }}
              className="w-full rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-200 active:bg-orange-500/20"
            >
              Cenas quentes
            </button>

            {/* Submit */}
            <button onClick={handleEdit} disabled={submitting || !files.length}
              className={clsx('w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-all',
                submitting || !files.length
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-600 text-white active:scale-[0.98] shadow-lg shadow-brand-500/20')}>
              {submitting
                ? <><Loader size={18} className="animate-spin" /> Enviando...</>
                : <><Wand2 size={18} /> Identificar Melhores Momentos</>}
            </button>

            {/* Jobs */}
            {jobs.length > 0 && (
              <div className="space-y-3">
                {jobs.map(job => (
                  <JobCard
                    key={job.jobId}
                    job={job}
                    onDismiss={() => setJobs(prev => prev.filter(j => j.jobId !== job.jobId))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4 min-h-0">
              {chatHistory.length === 0 && (
                <div className="py-8 text-center">
                  <BarChart2 size={36} className="mx-auto text-gray-700 mb-3" />
                  <p className="text-sm font-bold text-gray-400">Estrategista de Conteúdo</p>
                  <p className="text-xs text-gray-600 mt-1 max-w-xs mx-auto">
                    Estratégia de corte, ritmo ideal por plataforma, e como maximizar retenção.
                  </p>
                  <div className="mt-4 space-y-1.5">
                    {[
                      'Como fazer um Reel que segura 80% dos viewers?',
                      'Qual a duração ideal para cada plataforma?',
                      'Como identificar o melhor momento para começar um corte?',
                    ].map(q => (
                      <button key={q} onClick={() => setChatMsg(q)}
                        className="block w-full text-left text-xs text-gray-500 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl px-3 py-2 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={clsx('max-w-[87%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-brand-500 text-white rounded-br-sm'
                      : 'bg-gray-900 text-gray-200 rounded-bl-sm border border-gray-800')}>
                    {msg.role === 'assistant'
                      ? <div className="prose prose-invert prose-sm max-w-none prose-p:my-0.5"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                      : <p className="whitespace-pre-wrap">{msg.content}</p>}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex">
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader size={13} className="animate-spin text-brand-400" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-gray-800 p-3 flex gap-2 shrink-0">
              <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChat()}
                placeholder="Pergunte sobre estratégia de conteúdo..."
                className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500" />
              <button onClick={handleChat} disabled={!chatMsg.trim() || chatLoading}
                className="w-10 h-10 bg-brand-500 disabled:bg-gray-800 rounded-2xl flex items-center justify-center transition-colors">
                <Play size={14} className="text-white" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

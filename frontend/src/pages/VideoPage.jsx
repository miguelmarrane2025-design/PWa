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
  TrendingUp, Zap, Clock, Link, Send,
  Copy, Trash2, Plus, Upload, LibraryBig, Layers3,
} from 'lucide-react';
import toast  from 'react-hot-toast';
import clsx   from 'clsx';
import { resolveDownloadUrl, videoApi } from '../services/api.js';
import { VIDEO_EDIT_STYLES, VIDEO_STYLE_CATEGORIES, getStyleById } from '../data/videoEditStyles.js';

// Get a signed download URL that works without auth headers (for <a href>)
async function getDownloadUrl(jobId, fileName) {
  try {
    const resp = await videoApi.getDownloadToken(jobId, fileName);
    return resolveDownloadUrl(resp?.url || `/outputs/videos/${jobId}/${fileName}`);
  } catch {
    return null;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: null,      icon: '🤖', label: 'Auto' },
  { id: 'tiktok',  icon: '🎵', label: 'TikTok' },
  { id: 'kwai',    icon: '🎬', label: 'Kwai' },
  { id: 'reels',   icon: '📸', label: 'Reels' },
  { id: 'shorts',  icon: '▶️', label: 'Shorts' },
  { id: 'youtube', icon: '🖥️', label: 'YouTube' },
];

// Source types for v28
const SOURCE_TYPES = [
  { id: 'upload',            label: 'Upload' },
  { id: 'direct_url',        label: 'Link direto' },
  { id: 'google_drive',      label: 'Google Drive' },
  { id: 'youtube_authorized',label: 'YouTube (autorizado)' },
  { id: 'dropbox',           label: 'Dropbox' },
];

const MODES = [
  { id: 'short', icon: '✂️', label: 'Short Form', desc: 'Melhor janela viral · 30–90s' },
  { id: 'long',  icon: '📽', label: 'Long Form',  desc: 'Completo · remove pausas + vícios' },
  { id: 'auto',  icon: '🤖', label: 'Auto',       desc: 'Analisa e decide' },
];

const PROCESSING_MODES = [
  { id: 'raw_review', label: 'Corte cru', desc: 'Cortes simples para avaliar momentos. Sem legenda e edição pesada.' },
  { id: 'finalize_approved', label: 'Finalizar aprovado', desc: 'Acabamento, legenda opcional, áudio e metadata em corte aprovado.' },
  { id: 'opus_auto', label: 'Opus Auto', desc: 'Análise completa, cortes dinâmicos, score, validação e Telegram.' },
];

const EDIT_MODES = [
  { id: 'best_moments', label: 'Melhores Momentos', desc: 'SmartCut encontra os trechos com maior potencial.' },
  { id: 'channel_clean_edit', label: 'Editor de Canal / Clean Edit', desc: 'Limpa pausas, partes mortas e repetições em vídeos próprios.' },
  { id: 'manual_time', label: 'Corte Manual/Por Tempo', desc: 'Mantém o fluxo atual por duração e quantidade.' },
  { id: 'sports_highlights', label: '⚽ Sports Highlights', desc: 'Detecta gols, lances e picos de energia para highlights esportivos.' },
];

const VIDEO_CONTENT_TYPES = [
  { id: 'talking_video', label: 'Vídeo falado' },
  { id: 'tutorial', label: 'Tutorial / aula' },
  { id: 'tone_tutorial', label: 'Tutorial de timbre' },
  { id: 'playing_music', label: 'Tocando / música' },
  { id: 'gear_review', label: 'Review de equipamento' },
  { id: 'ir_pack', label: 'Pack de IR' },
  { id: 'before_after_tone', label: 'Antes/depois de timbre' },
  { id: 'mixed_speech_music', label: 'Vídeo misto fala + música' },
  { id: 'youtube_long', label: 'Vídeo longo para YouTube' },
  { id: 'shorts_from_long', label: 'Shorts derivados' },
];

const CLEAN_EDIT_DESTINATIONS = [
  { id: 'shorts_vertical', label: 'Shorts / Reels / TikTok 9:16' },
  { id: 'youtube_horizontal', label: 'YouTube horizontal 16:9' },
  { id: 'both', label: 'Ambos: vídeo longo + shorts' },
  { id: 'clean_original', label: 'Apenas limpar o vídeo original' },
];

const PAUSE_CUT_MODES = [
  { id: 'off', label: 'Desligado' },
  { id: 'soft', label: 'Suave' },
  { id: 'normal', label: 'Normal' },
  { id: 'aggressive', label: 'Agressivo' },
];

const MISTAKE_CUT_MODES = [
  { id: 'off', label: 'Desligado' },
  { id: 'soft', label: 'Suave' },
  { id: 'normal', label: 'Normal' },
];

// v29: Video Squad objectives
const OBJECTIVES = [
  { id: 'viral',        icon: '🔥', label: 'Viral',       desc: 'Máxima retenção e compartilhamento' },
  { id: 'educational',  icon: '📚', label: 'Educativo',   desc: 'Insights e ensinamentos' },
  { id: 'sales',        icon: '💰', label: 'Vendas',       desc: 'Prova, oferta, CTA' },
  { id: 'motivational', icon: '💪', label: 'Motivacional', desc: 'Emoção e inspiração' },
  { id: 'podcast',      icon: '🎙️', label: 'Podcast',      desc: 'Respostas e histórias' },
  { id: 'hot',          icon: '⚡', label: 'Quentes',      desc: 'Os momentos mais intensos' },
  { id: 'sports_goals', icon: '⚽', label: 'Gols / Lances', desc: 'Picos de narração e impacto esportivo' },
  { id: 'sports_reel',  icon: '📱', label: 'Sports Reel',  desc: 'Formato vertical 9:16 para Reels/TikTok' },
];

const FORMATS = [
  { id: '9:16',  label: '9:16 Vertical' },
  { id: '1:1',   label: '1:1 Quadrado' },
  { id: '4:5',   label: '4:5 Retrato' },
  { id: '16:9',  label: '16:9 Horizontal' },
];

const CAPTION_STYLES = [
  { id: 'none',         label: 'Sem legenda', color: 'bg-gray-800 text-gray-300' },
  { id: 'classic',      label: 'Clássico',    color: 'bg-white text-black' },
  { id: 'default',      label: 'Clássico',    color: 'bg-white text-black' },
  { id: 'fire',         label: '🔥 Fire',      color: 'bg-orange-500 text-white' },
  { id: 'neon',         label: '💚 Neon',      color: 'bg-green-400 text-black' },
  { id: 'gospel',       label: '✝ Gospel',     color: 'bg-yellow-600 text-white' },
  { id: 'capcut_bold',  label: 'CapCut Bold', color: 'bg-yellow-300 text-black' },
  { id: 'tiktok_highlight', label: 'TikTok Highlight', color: 'bg-cyan-300 text-black' },
  { id: 'reels_clean', label: 'Reels Clean', color: 'bg-sky-200 text-black' },
  { id: 'word_by_word', label: 'Palavra por palavra', color: 'bg-pink-300 text-black' },
  { id: 'worship_clean', label: 'Worship Clean', color: 'bg-amber-100 text-black' },
  { id: 'minimal_professional', label: 'Minimal Pro', color: 'bg-gray-200 text-black' },
  { id: 'big_hook', label: 'Big Hook', color: 'bg-red-500 text-white' },
  { id: 'highcontrast', label: '⬛ Contraste', color: 'bg-black text-white border border-white' },
];

const CLIP_COUNT_OPTIONS = ['auto', 3, 5, 10, 15, 20, 30, 40, 50, 80, 100];

const CLIP_DURATION_OPTIONS = [
  { label: 'Auto', value: 'auto', mode: 'auto' },
  { label: '15s', value: 15, mode: 'fixed' },
  { label: '30s', value: 30, mode: 'fixed' },
  { label: '40s', value: 40, mode: 'fixed' },
  { label: '60s', value: 60, mode: 'fixed' },
  { label: '90s', value: 90, mode: 'fixed' },
  { label: '120s', value: 120, mode: 'fixed' },
  { label: 'Personalizado', value: 'custom', mode: 'custom' },
];

const LONG_FORM_DURATION_OPTIONS = [
  { label: '180s', value: 180, mode: 'fixed' },
  { label: '300s', value: 300, mode: 'fixed' },
];

const VIDEO_SQUAD_TABS = [
  { id: 'smartcut', label: 'SmartCut Automático', icon: Wand2 },
  { id: 'library', label: 'Biblioteca de Edições', icon: LibraryBig },
  { id: 'examples', label: 'Vídeos Didáticos / Referências', icon: Upload },
  { id: 'frames', label: 'Motor Profissional', icon: Layers3 },
  { id: 'results', label: 'Resultados', icon: BarChart2 },
];

const EMPTY_EDIT_PLAN = {
  name: '',
  description: '',
  platform: 'tiktok',
  niche: '',
  objective: 'viral',
  desiredCutDurationSeconds: 45,
  clipCount: 8,
  rhythm: 'rápido',
  captionStyle: 'big_hook',
  transitionStyle: 'corte seco',
  useZoom: true,
  useJumpCut: true,
  useDryCut: true,
  useMusic: true,
  useBroll: false,
  mandatoryRules: '',
  avoidRules: '',
};

function getClipDurationBounds(seconds) {
  const safeSeconds = Math.min(600, Math.max(5, Number(seconds) || 60));
  const presets = {
    15: { min: 10, max: 20 },
    30: { min: 25, max: 35 },
    40: { min: 35, max: 50 },
    60: { min: 50, max: 75 },
    90: { min: 75, max: 110 },
    120: { min: 100, max: 145 },
    180: { min: 150, max: 210 },
    300: { min: 240, max: 360 },
  };
  const preset = presets[safeSeconds] || {
    min: Math.max(5, Math.round(safeSeconds * 0.82)),
    max: Math.min(600, Math.round(safeSeconds * 1.22)),
  };
  return { min: preset.min, target: safeSeconds, max: preset.max };
}

function isAbortLikeError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return Boolean(err?.isAbort || err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ECONNABORTED' || message === 'request_aborted' || message === 'aborted');
}

// Human-friendly stage labels — product language, not technical
const STAGE_LABELS = {
  queued:            '🕐 Aguardando na fila...',
  recovering:        '🔄 Retomando job anterior...',
  transcribing:      '🎙️ Transcrevendo fala com Whisper...',
  detecting:         '📊 Analisando energia e pausas...',
  analyzing:         '🧠 Identificando os melhores momentos...',
  planning:          '✂️ Selecionando cortes de alto impacto...',
  captions:          '💬 Gerando legendas dinâmicas...',
  rendering:         '🎬 Renderizando vídeo final...',
  // v27 pipeline stages
  probing:           '🔍 Analisando arquivo de vídeo...',
  extracting_audio:  '🎵 Extraindo áudio...',
  detecting_silence: '🔇 Detectando silêncios...',
  detecting_moments: '⚡ Identificando melhores momentos...',
  zipping:           '📦 Gerando ZIP...',
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

const YOUTUBE_AUTH_MESSAGE = 'Este link do YouTube exige autenticação/cookies. Use upload, Google Drive, Dropbox ou link direto do arquivo.';

function getFriendlyImportError(err) {
  const raw = String(
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    'Erro ao importar'
  );
  const lower = raw.toLowerCase();

  if (
    err?.response?.data?.code === 'YOUTUBE_AUTH_REQUIRED' ||
    ['cookies', 'sign in', 'login', 'authentication', 'bot check', 'captcha']
      .some(term => lower.includes(term))
  ) {
    return YOUTUBE_AUTH_MESSAGE;
  }

  if (lower.includes('drive ainda não conectado')) {
    return 'Drive ainda não conectado. Use upload ou link direto.';
  }

  return raw.split('\n')[0].trim();
}

const fmtSize = b => b > 1e9 ? `${(b/1e9).toFixed(1)}GB` : b > 1e6 ? `${(b/1e6).toFixed(1)}MB` : `${Math.round(b/1e3)}KB`;
const fmtTime = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const validNumber = value => Number.isFinite(Number(value));
const formatDurationSafe = value => validNumber(value) ? `${Number(value).toFixed(0)}s` : '—';
const formatDurationRangeSafe = (from, to) => {
  const left = formatDurationSafe(from);
  const right = formatDurationSafe(to);
  return left === '—' && right === '—' ? '—' : `${left}→${right}`;
};
const getClipDuration = clip => clip?.durationSeconds ?? clip?.duration ?? (
  validNumber(clip?.end) && validNumber(clip?.start) ? Number(clip.end) - Number(clip.start) : null
);
const getTelegramStatusLabel = status => ({
  pending:                'Telegram pendente',
  sent:                   'Telegram: vídeo enviado',
  sent_video:             'Telegram: vídeo enviado',
  sent_document:          'Telegram: enviado como documento',
  sent_optimized_video:   'Telegram: vídeo otimizado enviado',
  sent_link_fallback:     'Telegram: link público enviado',
  skipped_not_configured: 'Telegram: não configurado',
  failed_file_missing:    'Telegram: arquivo não encontrado',
  failed_file_too_large:  'Telegram: arquivo grande demais',
  failed_no_public_url:   'Telegram: sem URL pública configurada',
  failed_api_error:       'Telegram: erro de API',
  failed:                 'Telegram: falhou',
}[status] || null);

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

function EditStylePreview({ visualPreviewType = "clean", intensity = "medium", badge = "Base" }) {
  const accentByType = {
    blur: "#ef4444",
    reframe: "#60a5fa",
    beat: "#a78bfa",
    zoom: "#f97316",
    caption: "#22d3ee",
    cinematic: "#f59e0b",
    split: "#34d399",
    podcast: "#94a3b8",
    worship: "#fbbf24",
    product: "#10b981",
    gameplay: "#38bdf8",
    clean: "#9ca3af",
    glitch: "#f43f5e",
  };
  const accent = accentByType[visualPreviewType] || accentByType.clean;
  const pulseOpacity = intensity === "high" ? "55" : intensity === "low" ? "30" : "40";

  return (
    <div className="relative h-20 rounded-lg overflow-hidden bg-gray-950 border border-gray-800">
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, 33, transparent 60%)` }} />

      {(visualPreviewType === "blur" || visualPreviewType === "cinematic") && (
        <>
          <div className="absolute inset-0 opacity-50" style={{ filter: "blur(6px)", background: `radial-gradient(circle at center, 33, transparent 70%)` }} />
          <div className="absolute left-1/2 top-2 bottom-2 w-12 -translate-x-1/2 rounded-md border border-white/20 bg-gray-900/85" />
        </>
      )}

      {visualPreviewType === "reframe" && (
        <>
          <div className="absolute inset-2 rounded border border-white/15" />
          <div className="absolute left-1/2 top-2 bottom-2 w-11 -translate-x-1/2 rounded-md border-2" style={{ borderColor: accent }} />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: accent }} />
        </>
      )}

      {(visualPreviewType === "beat" || visualPreviewType === "zoom" || visualPreviewType === "gameplay") && (
        <>
          <div className="absolute left-3 right-3 top-4 h-1.5 rounded-full" style={{ background: `` }} />
          <div className="absolute left-5 right-5 top-8 h-1.5 rounded-full" style={{ background: `66` }} />
          <div className="absolute left-7 right-7 top-12 h-1.5 rounded-full" style={{ background: `` }} />
        </>
      )}

      {(visualPreviewType === "caption" || visualPreviewType === "product") && (
        <>
          <div className="absolute left-3 right-3 bottom-3 h-3 rounded-md bg-black/45 border border-white/10" />
          <div className="absolute left-5 right-8 bottom-4 h-1.5 rounded" style={{ background: `aa` }} />
          <div className="absolute right-3 bottom-3 h-3 w-3 rounded-sm" style={{ background: `66` }} />
        </>
      )}

      {(visualPreviewType === "cinematic" || visualPreviewType === "worship") && (
        <>
          <div className="absolute inset-x-0 top-0 h-2 bg-black/70" />
          <div className="absolute inset-x-0 bottom-0 h-2 bg-black/70" />
        </>
      )}

      {visualPreviewType === "split" && (
        <>
          <div className="absolute inset-y-2 left-2 right-1/2 border border-white/15 rounded-l-md bg-black/20" />
          <div className="absolute inset-y-2 left-1/2 right-2 border border-white/15 rounded-r-md bg-black/20" />
          <div className="absolute top-2 bottom-2 left-1/2 w-px bg-white/30" />
        </>
      )}

      {visualPreviewType === "podcast" && (
        <>
          <div className="absolute left-2 top-2 bottom-2 w-8 rounded-md border border-white/15 bg-black/25" />
          <div className="absolute left-11 right-2 top-2 bottom-2 rounded-md border border-white/15 bg-black/20" />
          <div className="absolute left-12 right-8 bottom-4 h-1.5 rounded-full bg-white/70" />
        </>
      )}

      {visualPreviewType === "glitch" && (
        <>
          <div className="absolute left-2 right-2 top-4 h-1" style={{ background: `bb` }} />
          <div className="absolute left-4 right-6 top-7 h-1 bg-cyan-300/70" />
          <div className="absolute left-6 right-4 top-10 h-1 bg-pink-400/70" />
          <div className="absolute left-3 right-8 top-[52px] h-1 bg-yellow-300/70" />
        </>
      )}

      <span className="absolute top-2 right-2 rounded px-1 py-0.5 text-[8px] font-bold bg-black/60 text-gray-300">{badge}</span>
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
            <p className="text-[10px] text-blue-500/70 flex items-center gap-1">
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
  const [exportLoading, setExportLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramZipLoading, setTelegramZipLoading] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState({});
  const [validExport, setValidExport] = useState(null);
  const [expandedClips, setExpandedClips] = useState({});
  const s    = job.stats || {};
  const mode = job.processingMode || s.processingMode;
  const isCleanEdit = job.editMode === 'channel_clean_edit' || s.editMode === 'channel_clean_edit';
  const doneTitle = isCleanEdit
    ? 'Channel Clean Edit concluído'
    : mode === 'raw_review'
    ? 'Cortes crus prontos para avaliação'
    : mode === 'finalize_approved'
      ? 'Corte finalizado com acabamento'
      : (s.suggestedTitle || 'Vídeo pronto para publicar');
  const doneSubtitle = isCleanEdit
    ? 'Vídeo limpo com pausas, partes mortas e repetições tratadas localmente.'
    : mode === 'raw_review'
    ? 'Assista no Telegram e escolha quais deseja finalizar.'
    : 'Arquivos válidos renderizados e prontos para envio ou download.';
  const validOutputs = (job.outputs || []).filter(o => o?.valid !== false && Number(o?.fileSize || 0) >= 100 * 1024);
  const hasValidOutputs = validOutputs.length > 0;
  const done = job.status === 'done' && job.success === true && (hasValidOutputs || !!job.downloadUrl);
  const err  = job.status === 'error';
  const generatedCutsCount = validOutputs.length || s.generatedCutsCount || s.cutsApplied || 0;
  const captionsCount = s.captionsCount ?? s.captionBlocks ?? validOutputs.filter(o => o.captionApplied).length ?? 0;
  const removedIssuesCount = s.removedIssuesCount ?? s.fillerRemoved ?? validOutputs.reduce((sum, o) => {
    const removedSegments = Array.isArray(o.removedSegments) ? o.removedSegments.length : 0;
    const removedIssues = Array.isArray(o.removedIssues) ? o.removedIssues.length : 0;
    return sum + removedSegments + removedIssues;
  }, 0);
  const originalDuration = s.originalDuration ?? job.probe?.duration ?? validOutputs[0]?.originalDuration;
  const finalDuration = s.editedDuration ?? s.finalDuration ?? validOutputs.reduce((sum, o) => sum + (validNumber(getClipDuration(o)) ? Number(getClipDuration(o)) : 0), 0);
  const triggerDownload = (url, fileName, message) => {
    const finalUrl = resolveDownloadUrl(url);
    if (!finalUrl) {
      alert(message);
      return;
    }

    const a = document.createElement('a');
    a.href = finalUrl.includes('?') ? `${finalUrl}&download=${Date.now()}` : `${finalUrl}?download=${Date.now()}`;
    a.download = fileName || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const exportValidVideos = async () => {
    if (!job.jobId || exportLoading) return;
    setExportLoading(true);
    try {
      const result = await videoApi.exportValid(job.jobId);
      setValidExport(result);
      if (result?.success) toast.success(`${result.count} vídeo(s) válido(s) exportado(s)`);
      else toast.error(result?.error || 'Nenhum vídeo válido encontrado para exportar.');
    } catch (err) {
      toast.error(err.message || 'Falha ao exportar vídeos válidos');
    } finally {
      setExportLoading(false);
    }
  };

  const telegramLabel = (fileName, fallback = 'Enviar Telegram') => {
    const status = telegramStatus[fileName];
    if (!status || status === '__none') return fallback;
    if (status === 'sending') return 'Enviando...';
    const label = getTelegramStatusLabel(status);
    return label || fallback;
  };

  const sendAllTelegram = async () => {
    if (!job.jobId || telegramLoading) return;
    setTelegramLoading(true);
    setTelegramStatus(prev => ({ ...prev, __all: 'sending' }));
    try {
      const result = await videoApi.sendTelegram({ jobId: job.jobId, mode: 'document', deleteAfterTelegram: true });
      if (result?.files?.length) {
        const next = {};
        result.files.forEach(file => {
          // Usar telegramStatus diretamente quando disponível
          next[file.fileName] = file.telegramStatus || (
            file.telegramSent
              ? 'sent'
              : file.telegramReason === 'Telegram não configurado'
                ? 'skipped_not_configured'
                : 'failed'
          );
        });
        setTelegramStatus(prev => ({ ...prev, ...next, __all: result.sent > 0 ? 'sent' : 'error' }));
      }
      if (result?.success) toast.success(`${result.sent} corte(s) enviado(s) ao Telegram`);
      else {
        const firstFile = result?.files?.[0];
        const label = getTelegramStatusLabel(firstFile?.telegramStatus) || firstFile?.telegramError || result?.error || 'erro desconhecido';
        toast.error(`Telegram: ${label}`);
      }
    } catch (err) {
      setTelegramStatus(prev => ({ ...prev, __all: 'error' }));
      toast.error(`Telegram falhou: ${err.message || 'erro desconhecido'}`);
    } finally {
      setTelegramLoading(false);
    }
  };

  const sendZipTelegram = async () => {
    if (!job.jobId || telegramZipLoading) return;
    setTelegramZipLoading(true);
    setTelegramStatus(prev => ({ ...prev, __zip: 'sending' }));
    try {
      const result = await videoApi.sendTelegramZip({ jobId: job.jobId });
      if (result?.zipSent) {
        setTelegramStatus(prev => ({ ...prev, __zip: 'sent' }));
        toast.success('ZIP enviado ao Telegram');
      } else {
        const status = result?.telegramReason === 'Telegram não configurado' ? 'not_configured' : 'error';
        setTelegramStatus(prev => ({ ...prev, __zip: status }));
        toast.error(result?.telegramReason || result?.error || 'Erro ao enviar ZIP');
      }
    } catch (err) {
      setTelegramStatus(prev => ({ ...prev, __zip: 'error' }));
      toast.error(err.message || 'Erro ao enviar ZIP');
    } finally {
      setTelegramZipLoading(false);
    }
  };

  const sendClipTelegram = async (clip) => {
    if (!job.jobId || !clip?.fileName) return;
    setTelegramStatus(prev => ({ ...prev, [clip.fileName]: 'sending' }));
    try {
      const result = await videoApi.sendTelegram({ jobId: job.jobId, fileName: clip.fileName, mode: 'document', deleteAfterTelegram: true });
      const fileResult = result?.files?.find(file => file.fileName === clip.fileName);
      if (fileResult?.telegramSent) {
        setTelegramStatus(prev => ({ ...prev, [clip.fileName]: 'sent' }));
        toast.success('Corte enviado ao Telegram');
      } else if (fileResult?.telegramStatus === 'sent_link_fallback') {
        setTelegramStatus(prev => ({ ...prev, [clip.fileName]: 'sent_link_fallback' }));
        toast.success('Link enviado no Telegram');
      } else {
        const rawError = fileResult?.telegramError || result?.error || '';
        const status = fileResult?.telegramReason === 'Telegram não configurado'
          ? 'not_configured'
          : rawError.toLowerCase?.().includes('inválido')
            ? 'invalid'
            : 'error';
        setTelegramStatus(prev => ({ ...prev, [clip.fileName]: status }));
        toast.error(`Telegram falhou: ${fileResult?.telegramReason || rawError || 'erro desconhecido'}`);
      }
    } catch (err) {
      setTelegramStatus(prev => ({ ...prev, [clip.fileName]: 'error' }));
      toast.error(`Telegram falhou: ${err.message || 'erro desconhecido'}`);
    }
  };

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
            {done ? doneTitle : err ? 'Falha no processamento' : 'Gerando conteúdo...'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {err
              ? 'Verifique o formato do vídeo ou tente um arquivo diferente.'
              : done
                ? doneSubtitle
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
            {(isCleanEdit ? [
              { icon: Clock, label: 'Original', value: `${Math.round(s.originalDuration || 0)}s` },
              { icon: Clock, label: 'Final', value: `${Math.round(s.finalDuration || s.editedDuration || 0)}s` },
              { icon: Scissors, label: 'Cortes', value: s.cutsMade ?? s.cutsApplied ?? 0 },
              { icon: TrendingUp, label: 'Removido', value: `${Math.round(s.removedDuration || 0)}s` },
            ] : [
              { icon: Clock,     label: 'Duração',    value: formatDurationRangeSafe(originalDuration, finalDuration) },
              { icon: Scissors,  label: 'Cortes',     value: generatedCutsCount },
              { icon: Captions,  label: 'Legendas',   value: captionsCount },
              { icon: TrendingUp,label: 'Removidos',  value: `${removedIssuesCount} vícios` },
            ]).map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-gray-900 px-2 py-2.5 text-center">
                <Icon size={12} className="mx-auto text-gray-600 mb-1" />
                <p className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</p>
                <p className="text-xs font-bold text-gray-200 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {isCleanEdit && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-800 border-t border-gray-800">
              {[
                ['Pausas', s.pauseCutMode],
                ['Erros', s.mistakeCutMode],
                ['Estilo', s.editStyleName || s.editStyle],
                ['Engine', s.engineLabel || s.engine || s.renderEngine],
                ['Metadados', s.metadataRemoved ? 'removidos' : 'preservados'],
                ['Segmentos', s.segmentsKept],
                ['Destino', s.destination],
                ['Relatório', s.metadataReport ? 'disponível' : 'gerado'],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-900 px-2 py-2">
                  <p className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</p>
                  <p className="text-[11px] font-bold text-gray-300 truncate">{value ?? '-'}</p>
                </div>
              ))}
            </div>
          )}

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

          {s.supervisorReview && (
            <div className="px-4 py-3 border-t border-gray-800 space-y-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">IA Supervisora</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-gray-900 px-2 py-1.5 border border-gray-800">
                  <span className="text-gray-500">Aprovação:</span>{' '}
                  <span className={s.supervisorReview.approved ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    {s.supervisorReview.approved ? 'aprovado' : 'revisar'}
                  </span>
                </div>
                <div className="rounded-lg bg-gray-900 px-2 py-1.5 border border-gray-800">
                  <span className="text-gray-500">Score:</span>{' '}
                  <span className="text-gray-200 font-bold">{s.supervisorReview.score}</span>
                </div>
              </div>
              {Array.isArray(s.supervisorReview.issues) && s.supervisorReview.issues.length > 0 && (
                <div className="rounded-lg bg-red-950/20 border border-red-900/40 px-2 py-2">
                  {s.supervisorReview.issues.slice(0, 3).map((issue, idx) => (
                    <p key={idx} className="text-[11px] text-red-200">• {issue}</p>
                  ))}
                </div>
              )}
              {Array.isArray(s.supervisorReview.improvements) && s.supervisorReview.improvements.length > 0 && (
                <div className="rounded-lg bg-gray-900 border border-gray-800 px-2 py-2">
                  {s.supervisorReview.improvements.slice(0, 3).map((item, idx) => (
                    <p key={idx} className="text-[11px] text-gray-300">• {item}</p>
                  ))}
                </div>
              )}
              {s.supervisorReview.finalRecommendation && (
                <p className="text-[11px] text-brand-300">{s.supervisorReview.finalRecommendation}</p>
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

          {/* v28: Pipeline clips with metadata status */}
          {hasValidOutputs && (
            <div className="p-3 space-y-2 border-t border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                  <Film size={10} />
                  {job.requestedClipCount && job.requestedClipCount !== validOutputs.length
                    ? `${validOutputs.length} de ${job.requestedClipCount} corte(s) solicitado(s)`
                    : `${validOutputs.length} corte(s) gerado(s)`}
                </p>
                <button
                  type="button"
                  onClick={sendAllTelegram}
                  disabled={telegramLoading}
                  className="flex items-center gap-1 rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600 disabled:opacity-40"
                >
                  <Send size={10} /> {telegramLabel('__all', 'Enviar todos para Telegram')}
                </button>
              </div>
              {job.reasonIfGeneratedLess && (
                <p className="text-[10px] text-yellow-400 bg-yellow-400/10 rounded-lg px-2 py-1.5">
                  {job.reasonIfGeneratedLess}
                </p>
              )}
              {validOutputs.map((o, i) => {
                const clipUrl = resolveDownloadUrl(o.downloadUrl || o.url || o.outputUrl);
                const initialStatus = o.telegramSent
                  ? 'sent'
                  : o.telegramStatus === 'sent_link_fallback'
                    ? 'sent_link_fallback'
                  : o.telegramSkipped
                    ? 'not_configured'
                    : o.telegramError
                      ? 'error'
                      : null;
                const clipTelegramLabel = telegramStatus[o.fileName] ? telegramLabel(o.fileName) : telegramLabel(initialStatus ? o.fileName : '', initialStatus === 'error' ? 'Reenviar para Telegram' : (getTelegramStatusLabel(initialStatus) || 'Enviar Telegram'));
                const isExpanded = expandedClips[i];
                const sb = o.scoreBreakdown || {};
                const sig = o.signals || {};
                const metaRemoved = o.metadata?.metadataRemoved ?? o.metadata?.sanitized ?? false;
                return (
                  <div key={i} className="bg-gray-800/60 rounded-xl overflow-hidden">
                    {/* Clip header row */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Play size={11} className="text-brand-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200 truncate">{o.title || o.fileName || `Corte ${i + 1}${job.requestedClipCount ? ` de ${job.requestedClipCount}` : ''}`}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-[10px] text-gray-600">{formatDurationSafe(getClipDuration(o))}</span>
                          {o.score != null && (
                            <span className="text-[10px] font-bold px-1 rounded"
                              style={{background:'rgba(229,9,20,0.12)',color:'#f87171'}}>
                              score {o.score}
                            </span>
                          )}
                          {metaRemoved && <span className="text-[10px] px-1 rounded" style={{background:'rgba(52,211,153,0.12)',color:'#34d399'}}>metadados removidos</span>}
                          {getTelegramStatusLabel(o.telegramStatus) && (
                            <span
                              className="text-[10px] px-1 rounded"
                              title={o.telegramError ? `Telegram falhou: ${o.telegramError}` : undefined}
                              style={{
                                background: ['sent', 'sent_link_fallback'].includes(o.telegramStatus) ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                                color: ['sent', 'sent_link_fallback'].includes(o.telegramStatus) ? '#34d399' : '#f87171',
                              }}
                            >
                              {getTelegramStatusLabel(o.telegramStatus)}
                            </span>
                          )}
                          {o.telegramError && <span className="text-[10px] text-red-400">Telegram falhou: {o.telegramError}</span>}
                          {sig.beatAligned && <span className="text-[10px] px-1 rounded" style={{background:'rgba(167,139,250,0.12)',color:'#a78bfa'}}>beat</span>}
                          {sig.probableChorus && <span className="text-[10px] px-1 rounded" style={{background:'rgba(251,191,36,0.12)',color:'#fbbf24'}}>refrão/drop</span>}
                          {sig.personDetected && <span className="text-[10px] px-1 rounded" style={{background:'rgba(96,165,250,0.12)',color:'#60a5fa'}}>pessoa</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => setExpandedClips(p => ({...p, [i]: !p[i]}))}
                        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors shrink-0 px-1">
                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                      <button type="button" onClick={() => sendClipTelegram(o)}
                        disabled={!o.fileName || telegramStatus[o.fileName] === 'sending'}
                        className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-brand-300 transition-colors shrink-0 disabled:opacity-40">
                        <Send size={12} /> {clipTelegramLabel}
                      </button>
                      <button type="button" disabled={!clipUrl}
                        onClick={async () => triggerDownload(await getDownloadUrl(job.jobId, o.fileName), o.fileName || 'corte.mp4', 'Arquivo do corte ainda não foi gerado ou é inválido.')}
                        className="text-brand-400 hover:text-brand-300 transition-colors shrink-0 disabled:opacity-40">
                        <Download size={14} />
                      </button>
                    </div>

                    {/* Expandable proof section */}
                    {isExpanded && (
                      <div className="border-t border-gray-700/60 px-3 py-2.5 space-y-2.5 text-[10px]">
                        {/* Reason */}
                        {o.reason && (
                          <div>
                            <p className="text-gray-500 uppercase tracking-wider mb-0.5">Motivo do corte</p>
                            <p className="text-gray-300">{o.reason}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-900 rounded px-2 py-1.5">
                            <p className="text-gray-600 uppercase tracking-wider">Estilo de edição</p>
                            <p className="text-gray-300 font-bold">{o.editStyleName || o.editStyle || 'Cinematic Blur'}</p>
                          </div>
                          <div className="bg-gray-900 rounded px-2 py-1.5">
                            <p className="text-gray-600 uppercase tracking-wider">Engine usada</p>
                            <p className="text-gray-300 font-bold">{o.engineLabel || (o.engineUsed === 'ffmpeg_remotion' ? 'FFmpeg + Remotion' : o.engineUsed === 'ffmpeg_fallback' ? 'FFmpeg fallback' : 'FFmpeg')}</p>
                          </div>
                        </div>

                        {o.editMode === 'channel_clean_edit' && (
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              ['Original', `${Math.round(o.originalDuration || s.originalDuration || 0)}s`],
                              ['Final', `${Math.round(o.finalDuration || o.duration || 0)}s`],
                              ['Removido', `${Math.round(o.removedDuration || 0)}s`],
                              ['Cortes feitos', o.cutsMade ?? 0],
                              ['Pausas', o.pauseCutMode],
                              ['Erros de fala', o.mistakeCutMode],
                              ['Segmentos', o.segmentsKept],
                              ['Relatório', o.metadataReport || 'channel_clean_edit_report.json'],
                            ].map(([label, value]) => (
                              <div key={label} className="bg-gray-900 rounded px-2 py-1.5">
                                <p className="text-gray-600 uppercase tracking-wider">{label}</p>
                                <p className="text-gray-300 font-bold truncate">{value ?? '-'}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Entry / Middle / Exit */}
                        {(o.entryPointReason || o.middleReason || o.exitPointReason) && (
                          <div className="space-y-1">
                            {o.entryPointReason && <p className="text-gray-400"><span className="text-green-400 font-bold">Início:</span> {o.entryPointReason}</p>}
                            {o.middleReason && <p className="text-gray-400"><span className="text-yellow-400 font-bold">Meio:</span> {o.middleReason}</p>}
                            {o.exitPointReason && <p className="text-gray-400"><span className="text-red-400 font-bold">Final:</span> {o.exitPointReason}</p>}
                          </div>
                        )}

                        {/* Score breakdown */}
                        {Object.keys(sb).length > 0 && (
                          <div>
                            <p className="text-gray-500 uppercase tracking-wider mb-1">Score breakdown</p>
                            <div className="grid grid-cols-3 gap-1">
                              {Object.entries(sb).map(([k, v]) => (
                                <div key={k} className="bg-gray-900 rounded px-1.5 py-1 text-center">
                                  <p className="text-gray-600" style={{fontSize:'9px'}}>{k}</p>
                                  <p className="text-gray-300 font-bold">{typeof v === 'number' ? v.toFixed(1) : v}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tools used */}
                        <div>
                          <p className="text-gray-500 uppercase tracking-wider mb-1">Ferramentas usadas</p>
                          <div className="flex flex-wrap gap-1">
                            {[
                              ['OpenCV', sig.opencvUsed],
                              ['PySceneDetect', sig.sceneUsed],
                              ['YOLO', sig.yoloUsed],
                              ['librosa/beat', sig.beatUsed],
                              ['Transcrição', sig.transcriptUsed],
                              ['IA forte', sig.aiUsed],
                              ['FFmpeg', (o.toolsUsed || []).some(t => String(t).includes('FFmpeg')) || Boolean(o.engineUsed)],
                              ['Remotion', (o.toolsUsed || []).some(t => String(t).includes('Remotion'))],
                            ].map(([label, used]) => (
                              <span key={label} className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                style={{
                                  background: used ? 'rgba(52,211,153,0.15)' : 'rgba(75,85,99,0.3)',
                                  color: used ? '#34d399' : '#6b7280',
                                }}>
                                {used ? '✓' : '—'} {label}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Metadata proof */}
                        <div className="flex items-center gap-2">
                          <span style={{color: metaRemoved ? '#34d399' : '#9ca3af'}}>
                            Metadados: {metaRemoved ? 'REMOVIDOS' : 'não removidos'}
                          </span>
                          {o.start != null && o.end != null && (
                            <span className="text-gray-600">· {o.start}s → {o.end}s</span>
                          )}
                        </div>

                        {o.metadata?.metadataReport && (
                          <div className="rounded bg-gray-900 px-2 py-1.5">
                            <p className="text-gray-500 uppercase tracking-wider mb-1">Relatório de metadados</p>
                            <p className="text-gray-400">
                              removidos={String(o.metadata.metadataRemoved)} · custom={String(o.metadata.customMetadataApplied)}
                            </p>
                          </div>
                        )}

                        {/* SmartCut proof */}
                        <div className="flex flex-wrap gap-2 text-gray-500">
                          <span style={{color:'#818cf8'}}>usedSmartCut=true</span>
                          <span style={{color:'#f87171'}}>usedFixedChunking=false</span>
                          {o.source && <span>source={o.source}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(() => {
                const zipDownloadUrl = resolveDownloadUrl(job?.zipUrl);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!zipDownloadUrl}
                      onClick={async () => triggerDownload(await getDownloadUrl(job.jobId, 'clips.zip'), '', 'ZIP ainda não foi gerado.')}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-semibold transition-colors text-white disabled:opacity-40"
                      style={{background:'rgba(229,9,20,0.15)',border:'1px solid rgba(229,9,20,0.3)'}}
                    >
                      <Download size={12} /> Baixar ZIP com todos os cortes
                    </button>
                    <button
                      type="button"
                      disabled={telegramZipLoading}
                      onClick={sendZipTelegram}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 border border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600"
                    >
                      <Send size={12} /> {telegramLabel('__zip', 'Enviar ZIP para Telegram')}
                    </button>
                    {!zipDownloadUrl && job.zipError && (
                      <p className="text-[10px] text-red-400 sm:col-span-2">ZIP falhou: {job.zipError}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="p-3 space-y-2 border-t border-gray-800">
            <button
              type="button"
              onClick={exportValidVideos}
              disabled={exportLoading}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 border border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600"
            >
              <Download size={12} /> {exportLoading ? 'Exportando...' : 'Exportar vídeos válidos'}
            </button>

            {validExport?.success && (
              <div className="space-y-1.5 rounded-xl border border-gray-800 bg-gray-950/40 p-2">
                <button
                  type="button"
                  onClick={() => triggerDownload(validExport.zipUrl, 'clips-validos.zip', 'ZIP válido ainda não foi gerado.')}
                  className="flex items-center gap-2 text-xs font-semibold text-brand-300 hover:text-brand-200"
                >
                  <Download size={12} /> ZIP válido ({validExport.count})
                </button>
                {validExport.files?.map(file => (
                  <button
                    key={file.url}
                    type="button"
                    onClick={() => triggerDownload(file.url, file.fileName, 'Arquivo válido não encontrado.')}
                    className="block w-full truncate text-left text-[11px] text-gray-400 hover:text-gray-200"
                  >
                    {file.fileName} · {Math.round(file.size / 1024 / 1024)} MB
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => triggerDownload(validExport.manifestUrl, 'manifest.json', 'Manifest não encontrado.')}
                  className="block text-[11px] text-gray-500 hover:text-gray-300"
                >
                  manifest.json
                </button>
              </div>
            )}
          </div>

          {/* Downloads (legacy single video job) */}
          {!hasValidOutputs && (
          <div className="p-4 flex gap-2 border-t border-gray-800">
            <button
              type="button"
              disabled={!resolveDownloadUrl(job.downloadUrl)}
              onClick={async () => triggerDownload(await getDownloadUrl(job.jobId, job.outputFile || (job.downloadUrl || '').split('/').pop()), job.outputFile || 'video.mp4', 'Arquivo de vídeo ainda não foi gerado ou é inválido.')}
              className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-40">
              <Download size={15} /> Baixar Vídeo
            </button>
            {job.captionsUrl && (
              <button
                type="button"
                disabled={!resolveDownloadUrl(job.captionsUrl)}
                onClick={() => triggerDownload(job.captionsUrl, job.captionsFile || 'captions.srt', 'Arquivo SRT ainda não foi gerado.')}
                className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold py-3 px-4 rounded-xl transition-colors">
                <Captions size={15} /> SRT
              </button>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

// v30: Map all backend status values to human-readable labels
const STATUS_LABELS = {
  queued:               'Na fila...',
  probing:              'Analisando vídeo...',
  transcribing:         'Transcrevendo áudio...',
  analyzing:            'Detectando silêncios...',
  detecting:            'IA detectando destaques...',
  detecting_highlights: 'IA detectando destaques...',
  rendering:            'Renderizando cortes...',
  generating_metadata:  'Gerando metadados...',
  writing_metadata:     'Aplicando metadados...',
  zipping:              'Compactando arquivos...',
  exporting:            'Exportando...',
  done:                 'Concluído!',
  error:                'Erro no processamento',
  failed:               'Falhou',
};

export default function VideoPage() {
  const [files,        setFiles]        = useState([]);
  const [mode,         setMode]         = useState('auto');
  const [platform,     setPlatform]     = useState(null);
  const [captionStyle, setCaptionStyle] = useState('none');
  const [editStyle,    setEditStyle]    = useState('cinematic-blur');
  const [extraInstr,   setExtraInstr]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [jobs,         setJobs]         = useState([]);
  const [chatMsg,      setChatMsg]      = useState('');
  const [chatHistory,  setChatHistory]  = useState([]);
  const [chatLoading,  setChatLoading]  = useState(false);
  const [activeTab,    setActiveTab]    = useState('editor');
  const [videoSquadTab, setVideoSquadTab] = useState('smartcut');
  const [editPlans, setEditPlans] = useState([]);
  const [references, setReferences] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planDraft, setPlanDraft] = useState(EMPTY_EDIT_PLAN);
  const [selectedEditPlanId, setSelectedEditPlanId] = useState('');
  const [selectedReferenceId, setSelectedReferenceId] = useState('');
  const [useReferenceStyle, setUseReferenceStyle] = useState(true);
  const [useFrameCutAnalysis, setUseFrameCutAnalysis] = useState(true);
  const [referenceForm, setReferenceForm] = useState({
    name: '',
    description: '',
    notes: '',
    likedAspects: '',
    niche: '',
    tags: '',
    planId: '',
    platformHint: 'tiktok',
    file: null,
    linkUrl: '',
  });
  const [uploadingReference, setUploadingReference] = useState(false);
  const [referenceUploadProgress, setReferenceUploadProgress] = useState(0);
  const [referenceUiError, setReferenceUiError] = useState('');
  const [referencePreviewErrors, setReferencePreviewErrors] = useState({});
  const [lastStyleAnalysis, setLastStyleAnalysis] = useState(null);
  const [lastFrameCutAnalysis, setLastFrameCutAnalysis] = useState(null);
  const [lastSupervisorReview, setLastSupervisorReview] = useState(null);
  const [lastSupervisorChecklist, setLastSupervisorChecklist] = useState([]);
  const [lastAutoAnalysis, setLastAutoAnalysis] = useState(null);
  const [lastGeneratedEditPlan, setLastGeneratedEditPlan] = useState(null);
  const [learnedPresets, setLearnedPresets] = useState([]);
  const [videoToolsStatus, setVideoToolsStatus] = useState(null);
  const [videoProToolchain, setVideoProToolchain] = useState(null);
  const [videoProReadiness, setVideoProReadiness] = useState(null);
  const [videoProFallbacks, setVideoProFallbacks] = useState([]);
  const [videoProPresets, setVideoProPresets] = useState([]);
  const [videoProColorPresets, setVideoProColorPresets] = useState([]);
  const [videoProAudioPresets, setVideoProAudioPresets] = useState([]);
  // Motor Profissional interactive pipeline state
  const [proJobRunning, setProJobRunning] = useState(false);
  const [proJobStage, setProJobStage] = useState(null); // null|'analyze'|'highlights'|'render'|'done'|'error'
  const [proAnalysisResult, setProAnalysisResult] = useState(null);
  const [proHighlightsResult, setProHighlightsResult] = useState(null);
  const [proRenderResult, setProRenderResult] = useState(null);
  const [proJobError, setProJobError] = useState(null);
  const [proSourceVideo, setProSourceVideo] = useState('');
  const [proPresetId, setProPresetId] = useState('sports_highlight_pro');
  const [proClipCount, setProClipCount] = useState(3);
  const [proTargetDuration, setProTargetDuration] = useState(30);
  const [referenceLearningJob, setReferenceLearningJob] = useState(null);
  const [referenceTutorialAnalysis, setReferenceTutorialAnalysis] = useState(null);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  // Full Studio
  const [fsPresetId, setFsPresetId] = useState('podcast_studio_full_studio');
  const [fsPreflight, setFsPreflight] = useState(null);  // { ready, status, missingRequiredTools, blockingReasons, nextActions }
  const [fsPreflightLoading, setFsPreflightLoading] = useState(false);
  const [fsRenderLoading, setFsRenderLoading] = useState(false);
  const [fsRenderResult, setFsRenderResult] = useState(null);
  const [fsError, setFsError] = useState('');

  // Motor Pro — Referência
  const [portfolioProAnalyzed, setPortfolioProAnalyzed] = useState({}); // { [refId]: { proRefId, styleProfile, loading, error } }
  const [proRefUrl, setProRefUrl] = useState('');
  const [proRefName, setProRefName] = useState('');
  const [proRefCategory, setProRefCategory] = useState('general');
  const [proRefId, setProRefId] = useState('');
  const [proRefStyleProfile, setProRefStyleProfile] = useState(null);
  const [proRefLoading, setProRefLoading] = useState(false);
  const [proRefError, setProRefError] = useState('');
  const [proRefRenderLoading, setProRefRenderLoading] = useState(false);
  const [proRefRenderResult, setProRefRenderResult] = useState(null);
  const [objective,          setObjective]          = useState('viral');
  const [processingMode,     setProcessingMode]     = useState('raw_review');
  const [editMode,           setEditMode]           = useState('best_moments');
  const [videoContentType,   setVideoContentType]   = useState('talking_video');
  const [cleanDestination,   setCleanDestination]   = useState('youtube_horizontal');
  const [pauseCutMode,       setPauseCutMode]       = useState('normal');
  const [mistakeCutMode,     setMistakeCutMode]     = useState('soft');
  const [clipCountMode,      setClipCountMode]      = useState('auto');
  const [clipCount,          setClipCount]          = useState(null);
  const [clipDurationMode,   setClipDurationMode]   = useState('fixed');
  const [clipDurationSeconds,setClipDurationSeconds]= useState(40);
  const [customClipDurationSeconds, setCustomClipDurationSeconds] = useState(45);
  const [clipFormat,         setClipFormat]         = useState('9:16');
  const [useSquadPipeline,   setUseSquadPipeline]   = useState(true);
  const [showAdvanced,       setShowAdvanced]       = useState(false);
  const [showImportUrl,      setShowImportUrl]      = useState(false);
  const [importUrl,          setImportUrl]          = useState('');
  const [importSourceType,   setImportSourceType]   = useState('direct_url');
  const [confirmedAuthorized,setConfirmedAuthorized]= useState(false);
  const [showMetaPanel,      setShowMetaPanel]      = useState(false);
  const [autoSendTelegram,   setAutoSendTelegram]   = useState(false);
  const [captionsEnabled,    setCaptionsEnabled]    = useState(false);
  const [dynamicCutsEnabled, setDynamicCutsEnabled] = useState(true);
  const [metadataCleanup,    setMetadataCleanup]    = useState(true);
  const [editPace,           setEditPace]           = useState('medium');
  const [minScore,           setMinScore]           = useState(70);
  const [metaTitle,          setMetaTitle]          = useState('');
  const [metaAuthor,         setMetaAuthor]         = useState('BotSquad');
  const [metaComment,        setMetaComment]        = useState('Created with BotSquad');
  const [metaTags,           setMetaTags]           = useState('tiktok,kwai,shorts,reels');
  const [styleSearch, setStyleSearch] = useState('');
  const [styleCategory, setStyleCategory] = useState('Todos');
  const [expandedStyles, setExpandedStyles] = useState({});
  const chatEndRef = useRef(null);
  const pollRefs   = useRef({});
  const submitLockRef = useRef(false);
  const smartcutSectionRef = useRef(null);
  const librarySectionRef = useRef(null);
  const examplesSectionRef = useRef(null);
  const framesSectionRef = useRef(null);
  const resultsSectionRef = useRef(null);
  const hasSelectedFile = files.length > 0;
  const hasImportLink = importUrl.trim().length > 0;
  const hasVideoSource = hasSelectedFile || hasImportLink;
  const isChannelCleanEdit = editMode === 'channel_clean_edit';

  const uploadSelectedVideo = async (file) => {
    const initResp = await videoApi.uploadInit({ fileName: file.name, fileSize: file.size, mimeType: file.type || 'video/mp4' });
    const { uploadId, chunkSize = CHUNK_SIZE } = initResp;
    const realChunkSize = chunkSize || CHUNK_SIZE;
    const numChunks = Math.ceil(file.size / realChunkSize);

    for (let i = 0; i < numChunks; i += 1) {
      const start = i * realChunkSize;
      const end = Math.min(start + realChunkSize, file.size);
      const blob = file.slice(start, end);
      const chunkFd = new FormData();
      chunkFd.append('uploadId', uploadId);
      chunkFd.append('chunkIndex', String(i));
      chunkFd.append('totalChunks', String(numChunks));
      chunkFd.append('chunk', blob, `chunk_${i}`);
      await videoApi.uploadChunk(chunkFd);
      toast.loading(`Enviando... ${Math.round(((i + 1) / numChunks) * 100)}%`, { id: 'upload' });
    }

    return videoApi.uploadComplete({ uploadId, totalChunks: numChunks });
  };
  const selectedPlan = editPlans.find(plan => plan.id === selectedEditPlanId) || null;
  const selectedReference = references.find(ref => ref.id === selectedReferenceId) || null;
  const currentPlanReferences = selectedEditPlanId
    ? references.filter(ref => ref.planId === selectedEditPlanId)
    : references;
  const referenceStatusLabel = status => {
    const raw = String(status || '').toLowerCase();
    if (raw === 'uploaded') return 'enviado';
    if (raw === 'saved') return 'enviado';
    if (raw === 'analyzing') return 'analisando';
    if (raw === 'analyzed') return 'analisado';
    if (raw === 'error') return 'erro';
    return raw || 'enviado';
  };
  const resolveMediaUrl = useCallback((item = {}) => {
    const raw = String(
      item?.publicUrl
      || item?.video?.publicUrl
      || item?.reference?.publicUrl
      || item?.url
      || item?.video?.url
      || item?.reference?.url
      || item?.fileUrl
      || item?.sourceUrl
      || '',
    ).trim();
    if (!raw) return '';

    if (raw.startsWith('http://localhost') || raw.startsWith('http://127.0.0.1')) {
      if (typeof window !== 'undefined') return raw.replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+/, window.location.origin);
      return raw;
    }

    if (raw.startsWith('http://botsquad.online')) {
      return raw.replace('http://botsquad.online', 'https://botsquad.online');
    }

    if (raw.startsWith('/')) {
      if (typeof window !== 'undefined') return `${window.location.origin}${raw}`;
      return raw;
    }

    return raw;
  }, []);
  const normalizeReferenceItem = useCallback((ref = {}) => {
    const previewUrl = resolveMediaUrl(ref);
    return {
      ...ref,
      previewUrl,
      sourceType: ref.sourceType || (ref.sourceUrl ? 'link' : 'upload'),
    };
  }, [resolveMediaUrl]);
  const showReferenceError = useCallback((message, fallback = 'Falha ao processar referência de edição') => {
    const text = String(message || fallback);
    setReferenceUiError(text);
    toast.error(text, { id: 'reference-upload-error' });
  }, []);

  const selectedEditStyleMeta = getStyleById(editStyle);
  const styleSearchTerm = styleSearch.trim().toLowerCase();
  const visibleEditStyles = VIDEO_EDIT_STYLES.filter(style => {
    const byCategory = styleCategory === 'Todos'
      ? true
      : styleCategory === 'Recomendados'
        ? style.badge === 'Recomendado'
        : style.category === styleCategory;
    if (!byCategory) return false;
    if (!styleSearchTerm) return true;
    return style.name.toLowerCase().includes(styleSearchTerm);
  });

  const visibleClipDurationOptions = mode === 'long'
    ? [
        ...CLIP_DURATION_OPTIONS.filter(option => option.value !== 'custom'),
        ...LONG_FORM_DURATION_OPTIONS,
        CLIP_DURATION_OPTIONS.find(option => option.value === 'custom'),
      ].filter(Boolean)
    : CLIP_DURATION_OPTIONS;
  const selectedClipDurationOption = visibleClipDurationOptions.find(option => option.value === clipDurationSeconds) || CLIP_DURATION_OPTIONS.find(option => option.value === 60);
  const clipDurationPayload = (() => {
    if (processingMode === 'finalize_approved') {
      return {
        clipDurationSeconds: null,
        clipDurationMode: null,
        targetClipDuration: null,
        minClipDuration: null,
        maxClipDuration: null,
      };
    }
    if (clipDurationMode === 'auto' || selectedClipDurationOption?.mode === 'auto') {
      return {
        clipDurationSeconds: 'auto',
        clipDurationMode: 'auto',
        targetClipDuration: null,
        minClipDuration: null,
        maxClipDuration: null,
      };
    }
    if (clipDurationMode === 'custom' || selectedClipDurationOption?.mode === 'custom') {
      const customBounds = getClipDurationBounds(customClipDurationSeconds);
      return {
        clipDurationSeconds: customBounds.target,
        clipDurationMode: 'fixed',
        targetClipDuration: customBounds.target,
        minClipDuration: customBounds.min,
        maxClipDuration: customBounds.max,
      };
    }
    const bounds = getClipDurationBounds(selectedClipDurationOption?.value ?? 60);
    return {
      clipDurationSeconds: bounds.target,
      clipDurationMode: 'fixed',
      targetClipDuration: bounds.target,
      minClipDuration: bounds.min,
      maxClipDuration: bounds.max,
    };
  })();

  const editStylePayload = {
    editStyle: selectedEditStyleMeta.id,
    editStyleId: selectedEditStyleMeta.id,
    editStyleName: selectedEditStyleMeta.name,
    editStyleCategory: selectedEditStyleMeta.category,
    editStyleEffects: selectedEditStyleMeta.effects,
    captionBehavior: selectedEditStyleMeta.captionBehavior,
    motionBehavior: selectedEditStyleMeta.motionBehavior,
    cropBehavior: selectedEditStyleMeta.cropBehavior,
    styleAiInstructions: selectedEditStyleMeta.aiInstructions,
  };

  const submitDisabledReason = (() => {
    if (submitting || submitLockRef.current) return 'Processamento em andamento';
    if (!hasVideoSource) return 'Selecione um vídeo ou cole um link para continuar';
    if (hasImportLink && importSourceType === 'youtube_authorized' && !confirmedAuthorized) return 'Confirme que você tem autorização para baixar este conteúdo';
    return '';
  })();
  const isSubmitDisabled = Boolean(submitDisabledReason);

  const startPolling = (jobId, isPipeline = false) => {
    if (pollRefs.current[jobId]) return;
    const id = setInterval(async () => {
      try {
        // Try pipeline endpoint first for new jobs, fall back to legacy
        let data;
        if (isPipeline) {
          data = await videoApi.getPipelineJob(jobId);
        } else {
          data = await videoApi.getJob(jobId);
        }
        setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...data } : j));
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRefs.current[jobId]);
          delete pollRefs.current[jobId];
          if (data.status === 'done') toast.success(`Pronto! ${data.outputs?.length || ''} corte(s) gerado(s) 🚀`);
          else toast.error('Erro no processamento. Verifique o formato ou tente outro arquivo.');
        }
      } catch { /* network hiccup — try next cycle */ }
    }, 3000);
    pollRefs.current[jobId] = id;
  };

  const startUnifiedJobPolling = jobId => {
    if (pollRefs.current[jobId]) return;
    const id = setInterval(async () => {
      try {
        const data = await videoApi.getVideoJob(jobId);
        setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...data, agent: 'supervisor' } : j));
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRefs.current[jobId]);
          delete pollRefs.current[jobId];
          if (data.status === 'done') {
            const result = await videoApi.getRenderResults(jobId).catch(() => null);
            if (result?.outputs?.length) {
              setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...result, status: 'done', success: true } : j));
            }
            toast.success('Render final validado');
            setVideoSquadTab('results');
          } else {
            toast.error(data.error || 'Falha no render');
          }
        }
      } catch {}
    }, 2500);
    pollRefs.current[jobId] = id;
  };

  useEffect(() => () => Object.values(pollRefs.current).forEach(clearInterval), []);

  useEffect(() => {
    if (processingMode === 'raw_review') {
      setCaptionsEnabled(false);
      setCaptionStyle('none');
    } else if (processingMode === 'finalize_approved') {
      setDynamicCutsEnabled(true);
      setMetadataCleanup(true);
      if (captionStyle === 'none') setCaptionStyle('worship_clean');
    } else if (processingMode === 'opus_auto') {
      setDynamicCutsEnabled(true);
      setMetadataCleanup(true);
    }
  }, [processingMode]);

  useEffect(() => {
    if (!isChannelCleanEdit) return;
    setCaptionsEnabled(false);
    setCaptionStyle('none');
    if (cleanDestination === 'shorts_vertical') setClipFormat('9:16');
    else if (cleanDestination === 'youtube_horizontal' || cleanDestination === 'both') setClipFormat('16:9');
  }, [isChannelCleanEdit, cleanDestination]);

  const loadEditPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const response = await videoApi.listEditPlans();
      const plans = response?.plans || [];
      setEditPlans(plans);
      if (!selectedEditPlanId && plans.length) setSelectedEditPlanId(plans[0].id);
      if (selectedEditPlanId && !plans.some(plan => plan.id === selectedEditPlanId)) {
        setSelectedEditPlanId(plans[0]?.id || '');
      }
    } catch (err) {
      toast.error(err.message || 'Falha ao carregar biblioteca de edições');
    } finally {
      setLoadingPlans(false);
    }
  }, [selectedEditPlanId]);

  const loadPresetLibrary = useCallback(async () => {
    try {
      const response = await videoApi.getEditPresets();
      setLearnedPresets(Array.isArray(response?.learnedPresets) ? response.learnedPresets : []);
    } catch (err) {
      toast.error(err.message || 'Falha ao carregar presets aprendidos');
    }
  }, []);

  const runProPipeline = useCallback(async () => {
    if (!proSourceVideo.trim()) { toast.error('Informe o caminho do vídeo.'); return; }
    setProJobRunning(true);
    setProJobError(null);
    setProAnalysisResult(null);
    setProHighlightsResult(null);
    setProRenderResult(null);

    try {
      setProJobStage('analyze');
      const analyzeRes = await videoApi.analyzeVideoPro({ sourceVideo: proSourceVideo, targetDuration: proTargetDuration, presetId: proPresetId });
      if (!analyzeRes?.ok) throw new Error(analyzeRes?.error || 'Análise falhou');
      setProAnalysisResult(analyzeRes.analysis || analyzeRes);

      setProJobStage('highlights');
      const hlRes = await videoApi.getVideoHighlightsPro({ sourceVideo: proSourceVideo, targetDuration: proTargetDuration, clipCount: proClipCount, presetId: proPresetId, durationMode: 'normal', analysis: analyzeRes.analysis });
      if (!hlRes?.ok) throw new Error(hlRes?.error || 'Highlights falhou');
      setProHighlightsResult({ clips: hlRes.highlights || [], meta: hlRes.highlightsMeta || {} });

      setProJobStage('render');
      const renderRes = await videoApi.renderVideoPro({ sourceVideo: proSourceVideo, targetDuration: proTargetDuration, clipCount: proClipCount, presetId: proPresetId, format: '9:16', highlights: hlRes.highlights || [], analysis: analyzeRes.analysis });
      if (!renderRes?.ok) throw new Error(renderRes?.error || 'Render falhou');
      setProRenderResult(renderRes);

      setProJobStage('done');
      toast.success(`Motor Pro: ${renderRes.outputs?.length || 0} clip(s) gerado(s)!`);
    } catch (err) {
      setProJobError(err.message || 'Erro desconhecido');
      setProJobStage('error');
      toast.error('Motor Pro: ' + (err.message || 'erro'));
    } finally {
      setProJobRunning(false);
    }
  }, [proSourceVideo, proTargetDuration, proClipCount, proPresetId]);

  const loadToolsStatus = useCallback(async () => {
    try {
      const [legacy, pro, proPresets, colorPresets, audioPresets] = await Promise.all([
        videoApi.getVideoToolsStatus(),
        videoApi.getVideoProToolchainStatus(),
        videoApi.getVideoProPresets(),
        videoApi.getVideoProColorPresets(),
        videoApi.getVideoProAudioPresets(),
      ]);
      setVideoToolsStatus(legacy?.tools || null);
      setVideoProToolchain(pro?.toolchain || null);
      setVideoProReadiness(pro?.pipelineReadiness || null);
      setVideoProFallbacks(Array.isArray(pro?.fallbacks) ? pro.fallbacks : []);
      setVideoProPresets(Array.isArray(proPresets?.presets) ? proPresets.presets : []);
      setVideoProColorPresets(Array.isArray(colorPresets?.presets) ? colorPresets.presets : []);
      setVideoProAudioPresets(Array.isArray(audioPresets?.presets) ? audioPresets.presets : []);
    } catch (err) {
      toast.error(err.message || 'Falha ao carregar status das ferramentas');
    }
  }, []);

  const loadReferences = useCallback(async () => {
    setLoadingReferences(true);
    setReferenceUiError('');
    try {
      let response = null;
      try {
        response = await videoApi.listReferenceVideos();
      } catch {
        response = await videoApi.listEditingReferences();
      }
      const refsRaw = response?.items || response?.references || [];
      const refs = refsRaw.map(normalizeReferenceItem);
      setReferences(refs);
      setReferencePreviewErrors(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => refs.some(ref => ref.id === id))));
      if (selectedReferenceId && !refs.some(ref => ref.id === selectedReferenceId)) {
        setSelectedReferenceId('');
      }
    } catch (err) {
      showReferenceError(err.message, 'Falha ao carregar exemplos de edição');
    } finally {
      setLoadingReferences(false);
    }
  }, [selectedReferenceId, normalizeReferenceItem, showReferenceError]);

  useEffect(() => {
    loadEditPlans();
    loadReferences();
    loadPresetLibrary();
    loadToolsStatus();
  }, [loadEditPlans, loadReferences, loadPresetLibrary, loadToolsStatus]);

  useEffect(() => {
    if (!referenceForm.planId && selectedEditPlanId) {
      setReferenceForm(prev => ({ ...prev, planId: selectedEditPlanId }));
    }
  }, [selectedEditPlanId, referenceForm.planId]);

  useEffect(() => {
    if (!selectedReferenceId) return;
    videoApi.getReferenceTutorialAnalysis(selectedReferenceId)
      .then(result => {
        if (result?.referenceAnalysis?.styleAnalysis) setLastStyleAnalysis(result.referenceAnalysis.styleAnalysis);
        if (result?.referenceAnalysis?.frameCuts) setLastFrameCutAnalysis(result.referenceAnalysis.frameCuts);
        if (result?.referenceAnalysis?.detectedTechniques) setReferenceTutorialAnalysis(result.referenceAnalysis);
      })
      .catch(() => {});
  }, [selectedReferenceId]);

  useEffect(() => {
    if (!referenceLearningJob?.jobId || !['queued', 'processing'].includes(referenceLearningJob.status)) return undefined;
    const poll = setInterval(async () => {
      try {
        const result = await videoApi.getReferenceLearningJob(referenceLearningJob.jobId);
        setReferenceLearningJob(result?.job || null);
        if (result?.job?.status === 'done') {
          clearInterval(poll);
          const analysis = await videoApi.getReferenceTutorialAnalysis(result.job.referenceId);
          if (analysis?.referenceAnalysis) {
            setReferenceTutorialAnalysis(analysis.referenceAnalysis);
            if (analysis.referenceAnalysis.styleAnalysis) setLastStyleAnalysis(analysis.referenceAnalysis.styleAnalysis);
            if (analysis.referenceAnalysis.frameCuts) setLastFrameCutAnalysis(analysis.referenceAnalysis.frameCuts);
          }
          await loadPresetLibrary();
          toast.success('Aula de edição analisada');
        }
        if (result?.job?.status === 'error') {
          clearInterval(poll);
          toast.error(result.job.error || 'Falha ao analisar referência');
        }
      } catch {}
    }, 2500);
    return () => clearInterval(poll);
  }, [referenceLearningJob, loadPresetLibrary]);

  const resetPlanDraft = () => {
    setPlanDraft(EMPTY_EDIT_PLAN);
    setEditingPlanId(null);
  };

  const handleSavePlan = async () => {
    const payload = {
      ...planDraft,
      mandatoryRules: planDraft.mandatoryRules,
      avoidRules: planDraft.avoidRules,
    };
    try {
      if (editingPlanId) {
        await videoApi.updateEditPlan(editingPlanId, payload);
        toast.success('Plano atualizado');
      } else {
        const created = await videoApi.createEditPlan(payload);
        toast.success('Plano criado');
        if (created?.plan?.id) setSelectedEditPlanId(created.plan.id);
      }
      resetPlanDraft();
      await loadEditPlans();
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar plano');
    }
  };

  const handleEditPlan = plan => {
    setEditingPlanId(plan.id);
    setPlanDraft({
      ...EMPTY_EDIT_PLAN,
      ...plan,
      mandatoryRules: Array.isArray(plan.mandatoryRules) ? plan.mandatoryRules.join('\n') : (plan.mandatoryRules || ''),
      avoidRules: Array.isArray(plan.avoidRules) ? plan.avoidRules.join('\n') : (plan.avoidRules || ''),
    });
    jumpToVideoSquadTab('library');
  };

  const handleDeletePlan = async planId => {
    if (!window.confirm('Excluir este plano de edição?')) return;
    try {
      await videoApi.deleteEditPlan(planId);
      toast.success('Plano excluído');
      if (selectedEditPlanId === planId) setSelectedEditPlanId('');
      await loadEditPlans();
      await loadReferences();
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir plano');
    }
  };

  const handleDuplicatePlan = async planId => {
    try {
      const result = await videoApi.duplicateEditPlan(planId);
      toast.success('Plano duplicado');
      if (result?.plan?.id) setSelectedEditPlanId(result.plan.id);
      await loadEditPlans();
    } catch (err) {
      toast.error(err.message || 'Erro ao duplicar plano');
    }
  };

  const handleCreateReference = async () => {
    if (!referenceForm.name.trim()) return toast.error('Informe o nome da referência');
    if (!referenceForm.file) return toast.error('Selecione o vídeo de exemplo');
    try {
      setUploadingReference(true);
      setReferenceUploadProgress(0);
      setReferenceUiError('');
      const formData = new FormData();
      formData.append('video', referenceForm.file);
      formData.append('name', referenceForm.name.trim());
      formData.append('description', referenceForm.description.trim());
      formData.append('niche', referenceForm.niche.trim());
      formData.append('tags', referenceForm.tags.trim());
      formData.append('notes', referenceForm.notes.trim());
      formData.append('likedAspects', referenceForm.likedAspects.trim());
      formData.append('planId', referenceForm.planId || selectedEditPlanId || '');
      formData.append('platformHint', referenceForm.platformHint || platform || 'tiktok');
      const created = await videoApi.uploadReferenceVideo(formData, event => {
        if (!event?.total) return;
        setReferenceUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      });
      if (import.meta.env.DEV) {
        console.debug('[reference-upload] response', {
          ok: created?.ok,
          video: created?.video,
          referenceId: created?.reference?.id,
        });
      }
      const referenceId = created?.video?.id || created?.reference?.id;
      if (!referenceId) throw new Error('Falha ao criar referência');
      toast.success('Exemplo de edição enviado');
      setSelectedReferenceId(referenceId);
      setReferencePreviewErrors(prev => ({ ...prev, [referenceId]: '' }));
      setReferenceForm(prev => ({
        ...prev,
        file: null,
        name: '',
        description: '',
        niche: '',
        tags: '',
        notes: '',
        likedAspects: '',
      }));
      setReferenceUploadProgress(100);
      await loadReferences();
    } catch (err) {
      showReferenceError(err.message, 'Erro ao enviar exemplo');
    } finally {
      setUploadingReference(false);
    }
  };

  const handleCreateReferenceLink = async () => {
    if (!referenceForm.name.trim()) return toast.error('Informe o nome da referência');
    if (!referenceForm.linkUrl.trim()) return toast.error('Informe a URL da referência');
    try {
      setReferenceUiError('');
      const created = await videoApi.createEditingReferenceLink({
        name: referenceForm.name.trim(),
        description: referenceForm.description.trim(),
        notes: referenceForm.notes.trim(),
        likedAspects: referenceForm.likedAspects.trim(),
        niche: referenceForm.niche.trim(),
        tags: referenceForm.tags,
        planId: referenceForm.planId || selectedEditPlanId || '',
        platformHint: referenceForm.platformHint || platform || 'tiktok',
        sourceUrl: referenceForm.linkUrl.trim(),
        url: referenceForm.linkUrl.trim(),
      });
      const referenceId = created?.reference?.id;
      if (!referenceId) throw new Error('Falha ao criar referência');
      toast.success('Referência por link salva');
      setSelectedReferenceId(referenceId);
      setReferenceForm(prev => ({
        ...prev,
        name: '',
        description: '',
        niche: '',
        tags: '',
        notes: '',
        likedAspects: '',
        linkUrl: '',
      }));
      await loadReferences();
    } catch (err) {
      showReferenceError(err.message, 'Não consegui acessar esse link. Envie um arquivo direto ou use um link público/autorizado.');
    }
  };

  const handleAnalyzeStyle = async (referenceId = selectedReferenceId) => {
    if (!referenceId) return toast.error('Selecione uma referência');
    try {
      setReferenceUiError('');
      const result = await videoApi.analyzeReferenceStyle(referenceId);
      setLastStyleAnalysis(result?.styleAnalysis || null);
      setLastFrameCutAnalysis(result?.frameCuts || null);
      toast.success('Análise de estilo concluída');
      await loadReferences();
      jumpToVideoSquadTab('frames');
    } catch (err) {
      showReferenceError(err.message, 'Erro na análise de estilo');
    }
  };

  const handleAnalyzeFrames = async (referenceId = selectedReferenceId) => {
    if (!referenceId) return toast.error('Selecione uma referência');
    try {
      setReferenceUiError('');
      const result = await videoApi.analyzeReferenceFrames(referenceId);
      setLastFrameCutAnalysis(result?.frameCuts || null);
      toast.success('Análise por frame concluída');
      jumpToVideoSquadTab('frames');
    } catch (err) {
      showReferenceError(err.message, 'Erro na análise por frame');
    }
  };

  const handleAnalyzeTutorialReference = async (referenceId = selectedReferenceId) => {
    if (!referenceId) return toast.error('Selecione uma referência');
    try {
      setReferenceUiError('');
      setReferenceTutorialAnalysis(null);
      const result = await videoApi.analyzeTutorialReference({
        referenceId,
        mode: 'editing_tutorial',
        extractMultipleStyles: true,
        segmentLengthSeconds: 60,
        maxSegments: 30,
      });
      setReferenceLearningJob({
        jobId: result?.jobId,
        status: result?.status || 'queued',
        referenceId,
        progress: 0,
        currentStep: 'na fila',
      });
      toast.success('Análise da aula de edição iniciada');
    } catch (err) {
      showReferenceError(err.message, 'Falha ao iniciar análise da aula de edição');
    }
  };

  const handleSavePresetFromTechnique = async (technique, referenceId = selectedReferenceId) => {
    if (!referenceId || !technique?.id) return toast.error('Técnica inválida');
    try {
      const result = await videoApi.savePresetFromReference({
        referenceId,
        techniqueId: technique.id,
        presetName: technique.name,
      });
      await loadPresetLibrary();
      toast.success(`Preset salvo: ${result?.preset?.name || technique.name}`);
    } catch (err) {
      toast.error(err.message || 'Falha ao salvar preset aprendido');
    }
  };

  const handleUseLearnedPreset = learnedPreset => {
    if (learnedPreset?.generatedEditPlanId) setSelectedEditPlanId(learnedPreset.generatedEditPlanId);
    if (learnedPreset?.sourceReferenceId) {
      setSelectedReferenceId(learnedPreset.sourceReferenceId);
      setUseReferenceStyle(true);
      setUseFrameCutAnalysis(true);
    }
    jumpToVideoSquadTab('smartcut');
    toast.success(`Usando estilo: ${learnedPreset?.name || 'preset aprendido'}`);
  };

  const handleImportLight = async () => {
    if (!proRefUrl.trim()) return toast.error('Informe um link para importar');
    setProRefLoading(true);
    setProRefError('');
    try {
      const result = await videoApi.importVideoLight({ url: proRefUrl.trim(), purpose: 'source_or_reference' });
      if (!result.ok) {
        if (result.sourceType === 'youtube') {
          setProRefError(result.reason + ' ' + result.fallback);
        } else {
          setProRefError(result.error || 'Falha ao importar');
        }
        return;
      }
      setProSourceVideo(result.videoPath || '');
      toast.success(`Vídeo importado: ${result.probe?.duration?.toFixed(1)}s | ${result.probe?.width}×${result.probe?.height}`);
    } catch (err) {
      setProRefError(err.message || 'Erro ao importar vídeo');
    } finally {
      setProRefLoading(false);
    }
  };

  const handleAnalyzeReferenceNew = async () => {
    const sourcePath = proRefUrl.trim() || proSourceVideo.trim();
    if (!sourcePath) return toast.error('Informe o caminho ou link do vídeo de referência');
    setProRefLoading(true);
    setProRefError('');
    setProRefStyleProfile(null);
    setProRefId('');
    try {
      const result = await videoApi.analyzeVideoReference({
        videoPath: sourcePath.startsWith('/') ? sourcePath : undefined,
        videoId: sourcePath.startsWith('/') ? undefined : sourcePath,
        referenceName: proRefName || 'Referência Motor Pro',
        category: proRefCategory,
        saveAsPreset: true,
      });
      if (!result.ok) throw new Error(result.error || 'Falha na análise');
      setProRefId(result.referenceId);
      setProRefStyleProfile(result.styleProfile);
      toast.success(`Referência analisada — preset: ${result.recommendedPreset}`);
    } catch (err) {
      setProRefError(err.message || 'Erro na análise de referência');
    } finally {
      setProRefLoading(false);
    }
  };

  const handleApplyReferenceToMotorPro = async () => {
    if (!proRefId) return toast.error('Analise uma referência primeiro');
    if (!proSourceVideo.trim()) return toast.error('Informe o vídeo fonte no Motor Pro');
    setProRefRenderLoading(true);
    setProRefError('');
    setProRefRenderResult(null);
    try {
      const result = await videoApi.renderWithReference({
        sourceVideo: proSourceVideo.trim(),
        referenceId: proRefId,
        clipCount: proClipCount,
        targetDuration: proTargetDuration,
        format: '9:16',
      });
      if (!result.ok) throw new Error(result.error || 'Falha no render');
      setProRefRenderResult(result);
      toast.success(`Render com referência concluído — ${result.outputs?.length || 0} clip(s)`);
    } catch (err) {
      setProRefError(err.message || 'Erro ao aplicar estilo de referência');
    } finally {
      setProRefRenderLoading(false);
    }
  };

  const handleAnalyzePortfolioRef = async (ref) => {
    setPortfolioProAnalyzed(prev => ({ ...prev, [ref.id]: { ...prev[ref.id], loading: true, error: '' } }));
    try {
      const result = await videoApi.analyzeVideoReference({
        referenceDbId: ref.id,
        referenceName: ref.name || 'Referência',
        category: ref.sourceType === 'sports' ? 'sports' : 'general',
      });
      if (!result.ok) throw new Error(result.error || 'Falha na análise');
      setPortfolioProAnalyzed(prev => ({
        ...prev,
        [ref.id]: { proRefId: result.referenceId, styleProfile: result.styleProfile, loading: false, error: '' },
      }));
      setProRefId(result.referenceId);
      setProRefStyleProfile(result.styleProfile);
      toast.success(`Estilo analisado — preset: ${result.recommendedPreset}`);
    } catch (err) {
      setPortfolioProAnalyzed(prev => ({ ...prev, [ref.id]: { ...prev[ref.id], loading: false, error: err.message } }));
      toast.error('Erro ao analisar: ' + err.message);
    }
  };

  const handleApplyPortfolioRefToMotorPro = async (ref) => {
    const analyzed = portfolioProAnalyzed[ref.id];
    if (!analyzed?.proRefId) return toast.error('Analise este vídeo como referência Motor Pro primeiro.');
    if (!proSourceVideo.trim()) return toast.error('Informe ou carregue um vídeo fonte no Motor Pro antes de aplicar.');
    setPortfolioProAnalyzed(prev => ({ ...prev, [ref.id]: { ...prev[ref.id], renderLoading: true, error: '' } }));
    try {
      const result = await videoApi.renderWithReference({
        sourceVideo: proSourceVideo.trim(),
        referenceId: analyzed.proRefId,
        clipCount: proClipCount,
        targetDuration: proTargetDuration,
        format: '9:16',
      });
      if (!result.ok) throw new Error(result.error || 'Falha no render');
      setPortfolioProAnalyzed(prev => ({ ...prev, [ref.id]: { ...prev[ref.id], renderLoading: false, renderResult: result } }));
      setProRefRenderResult(result);
      toast.success(`Motor Pro: ${result.outputs?.length || 0} clip(s) gerado(s) com estilo de "${ref.name}"`);
    } catch (err) {
      setPortfolioProAnalyzed(prev => ({ ...prev, [ref.id]: { ...prev[ref.id], renderLoading: false, error: err.message } }));
      toast.error('Erro ao aplicar: ' + err.message);
    }
  };

  const handleFullStudioPreflight = async () => {
    setFsPreflightLoading(true);
    setFsPreflight(null);
    setFsError('');
    try {
      const result = await videoApi.getFullStudioPreflight(fsPresetId || null);
      setFsPreflight(result);
    } catch (err) {
      setFsError(err.message || 'Erro ao verificar toolchain Full Studio');
    } finally {
      setFsPreflightLoading(false);
    }
  };

  const handleFullStudioRender = async () => {
    if (!proSourceVideo.trim()) return toast.error('Informe o caminho do vídeo fonte no Motor Pro');
    setFsRenderLoading(true);
    setFsRenderResult(null);
    setFsError('');
    try {
      const result = await videoApi.runFullStudioEdit({
        sourceVideo: proSourceVideo.trim(),
        presetId: fsPresetId,
        format: '9:16',
        clipCount: proClipCount,
        targetDuration: proTargetDuration,
      });
      if (!result.ok) throw new Error(result.error || 'Falha no render Full Studio');
      setFsRenderResult(result);
      toast.success(`Full Studio: ${result.outputs?.length || 0} clip(s) gerado(s)!`);
    } catch (err) {
      setFsError(err.message || 'Erro no Full Studio render');
      toast.error('Full Studio: ' + (err.message || 'erro'));
    } finally {
      setFsRenderLoading(false);
    }
  };

  const handleRemoveReference = async referenceId => {
    if (!window.confirm('Remover esta referência?')) return;
    try {
      setReferenceUiError('');
      await videoApi.deleteReference(referenceId);
      if (selectedReferenceId === referenceId) {
        setSelectedReferenceId('');
        setLastStyleAnalysis(null);
        setLastFrameCutAnalysis(null);
      }
      setReferencePreviewErrors(prev => {
        const next = { ...prev };
        delete next[referenceId];
        return next;
      });
      toast.success('Referência removida');
      await loadReferences();
    } catch (err) {
      showReferenceError(err.message, 'Erro ao remover referência');
    }
  };

  const handleViewReferenceAnalysis = async (referenceId = selectedReferenceId) => {
    if (!referenceId) return toast.error('Selecione uma referência');
    try {
      setReferenceUiError('');
      const result = await videoApi.getReferenceTutorialAnalysis(referenceId);
      setLastStyleAnalysis(result?.referenceAnalysis?.styleAnalysis || null);
      setLastFrameCutAnalysis(result?.referenceAnalysis?.frameCuts || null);
      setReferenceTutorialAnalysis(result?.referenceAnalysis || null);
      jumpToVideoSquadTab('frames');
    } catch (err) {
      showReferenceError(err.message, 'Análise ainda não disponível');
    }
  };

  const runSupervisorValidation = useCallback(async () => {
    const latestJob = jobs[0];
    if (!latestJob) throw new Error('Nenhum job disponível para validação');
    const response = await videoApi.supervisorValidate({
      editingPlanId: selectedEditPlanId || null,
      referenceVideoIds: selectedReferenceId ? [selectedReferenceId] : [],
      platform: platform || 'tiktok',
      outputs: latestJob?.outputs || [],
      probe: latestJob?.probe || {},
    });
    const review = response?.review || null;
    setLastSupervisorReview(review);
    if (review) {
      const checklist = [
        `Ritmo validado: ${review?.diagnostics?.pace || 'médio'}`,
        `Score de qualidade: ${review?.score ?? '-'}`,
        ...(Array.isArray(review?.issues) ? review.issues.map(item => `Ajustar: ${item}`) : []),
        ...(Array.isArray(review?.improvements) ? review.improvements.map(item => `Melhoria: ${item}`) : []),
      ];
      setLastSupervisorChecklist(checklist);
    }
    return review;
  }, [jobs, selectedEditPlanId, selectedReferenceId, platform]);

  const onDrop = useCallback((accepted) => {
    setFiles(prev => [
      ...prev,
      ...accepted.filter(f => !prev.some(p => p.name === f.name)).slice(0, 3 - prev.length),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 3, maxSize: 2 * 1024 * 1024 * 1024,
    onDropRejected: rej => rej.forEach(r => toast.error(r.errors[0]?.message ?? 'Arquivo inválido')),
  });

  // v27: Chunk upload + pipeline (substituiu /video/edit)
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

  const handleProcessVideo = async () => {
    if (submitLockRef.current) return;
    if (!files.length) {
      if (importUrl.trim()) return handleImportUrl();
      return toast.error('Adicione um vídeo ou informe um link para continuar');
    }
    submitLockRef.current = true;
    setSubmitting(true);
    setJobs(prev => prev.filter(job => job.status !== 'error'));
    const file = files[0]; // processo o primeiro arquivo

    try {
      // ── PASSO 1: Upload (normal ou chunks) ────────────────────────────
      let filePath = null;
      let videoId  = null;
      let jobId;

      const cutType = mode === 'short' ? 'short_form' : mode === 'long' ? 'long_form' : 'auto';
      const selectedClipCount = processingMode === 'finalize_approved'
        ? null
        : (clipCountMode === 'auto' ? null : clipCount);
      const effectiveCaptionStyle = isChannelCleanEdit ? 'none' : (captionsEnabled ? captionStyle : 'none');
      const instruction = [
        extraInstr.trim(),
        captionsEnabled && effectiveCaptionStyle !== 'none' ? `estilo de legenda ${effectiveCaptionStyle}` : '',
      ].filter(Boolean).join(', ') || '';

      // Todos os arquivos usam chunk upload (evita 413 e unifica o fluxo)
      toast.loading('Iniciando upload...', { id: 'upload' });
      const completeResp = await uploadSelectedVideo(file);
      filePath = completeResp.filePath;
      videoId  = completeResp.videoId;
      if (filePath && !proSourceVideo) setProSourceVideo(filePath);
      toast.loading('Upload completo! Analisando vídeo...', { id: 'upload' });

      if (useSquadPipeline && processingMode !== 'finalize_approved') {
        const selectedClipCount = clipCountMode === 'auto' ? 3 : (clipCount || 3);
        const analysisResponse = await videoApi.analyzeVideo({
          videoId,
          filePath,
          mode: 'auto',
          goal: editMode === 'sports_highlights' ? 'sports_highlight' : objective,
          platform: platform || 'auto',
          referenceStyleId: selectedEditStyleMeta.id,
          clipCount: selectedClipCount,
          targetDuration: clipDurationPayload.targetClipDuration || clipDurationPayload.clipDurationSeconds || 45,
        });
        setLastAutoAnalysis({
          analysisId: analysisResponse.analysisId,
          videoId: analysisResponse.videoId || videoId,
          ...(analysisResponse.analysis || {}),
        });
        toast.loading('Gerando edit plan supervisionado...', { id: 'upload' });
        const editPlanResponse = await videoApi.generateEditPlan({
          videoId,
          analysisId: analysisResponse.analysisId,
          presetId: selectedPlan?.id || null,
          requestedClipCount: selectedClipCount,
          targetDuration: clipDurationPayload.targetClipDuration || clipDurationPayload.clipDurationSeconds || 45,
          format: clipFormat,
          mode: 'auto_premium',
          goal: editMode === 'sports_highlights' ? 'sports_highlight' : objective,
        });
        setLastGeneratedEditPlan(editPlanResponse?.editPlan || null);
        const renderResponse = await videoApi.renderEditPlan({ editPlanId: editPlanResponse?.editPlan?.id });
        jobId = renderResponse.jobId;
        setJobs(prev => [{
          jobId,
          status: renderResponse.status || 'queued',
          progress: 0,
          message: 'Editor automático supervisionado iniciado...',
          stage: 'planning',
          editPlanId: editPlanResponse?.editPlan?.id || null,
        }, ...prev.filter(job => job.jobId !== jobId)]);
        setFiles([]);
        toast.success('Editor automático iniciado', { id: 'upload' });
        startUnifiedJobPolling(jobId);
        setVideoSquadTab('results');
        return;
      }

      // ── PASSO 2: Criar job (Squad v29 ou pipeline legado) ─────────────────
      if (useSquadPipeline) {
        const customMetadata = {
          title: metaTitle || 'BotSquad Clip',
          author: metaAuthor,
          comment: metaComment,
          tags: metaTags,
          keywords: metaTags,
        };
        const squadResp = await videoApi.createSquadJob({
          filePath,
          mode: processingMode,
          processingMode,
          clipCountMode: processingMode === 'finalize_approved' ? null : clipCountMode,
          clipCount: selectedClipCount,
          count: selectedClipCount,
          requestedClipCount: selectedClipCount,
          ...clipDurationPayload,
          requestedClipDurationSeconds: clipDurationPayload.clipDurationSeconds,
          finalizeKeepSingleOutput: processingMode === 'finalize_approved',
          dynamicCutsMode: processingMode === 'finalize_approved' ? 'light' : undefined,
          platform: platform || 'auto',
          objective,
          minScore,
          cutType: mode === 'short' ? 'short_form' : mode === 'long' ? 'long_form' : 'auto',
          format: clipFormat,
          instruction,
          editMode,
          videoContentType,
          destination: cleanDestination,
          pauseCutMode,
          mistakeCutMode,
          captionsEnabled,
          captionStyle: effectiveCaptionStyle,
          ...editStylePayload,
          dynamicCuts: dynamicCutsEnabled,
          dynamicCutsEnabled,
          editPace,
          removeMetadata: metadataCleanup,
          metadataCleanup,
          autoSendTelegram,
          telegramAutoSend: autoSendTelegram,
          telegramMode: 'document',
          deleteAfterTelegram: true,
          editPlanId: selectedEditPlanId || null,
          editingPlanId: selectedEditPlanId || null,
          editingPlanName: selectedPlan?.name || null,
          referenceId: selectedReferenceId || null,
          referenceVideoIds: selectedReferenceId ? [selectedReferenceId] : [],
          useReferenceStyle,
          useFrameCutAnalysis,
          supervisorEnabled: true,
          metadataOptions: showMetaPanel ? {
            stripOriginal: metadataCleanup,
            writeCustom: metadataCleanup,
            customMetadata,
          } : { stripOriginal: metadataCleanup, writeCustom: metadataCleanup },
        });
        jobId = squadResp.jobId;
        setJobs(prev => [{ jobId, status: 'queued', progress: 0, message: 'Video Squad iniciado...', processingMode }, ...prev.filter(job => job.jobId !== jobId)]);
        setFiles([]);
        toast.success('Video Squad iniciado! Acompanhe o progresso.', { id: 'upload' });
        startSquadPolling(jobId);
        return; // early return — squad handles everything
      }

      // Legacy pipeline
      const jobResp = await videoApi.createPipelineJob({
        videoId, filePath, cutType, platform: platform || 'instagram', instruction,
        autoSendTelegram,
        telegramMode: 'document',
        metadataOptions: showMetaPanel ? {
          stripOriginal: true,
          writeCustom:   true,
          customMetadata: {
            title:    metaTitle   || 'BotSquad Clip',
            author:   metaAuthor,
            artist:   metaAuthor,
            comment:  metaComment,
            tags:     metaTags,
            keywords: metaTags,
          },
        } : { stripOriginal: true, writeCustom: true },
      });
      jobId = jobResp.jobId;

      setJobs(prev => [{ jobId, status: 'queued', progress: 0, message: 'Job criado...' }, ...prev.filter(job => job.jobId !== jobId)]);
      setFiles([]);
      toast.success('Análise iniciada! Acompanhe o progresso abaixo.', { id: 'upload' });

      // ── PASSO 3: Polling do pipeline job ──────────────────────────────
      startPipelinePolling(jobId);

    } catch (err) {
      if (isAbortLikeError(err)) {
        toast.dismiss('upload');
        return;
      }
      const msg = err?.response?.data?.error || err.message || 'Erro ao processar vídeo';
      toast.error(msg, { id: 'upload' });
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleAnalyzeVideo = async () => {
    if (analyzingVideo) return;
    if (!files.length) {
      toast.error('Adicione um vídeo para analisar');
      return;
    }

    setAnalyzingVideo(true);
    try {
      const file = files[0];
      toast.loading('Enviando vídeo para análise inteligente...', { id: 'upload' });
      const completeResp = await uploadSelectedVideo(file);
      const selectedClipCount = clipCountMode === 'auto' ? 4 : (clipCount || 4);
      const analysis = await videoApi.analyzeVideo({
        videoId: completeResp.videoId,
        filePath: completeResp.filePath,
        mode: 'auto',
        goal: editMode === 'sports_highlights' ? 'sports_highlight' : objective,
        platform: platform || 'auto',
        referenceStyleId: selectedEditStyleMeta.id,
        clipCount: selectedClipCount,
        targetDuration: clipDurationPayload.targetClipDuration || clipDurationPayload.clipDurationSeconds || 45,
      });
      setLastAutoAnalysis({
        analysisId: analysis.analysisId,
        videoId: analysis.videoId || completeResp.videoId,
        ...(analysis.analysis || {}),
      });
      setLastGeneratedEditPlan(null);
      setVideoSquadTab('results');
      toast.success('Análise automática concluída', { id: 'upload' });
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Falha ao analisar vídeo', { id: 'upload' });
    } finally {
      setAnalyzingVideo(false);
    }
  };

  // Polling específico para pipeline jobs (usa getPipelineJob, não getJob)
  const startPipelinePolling = (jobId) => {
    if (pollRefs.current[jobId]) return;
    const id = setInterval(async () => {
      try {
        const data = await videoApi.getPipelineJob(jobId);
        setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...data, agent: 'pipeline' } : j));
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRefs.current[jobId]);
          delete pollRefs.current[jobId];
          if (data.status === 'done' && data.success === true && (data.outputs || []).some(o => Number(o?.fileSize || 0) >= 100 * 1024)) toast.success(`${data.outputs?.length || 0} corte(s) gerado(s)! 🎬`);
          else if (data.status === 'done') toast.error('Nenhum corte válido foi gerado.');
          else toast.error(`Erro no processamento: ${data.message || 'tente novamente'}`, { id: `pipeline-error-${jobId}` });
        }
      } catch { /* network hiccup */ }
    }, 3000);
    pollRefs.current[jobId] = id;
  };

  // Video Squad polling
  const startSquadPolling = (jobId) => {
    if (pollRefs.current[jobId]) return;
    const id = setInterval(async () => {
      try {
        const data = await videoApi.getSquadJob(jobId);
        setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...data, agent: 'squad' } : j));
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRefs.current[jobId]);
          delete pollRefs.current[jobId];
          if (data.status === 'done' && data.success === true && (data.outputs || []).some(o => Number(o?.fileSize || 0) >= 100 * 1024)) toast.success(`${data.outputs?.length || 0} corte(s) prontos! 🎬`);
          else if (data.status === 'done') toast.error('Nenhum corte válido foi gerado.');
          else toast.error(`Erro: ${data.message || 'verifique o vídeo'}`, { id: `squad-error-${jobId}` });
        }
      } catch {}
    }, 3000);
    pollRefs.current[jobId] = id;
  };

  // Manter handleEdit como alias para compatibilidade com startPolling existente
  const handleEdit = handleProcessVideo;

  // v28: Import from URL / YouTube / Drive / Dropbox
  const handleImportUrl = async () => {
    if (submitLockRef.current) return;
    if (!importUrl.trim()) return toast.error('Informe a URL');
    if (importSourceType === 'youtube_authorized' && !confirmedAuthorized) {
      return toast.error('Confirme que você tem autorização para baixar este conteúdo');
    }
    submitLockRef.current = true;
    setSubmitting(true);
    setJobs(prev => prev.filter(job => job.status !== 'error'));
    try {
      toast.loading('Iniciando importação...', { id: 'import' });
      const resp = await videoApi.importUrl({
        sourceType: importSourceType,
        sourceUrl: importUrl.trim(),
        confirmedAuthorized,
        processingMode,
        mode: processingMode,
        clipCountMode: processingMode === 'finalize_approved' ? null : clipCountMode,
        clipCount: processingMode === 'finalize_approved' ? null : (clipCountMode === 'auto' ? null : clipCount),
        count: processingMode === 'finalize_approved' ? null : (clipCountMode === 'auto' ? null : clipCount),
        requestedClipCount: processingMode === 'finalize_approved' ? null : (clipCountMode === 'auto' ? null : clipCount),
        ...clipDurationPayload,
        requestedClipDurationSeconds: clipDurationPayload.clipDurationSeconds,
        finalizeKeepSingleOutput: processingMode === 'finalize_approved',
        dynamicCutsMode: processingMode === 'finalize_approved' ? 'light' : undefined,
        objective,
        minScore,
        cutType: mode === 'short' ? 'short_form' : mode === 'long' ? 'long_form' : 'auto',
        format: clipFormat,
        platform: platform || 'auto',
        instruction: extraInstr,
        editMode,
        videoContentType,
        destination: cleanDestination,
        pauseCutMode,
        mistakeCutMode,
        captionsEnabled,
        captionStyle: isChannelCleanEdit ? 'none' : (captionsEnabled ? captionStyle : 'none'),
          ...editStylePayload,
        dynamicCuts: dynamicCutsEnabled,
        dynamicCutsEnabled,
        editPace,
        removeMetadata: metadataCleanup,
        metadataCleanup,
        autoSendTelegram,
        telegramAutoSend: autoSendTelegram,
        telegramMode: 'document',
        deleteAfterTelegram: true,
        editPlanId: selectedEditPlanId || null,
        editingPlanId: selectedEditPlanId || null,
        editingPlanName: selectedPlan?.name || null,
        referenceId: selectedReferenceId || null,
        referenceVideoIds: selectedReferenceId ? [selectedReferenceId] : [],
        useReferenceStyle,
        useFrameCutAnalysis,
        supervisorEnabled: true,
        metadataOptions: showMetaPanel ? {
          stripOriginal: metadataCleanup,
          writeCustom:   metadataCleanup,
          customMetadata: { title: metaTitle || 'BotSquad Clip', author: metaAuthor, comment: metaComment, tags: metaTags },
        } : { stripOriginal: metadataCleanup, writeCustom: metadataCleanup },
      });
      const jobId = resp?.jobId;
      if (jobId) {
        setJobs(prev => [{ jobId, status: 'queued', progress: 0, message: 'Importando...', processingMode }, ...prev.filter(job => job.jobId !== jobId)]);
        toast.success('Importação iniciada!', { id: 'import' });
        startSquadPolling(jobId);
        setImportUrl('');
        setShowImportUrl(false);
      } else {
        toast.error(getFriendlyImportError(resp), { id: 'import' });
      }
    } catch (err) {
      if (isAbortLikeError(err)) {
        toast.dismiss('import');
        return;
      }
      toast.error(getFriendlyImportError(err), { id: 'import' });
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
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

  const jumpToVideoSquadTab = useCallback((tabId) => {
    setVideoSquadTab(tabId);
    const targetMap = {
      smartcut: smartcutSectionRef,
      library: librarySectionRef,
      examples: examplesSectionRef,
      frames: framesSectionRef,
      results: resultsSectionRef,
    };
    const target = targetMap[tabId]?.current;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

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
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
              {VIDEO_SQUAD_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => jumpToVideoSquadTab(tab.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                    videoSquadTab === tab.id
                      ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
                      : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700'
                  )}
                >
                  <tab.icon size={13} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Value prop */}
            <div className="bg-brand-500/8 border border-brand-500/20 rounded-xl px-3 py-2.5">
              <p className="text-xs font-bold text-brand-300">🔥 Gerador de Cortes Virais</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                IA analisa cada segundo do seu vídeo, identifica os momentos de maior retenção e gera clips prontos para publicar.
              </p>
            </div>

            {(
              <div ref={librarySectionRef} className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-200">BIBLIOTECA DE EDIÇÕES</p>
                    <p className="text-[11px] text-gray-500">Crie, edite, duplique e reutilize planos no SmartCut.</p>
                  </div>
                  <button
                    type="button"
                    onClick={resetPlanDraft}
                    className="flex items-center gap-1 rounded-lg border border-gray-700 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:border-gray-600"
                  >
                    <Plus size={12} /> Novo plano
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <input value={planDraft.name} onChange={e => setPlanDraft(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome do plano"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                    <textarea value={planDraft.description} onChange={e => setPlanDraft(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descrição"
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={planDraft.platform} onChange={e => setPlanDraft(prev => ({ ...prev, platform: e.target.value }))}
                        placeholder="Plataforma"
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                      <input value={planDraft.niche} onChange={e => setPlanDraft(prev => ({ ...prev, niche: e.target.value }))}
                        placeholder="Nicho"
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                      <input value={planDraft.objective} onChange={e => setPlanDraft(prev => ({ ...prev, objective: e.target.value }))}
                        placeholder="Objetivo"
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                      <input type="number" value={planDraft.desiredCutDurationSeconds} onChange={e => setPlanDraft(prev => ({ ...prev, desiredCutDurationSeconds: Number(e.target.value || 0) }))}
                        placeholder="Duração"
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                      <input type="number" value={planDraft.clipCount} onChange={e => setPlanDraft(prev => ({ ...prev, clipCount: Number(e.target.value || 0) }))}
                        placeholder="Qtd cortes"
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                      <select value={planDraft.rhythm} onChange={e => setPlanDraft(prev => ({ ...prev, rhythm: e.target.value }))}
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500">
                        <option value="rápido">Ritmo rápido</option>
                        <option value="médio">Ritmo médio</option>
                        <option value="lento">Ritmo lento</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={planDraft.captionStyle} onChange={e => setPlanDraft(prev => ({ ...prev, captionStyle: e.target.value }))}
                        placeholder="Estilo de legenda"
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                      <input value={planDraft.transitionStyle} onChange={e => setPlanDraft(prev => ({ ...prev, transitionStyle: e.target.value }))}
                        placeholder="Transição"
                        className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-300">
                      {[
                        ['Zoom', 'useZoom'],
                        ['Corte seco', 'useDryCut'],
                        ['Jump cut', 'useJumpCut'],
                        ['Música', 'useMusic'],
                        ['B-roll', 'useBroll'],
                      ].map(([label, key]) => (
                        <label key={key} className="flex items-center gap-1 rounded-lg border border-gray-800 px-2 py-1.5 bg-gray-900">
                          <input
                            type="checkbox"
                            checked={Boolean(planDraft[key])}
                            onChange={e => setPlanDraft(prev => ({ ...prev, [key]: e.target.checked }))}
                            className="accent-brand-500 h-3.5 w-3.5"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <textarea value={planDraft.mandatoryRules} onChange={e => setPlanDraft(prev => ({ ...prev, mandatoryRules: e.target.value }))}
                      placeholder="Regras obrigatórias (1 por linha)"
                      rows={3}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
                    <textarea value={planDraft.avoidRules} onChange={e => setPlanDraft(prev => ({ ...prev, avoidRules: e.target.value }))}
                      placeholder="Coisas para evitar (1 por linha)"
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleSavePlan}
                        className="flex-1 rounded-xl bg-brand-500 py-2 text-xs font-bold text-white hover:bg-brand-600">
                        {editingPlanId ? 'Salvar edição' : 'Criar plano'}
                      </button>
                      {editingPlanId && (
                        <button type="button" onClick={resetPlanDraft}
                          className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                    {loadingPlans && <p className="text-xs text-gray-500">Carregando planos...</p>}
                    {!loadingPlans && editPlans.length === 0 && <p className="text-xs text-gray-500">Nenhum plano salvo.</p>}
                    {editPlans.map(plan => (
                      <div key={plan.id} className={clsx('rounded-xl border p-2.5', selectedEditPlanId === plan.id ? 'border-brand-500/40 bg-brand-500/10' : 'border-gray-800 bg-gray-900')}>
                        <p className="text-xs font-bold text-gray-100">{plan.name}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{plan.description || 'Sem descrição'}</p>
                        <p className="text-[10px] text-gray-600 mt-1">Ritmo: {plan.rhythm || 'médio'} • Duração: {plan.desiredCutDurationSeconds || 'auto'}s • Cortes: {plan.clipCount || 'auto'}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => {
                            setSelectedEditPlanId(plan.id);
                            jumpToVideoSquadTab('smartcut');
                          }}
                            className="rounded-lg border border-brand-500/40 px-2 py-1 text-[10px] font-semibold text-brand-300">
                            Usar no SmartCut
                          </button>
                          <button type="button" onClick={() => handleEditPlan(plan)}
                            className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600">
                            Editar
                          </button>
                          <button type="button" onClick={() => handleDuplicatePlan(plan.id)}
                            className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600 flex items-center gap-1">
                            <Copy size={11} /> Duplicar
                          </button>
                          <button type="button" onClick={() => handleDeletePlan(plan.id)}
                            className="rounded-lg border border-red-900/50 px-2 py-1 text-[10px] font-semibold text-red-300 hover:border-red-700 flex items-center gap-1">
                            <Trash2 size={11} /> Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                    {learnedPresets.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Aprendidos de referência</p>
                        {learnedPresets.map(preset => (
                          <div key={preset.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-gray-100">{preset.name}</p>
                              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300">Aprendido de referência</span>
                            </div>
                            <p className="mt-1 text-[11px] text-gray-500">{preset.description || preset.category}</p>
                            <p className="mt-1 text-[10px] text-gray-600">
                              Categoria: {preset.category} • Confiança: {Math.round(Number(preset.confidence || 0) * 100)}%
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => handleUseLearnedPreset(preset)}
                                className="rounded-lg border border-brand-500/40 px-2 py-1 text-[10px] font-semibold text-brand-300">
                                Usar este estilo
                              </button>
                              {preset.sourceReferenceId && (
                                <button type="button" onClick={() => {
                                  setSelectedReferenceId(preset.sourceReferenceId);
                                  jumpToVideoSquadTab('examples');
                                }}
                                  className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600">
                                  Ver origem
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(
              <div ref={examplesSectionRef} className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
                <div>
                  <p className="text-xs font-bold text-gray-200">VÍDEOS DE REFERÊNCIA DE EDIÇÃO</p>
                  <p className="text-[11px] text-gray-500">Envie vídeos de edições que você gostou. A IA vai analisar cortes, ritmo, zoom, legendas, transições e estilo visual para usar como referência nos próximos vídeos.</p>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <input value={referenceForm.name} onChange={e => setReferenceForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome da referência"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                    <input value={referenceForm.description} onChange={e => setReferenceForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descrição curta"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={referenceForm.niche} onChange={e => setReferenceForm(prev => ({ ...prev, niche: e.target.value }))}
                        placeholder="Nicho/uso (worship, podcast...)"
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                      <input value={referenceForm.tags} onChange={e => setReferenceForm(prev => ({ ...prev, tags: e.target.value }))}
                        placeholder="Tags (separadas por vírgula)"
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                    </div>
                    <textarea value={referenceForm.notes} onChange={e => setReferenceForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Observações"
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
                    <textarea value={referenceForm.likedAspects} onChange={e => setReferenceForm(prev => ({ ...prev, likedAspects: e.target.value }))}
                      placeholder="O que você gostou nessa edição?"
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
                    <select value={referenceForm.planId} onChange={e => setReferenceForm(prev => ({ ...prev, planId: e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500">
                      <option value="">Sem plano associado</option>
                      {editPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                    </select>
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.mkv,.webm"
                      onChange={e => {
                        setReferenceUiError('');
                        setReferenceForm(prev => ({ ...prev, file: e.target.files?.[0] || null }));
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-300 file:mr-2 file:rounded-lg file:border-0 file:bg-brand-500 file:px-2 file:py-1 file:text-[11px] file:font-bold file:text-white" />
                    <input value={referenceForm.linkUrl} onChange={e => setReferenceForm(prev => ({ ...prev, linkUrl: e.target.value }))}
                      placeholder="Adicionar por link (Drive/Dropbox/link direto)"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleCreateReference} disabled={uploadingReference}
                        className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-600">
                        {uploadingReference ? `Enviando vídeo... ${referenceUploadProgress}%` : '+ Enviar vídeo de edição'}
                      </button>
                      <button type="button" onClick={handleCreateReferenceLink}
                        className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600">
                        + Adicionar link de referência
                      </button>
                      <button type="button" onClick={() => handleAnalyzeStyle()}
                        className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600">
                        Analisar estilo
                      </button>
                      <button type="button" onClick={() => handleAnalyzeFrames()}
                        className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600">
                        Detectar cortes por frame
                      </button>
                      <button type="button" onClick={() => handleAnalyzeTutorialReference()}
                        className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-300 hover:border-amber-400/50">
                        Analisar como aula de edição
                      </button>
                      <button type="button" onClick={() => {
                        if (!selectedReferenceId) return toast.error('Selecione uma referência');
                        setUseReferenceStyle(true);
                        setUseFrameCutAnalysis(true);
                        jumpToVideoSquadTab('smartcut');
                      }}
                        className="rounded-xl border border-brand-500/40 px-3 py-2 text-xs font-semibold text-brand-300">
                        Usar como estilo no SmartCut
                      </button>
                    </div>
                    {uploadingReference && (
                      <div className="rounded-xl border border-gray-800 bg-gray-900 px-2.5 py-2">
                        <p className="text-[11px] text-gray-300">Enviando vídeo...</p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${referenceUploadProgress}%` }} />
                        </div>
                      </div>
                    )}
                    {referenceUiError && (
                      <div className="rounded-xl border border-red-900/50 bg-red-500/5 px-2.5 py-2">
                        <p className="text-[11px] text-red-300">{referenceUiError}</p>
                      </div>
                    )}
                    {lastStyleAnalysis && (
                      <div className="rounded-xl border border-gray-800 bg-gray-900 px-2.5 py-2">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider">Última análise de estilo</p>
                        <p className="text-xs text-gray-300 mt-1">
                          Ritmo: {lastStyleAnalysis.rhythm} • Legenda: {lastStyleAnalysis.captionType} •
                          Zoom: {lastStyleAnalysis.useZoom ? 'sim' : 'não'} •
                          Jump cut: {lastStyleAnalysis.useJumpCut ? 'sim' : 'não'} •
                          Perfil: {lastStyleAnalysis.resembles}
                        </p>
                      </div>
                    )}
                    {referenceLearningJob && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-2.5 py-2">
                        <p className="text-[10px] text-amber-300 uppercase tracking-wider">Job de aprendizado</p>
                        <p className="mt-1 text-xs text-gray-300">
                          Status: {referenceLearningJob.status} • Progresso: {referenceLearningJob.progress || 0}% • Etapa: {referenceLearningJob.currentStep || 'processando'}
                        </p>
                      </div>
                    )}
                    {referenceTutorialAnalysis?.detectedTechniques?.length > 0 && (
                      <div className="rounded-xl border border-gray-800 bg-gray-900 px-2.5 py-2">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider">Técnicas detectadas</p>
                        <div className="mt-2 space-y-2">
                          {referenceTutorialAnalysis.detectedTechniques.map(technique => (
                            <div key={technique.id} className="rounded-lg border border-gray-800 bg-gray-950/70 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-gray-200">{technique.name}</p>
                                <span className="text-[10px] text-amber-300">{Math.round(Number(technique.confidence || 0) * 100)}%</span>
                              </div>
                              <p className="mt-1 text-[11px] text-gray-500">{technique.category}</p>
                              <p className="mt-1 text-[11px] text-gray-400">{(technique.evidence || []).join(' • ')}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <button type="button" onClick={() => handleSavePresetFromTechnique(technique)}
                                  className="rounded-lg border border-amber-500/30 px-2 py-1 text-[10px] font-semibold text-amber-300">
                                  Salvar na Biblioteca
                                </button>
                                <button type="button" onClick={() => jumpToVideoSquadTab('library')}
                                  className="rounded-lg border border-brand-500/40 px-2 py-1 text-[10px] font-semibold text-brand-300">
                                  Usar este estilo agora
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {loadingReferences && <p className="text-xs text-gray-500">Carregando referências...</p>}
                    {!loadingReferences && references.length === 0 && <p className="text-xs text-gray-500">Você ainda não enviou referências. Envie um vídeo de edição que você gostou para o sistema aprender o estilo.</p>}
                    {references.map(ref => (
                      <div key={ref.id} className={clsx('rounded-xl border p-2.5', selectedReferenceId === ref.id ? 'border-brand-500/40 bg-brand-500/10' : 'border-gray-800 bg-gray-900')}>
                        <p className="text-xs font-bold text-gray-100">{ref.name}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{ref.description || ref.notes || 'Sem observações'}</p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          Tipo: {ref.sourceType || 'upload'} • Status: {referenceStatusLabel(ref.status)} •
                          Data: {ref.createdAt ? new Date(ref.createdAt).toLocaleDateString() : '-'}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          Tags: {Array.isArray(ref.tags) ? ref.tags.join(', ') : (ref.tags || '-')}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">Plano: {editPlans.find(plan => plan.id === ref.planId)?.name || 'não associado'}</p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          Arquivo: {ref.originalName || ref.filename || '-'} {ref.mimeType ? `• ${ref.mimeType}` : ''}
                        </p>
                        {resolveMediaUrl(ref) && ref.sourceType !== 'link' && (
                          <video
                            className="mt-2 w-full rounded-lg border border-gray-800 bg-black"
                            controls
                            playsInline
                            preload="metadata"
                            src={resolveMediaUrl(ref)}
                            onError={() => {
                              const resolved = resolveMediaUrl(ref);
                              setReferencePreviewErrors(prev => ({
                                ...prev,
                                [ref.id]: `Upload concluído, mas o preview não abriu. A URL retornada foi: ${resolved}`,
                              }));
                            }}
                          />
                        )}
                        {resolveMediaUrl(ref) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => window.open(resolveMediaUrl(ref), '_blank', 'noopener,noreferrer')}
                              className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600"
                            >
                              Abrir vídeo
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const url = resolveMediaUrl(ref);
                                if (!url) return;
                                try {
                                  await navigator.clipboard.writeText(url);
                                  toast.success('URL copiada');
                                } catch {
                                  toast.error('Falha ao copiar URL');
                                }
                              }}
                              className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600"
                            >
                              Copiar URL
                            </button>
                          </div>
                        )}
                        {referencePreviewErrors[ref.id] && (
                          <p className="mt-2 text-[10px] text-amber-300 break-all">{referencePreviewErrors[ref.id]}</p>
                        )}
                        {ref.sourceType === 'link' && ref.sourceUrl && (
                          <p className="mt-1 text-[10px] text-sky-300 break-all">{ref.sourceUrl}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => setSelectedReferenceId(ref.id)}
                            className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600">
                            Selecionar
                          </button>
                          <button type="button" onClick={() => handleAnalyzeStyle(ref.id)}
                            className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600">
                            Analisar estilo
                          </button>
                          <button type="button" onClick={() => handleAnalyzeFrames(ref.id)}
                            className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600">
                            Frames
                          </button>
                          <button type="button" onClick={() => handleAnalyzeTutorialReference(ref.id)}
                            className="rounded-lg border border-amber-500/30 px-2 py-1 text-[10px] font-semibold text-amber-300">
                            Aula de edição
                          </button>
                          <button type="button" onClick={() => {
                            setSelectedReferenceId(ref.id);
                            setUseReferenceStyle(true);
                            setUseFrameCutAnalysis(true);
                            jumpToVideoSquadTab('smartcut');
                          }}
                            className="rounded-lg border border-brand-500/40 px-2 py-1 text-[10px] font-semibold text-brand-300">
                            Usar como referência
                          </button>
                          <button type="button" onClick={() => handleViewReferenceAnalysis(ref.id)}
                            className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600">
                            Ver análise
                          </button>
                          <button type="button" onClick={() => handleRemoveReference(ref.id)}
                            className="rounded-lg border border-red-900/50 px-2 py-1 text-[10px] font-semibold text-red-300 hover:border-red-700">
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(
              <div ref={framesSectionRef} className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
                <div>
                  <p className="text-xs font-bold text-gray-200">ANÁLISE POR FRAMES</p>
                  <p className="text-[11px] text-gray-500">FPS, duração, cortes detectados e timecodes da referência selecionada.</p>
                </div>
                {!lastFrameCutAnalysis && <p className="text-xs text-gray-500">Execute “Detectar cortes por frame” em uma referência para visualizar os dados.</p>}
                {lastFrameCutAnalysis && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                      {[
                        ['FPS', lastFrameCutAnalysis.fps],
                        ['Duração', `${lastFrameCutAnalysis.duration}s`],
                        ['Total de frames', lastFrameCutAnalysis.totalFrames],
                        ['Cortes detectados', lastFrameCutAnalysis.detectedCuts?.length || 0],
                        ['Média entre cortes', `${lastFrameCutAnalysis.averageShotLengthSeconds}s`],
                        ['Ritmo', lastFrameCutAnalysis.editingPace],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-2 py-2">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</p>
                          <p className="text-xs font-bold text-gray-200 mt-1">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-gray-800 bg-gray-900 p-2 max-h-[260px] overflow-y-auto">
                      {(lastFrameCutAnalysis.detectedCuts || []).map(cut => (
                        <p key={`${cut.cutIndex}-${cut.frame}`} className="text-[11px] text-gray-300 py-1 border-b border-gray-800 last:border-b-0">
                          Corte {cut.cutIndex} — frame {cut.frame} — {cut.timecode} — {cut.type}
                        </p>
                      ))}
                    </div>
                  </>
                )}
                {videoToolsStatus && (
                  <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-gray-200">FERRAMENTAS DO PIPELINE</p>
                      <button
                        type="button"
                        onClick={loadToolsStatus}
                        className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600"
                      >
                        Atualizar status
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                      {Object.entries(videoToolsStatus).map(([toolId, tool]) => (
                        <div key={toolId} className="rounded-xl border border-gray-800 bg-gray-950/70 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{toolId}</p>
                          <p className={clsx('mt-1 text-xs font-bold', tool?.available ? 'text-emerald-300' : 'text-amber-300')}>
                            {tool?.available ? 'available' : 'degradado'}
                          </p>
                          <p className="mt-1 text-[10px] text-gray-500">{tool?.version || 'sem versão detectada'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(videoProToolchain || videoProReadiness) && (
                  <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-brand-300">MOTOR PROFISSIONAL</p>
                        <p className="text-[11px] text-gray-500">Stack detectado, readiness do pipeline e presets profissionais com fallback seguro.</p>
                      </div>
                      <button
                        type="button"
                        onClick={loadToolsStatus}
                        className="rounded-lg border border-brand-500/30 px-2 py-1 text-[10px] font-semibold text-brand-300"
                      >
                        Atualizar motor
                      </button>
                    </div>

                    {videoProReadiness && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-200 mb-2">PIPELINE READINESS</p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                          {Object.entries(videoProReadiness).map(([key, value]) => (
                            <div key={key} className="rounded-xl border border-gray-800 bg-gray-950/70 p-2">
                              <p className="text-[10px] uppercase tracking-wider text-gray-600">{key}</p>
                              <p className={clsx('mt-1 text-xs font-bold', value ? 'text-emerald-300' : 'text-amber-300')}>
                                {value ? 'ready' : 'fallback'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {videoProToolchain && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-200 mb-2">TOOLCHAIN PROFISSIONAL</p>
                        <div className="space-y-2">
                          {Object.entries(videoProToolchain).map(([groupName, tools]) => (
                            <div key={groupName} className="rounded-xl border border-gray-800 bg-gray-950/70 p-2">
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{groupName}</p>
                              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                {Object.entries(tools || {}).map(([toolName, tool]) => (
                                  <div key={`${groupName}-${toolName}`} className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1.5">
                                    <p className="text-[10px] text-gray-500">{toolName}</p>
                                    <p className={clsx('text-[11px] font-bold mt-1', tool?.available ? 'text-emerald-300' : 'text-amber-300')}>
                                      {tool?.available ? 'OK' : 'ausente'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {videoProFallbacks.length > 0 && (
                      <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                        <p className="text-[11px] font-bold text-gray-200 mb-2">FALLBACKS ATIVOS</p>
                        <div className="space-y-1">
                          {videoProFallbacks.map((item) => (
                            <p key={item} className="text-[11px] text-gray-400">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 xl:grid-cols-3">
                      <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                        <p className="text-[11px] font-bold text-gray-200 mb-2">PRESETS PROFISSIONAIS</p>
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {videoProPresets.slice(0, 10).map((preset) => (
                            <div key={preset.id} className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-2">
                              <p className="text-[11px] font-bold text-gray-200">{preset.name}</p>
                              <p className="mt-1 text-[10px] text-gray-500">{preset.recommendedUse}</p>
                              <p className="mt-1 text-[10px] text-brand-300">Tools: {(preset.toolsPreferred || []).slice(0, 4).join(', ')}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                        <p className="text-[11px] font-bold text-gray-200 mb-2">COLOR LOOKS</p>
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {videoProColorPresets.slice(0, 10).map((preset) => (
                            <div key={preset.id} className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-2">
                              <p className="text-[11px] font-bold text-gray-200">{preset.label}</p>
                              <p className="mt-1 text-[10px] text-gray-500">{preset.ffmpegFilters}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                        <p className="text-[11px] font-bold text-gray-200 mb-2">AUDIO CHAINS</p>
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {videoProAudioPresets.slice(0, 10).map((preset) => (
                            <div key={preset.id} className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-2">
                              <p className="text-[11px] font-bold text-gray-200">{preset.label}</p>
                              <p className="mt-1 text-[10px] text-gray-500">{(preset.chain || []).join(' • ')}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── PIPELINE INTERATIVO MOTOR PRO ─────────────────── */}
                    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 space-y-3">
                      <p className="text-[11px] font-bold text-brand-300">PIPELINE INTERATIVO — MOTOR PROFISSIONAL</p>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Caminho do vídeo</label>
                          <input
                            type="text"
                            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-600"
                            placeholder="/caminho/do/video.mp4 ou videoId"
                            value={proSourceVideo}
                            onChange={e => setProSourceVideo(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Preset</label>
                          <select
                            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200"
                            value={proPresetId}
                            onChange={e => setProPresetId(e.target.value)}
                          >
                            {(videoProPresets.length ? videoProPresets : [{ id: 'sports_highlight_pro', name: 'Sports Highlight Pro' }, { id: 'viral_shorts_aggressive', name: 'Viral Shorts' }, { id: 'podcast_clean_cut', name: 'Podcast Clean Cut' }]).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Clips</label>
                          <input type="number" min={1} max={10} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200" value={proClipCount} onChange={e => setProClipCount(Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Duração alvo (s)</label>
                          <input type="number" min={5} max={300} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200" value={proTargetDuration} onChange={e => setProTargetDuration(Number(e.target.value))} />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={proJobRunning || !proSourceVideo.trim()}
                        onClick={runProPipeline}
                        className={clsx('w-full rounded-xl px-4 py-2 text-[12px] font-bold transition-all', proJobRunning ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-brand-500 text-white hover:bg-brand-400')}
                      >
                        {proJobRunning ? `Processando: ${proJobStage || '...'}` : 'Analisar → Highlights → Renderizar'}
                      </button>

                      {proJobError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                          <p className="text-[11px] text-red-400">Erro: {proJobError}</p>
                        </div>
                      )}

                      {proAnalysisResult && (
                        <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-2 space-y-2">
                          <p className="text-[10px] font-bold text-gray-300 uppercase">Análise</p>
                          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                            {[
                              ['Ferramentas', (proAnalysisResult.usedTools || []).join(', ')],
                              ['Candidatos', proAnalysisResult.candidates?.length || 0],
                              ['Cenas', proAnalysisResult.analysis?.scenes?.length || 0],
                              ['Picos áudio', proAnalysisResult.analysis?.peaks?.length || 0],
                            ].map(([l, v]) => (
                              <div key={l} className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1">
                                <p className="text-[9px] text-gray-600 uppercase">{l}</p>
                                <p className="text-[10px] font-bold text-gray-200 mt-0.5 truncate">{v}</p>
                              </div>
                            ))}
                          </div>
                          {(proAnalysisResult.fallbacks || []).length > 0 && (
                            <p className="text-[9px] text-amber-400">Fallbacks: {proAnalysisResult.fallbacks.join(' • ')}</p>
                          )}
                        </div>
                      )}

                      {proHighlightsResult && (
                        <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-2 space-y-1">
                          <p className="text-[10px] font-bold text-gray-300 uppercase">Highlights ({proHighlightsResult.clips?.length})</p>
                          {(proHighlightsResult.clips || []).slice(0, 5).map((c, i) => {
                            const bd = c.scoreBreakdown || {};
                            return (
                              <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1.5">
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] font-bold text-gray-200">Clip {i + 1} — {c.start?.toFixed(1)}s → {c.end?.toFixed(1)}s ({c.duration?.toFixed(1)}s)</p>
                                  <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', Number(c.score) >= 70 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')}>{c.score?.toFixed(0)}</span>
                                </div>
                                <p className="text-[9px] text-gray-500 mt-0.5">{c.reason || c.reasons?.[0] || '—'}</p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {[['Audio', bd.audioPeakScore], ['Motion', bd.motionScore], ['Fala', bd.speechHookScore], ['Duração', bd.durationFitScore]].map(([label, val]) => (
                                    <span key={label} className="text-[9px] text-gray-600">{label}: <span className="text-gray-400">{val?.toFixed(0) ?? '?'}</span></span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {proRenderResult && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2 space-y-1">
                          <p className="text-[10px] font-bold text-emerald-300 uppercase">Render Completo — {proRenderResult.outputs?.length || 0} arquivo(s)</p>
                          {proRenderResult.primaryOutput && (
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-gray-300">{proRenderResult.primaryOutput.fileName}</p>
                              <span className="text-[9px] text-gray-500">{((proRenderResult.primaryOutput.size || 0) / 1024 / 1024).toFixed(1)}MB</span>
                              <span className="text-[9px] text-gray-500">{proRenderResult.primaryOutput.duration?.toFixed(1)}s</span>
                              <span className="text-[9px] text-emerald-400">{proRenderResult.primaryOutput.videoCodec}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── VÍDEOS DE REFERÊNCIA — MOTOR PRO ─────────────── */}
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
                      <p className="text-[11px] font-bold text-violet-300">VÍDEOS DE REFERÊNCIA — MOTOR PRO</p>
                      <p className="text-[10px] text-gray-500">Cole um link Drive/direto ou use o vídeo já enviado. Analise o estilo e aplique no Motor Pro.</p>

                      {/* Importar link ou usar vídeo já carregado */}
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider">Link ou caminho do vídeo de referência</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-600"
                            placeholder="https://drive.google.com/... ou /caminho/video.mp4"
                            value={proRefUrl}
                            onChange={e => setProRefUrl(e.target.value)}
                          />
                          <button
                            type="button"
                            disabled={proRefLoading || !proRefUrl.trim()}
                            onClick={handleImportLight}
                            className="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700 disabled:opacity-40"
                          >
                            {proRefLoading ? '...' : 'Importar'}
                          </button>
                        </div>
                        {proSourceVideo && (
                          <p className="text-[10px] text-emerald-400">Vídeo fonte atual (Motor Pro): {proSourceVideo.slice(0, 60)}{proSourceVideo.length > 60 ? '…' : ''}</p>
                        )}
                      </div>

                      {/* Nome e categoria */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Nome da referência</label>
                          <input
                            type="text"
                            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200"
                            placeholder="Ex: Estilo esportivo agressivo"
                            value={proRefName}
                            onChange={e => setProRefName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Categoria</label>
                          <select
                            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200"
                            value={proRefCategory}
                            onChange={e => setProRefCategory(e.target.value)}
                          >
                            {[['general','Geral'],['sports','Esportes'],['podcast','Podcast'],['worship','Worship'],['viral','Viral'],['documentary','Documentário']].map(([v,l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Botão Analisar Estilo */}
                      <button
                        type="button"
                        disabled={proRefLoading || (!proRefUrl.trim() && !proSourceVideo.trim())}
                        onClick={handleAnalyzeReferenceNew}
                        className="w-full rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-[12px] font-bold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40"
                      >
                        {proRefLoading ? 'Analisando...' : 'Analisar Estilo'}
                      </button>

                      {proRefError && (
                        <p className="text-[10px] text-red-400 rounded-lg border border-red-500/20 bg-red-500/5 p-2">{proRefError}</p>
                      )}

                      {/* Resultado do style profile */}
                      {proRefStyleProfile && (
                        <div className="rounded-xl border border-violet-500/20 bg-gray-950/70 p-2 space-y-2">
                          <p className="text-[10px] font-bold text-violet-300 uppercase">Style Profile — ID: {proRefId?.slice(0, 8)}…</p>
                          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                            {[
                              ['Ritmo', proRefStyleProfile.cutPace],
                              ['Avg Shot', `${proRefStyleProfile.avgShotDuration}s`],
                              ['Movimento', proRefStyleProfile.motionIntensity],
                              ['Zoom', proRefStyleProfile.zoomUsage],
                              ['Transição', proRefStyleProfile.transitionStyle],
                              ['Legenda', proRefStyleProfile.captionStyle],
                            ].map(([l, v]) => (
                              <div key={l} className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1">
                                <p className="text-[9px] text-gray-600 uppercase">{l}</p>
                                <p className="text-[10px] font-bold text-gray-200">{v}</p>
                              </div>
                            ))}
                          </div>

                          {/* Botão Aplicar no Motor Pro */}
                          <button
                            type="button"
                            disabled={proRefRenderLoading || !proSourceVideo.trim()}
                            onClick={handleApplyReferenceToMotorPro}
                            className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[12px] font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                          >
                            {proRefRenderLoading ? 'Renderizando...' : 'Aplicar este estilo no Motor Pro'}
                          </button>
                          {!proSourceVideo.trim() && (
                            <p className="text-[10px] text-amber-400">Informe o vídeo fonte no campo "Caminho do vídeo" acima antes de aplicar.</p>
                          )}
                        </div>
                      )}

                      {/* Resultado do render com referência */}
                      {proRefRenderResult && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2 space-y-1">
                          <p className="text-[10px] font-bold text-emerald-300 uppercase">Render com Referência — {proRefRenderResult.outputs?.length || 0} clip(s)</p>
                          {proRefRenderResult.primaryOutput && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[10px] text-gray-300">{proRefRenderResult.primaryOutput.fileName}</p>
                              <span className="text-[9px] text-gray-500">{((proRefRenderResult.primaryOutput.size || 0) / 1024 / 1024).toFixed(1)}MB</span>
                              <span className="text-[9px] text-gray-500">{proRefRenderResult.primaryOutput.duration?.toFixed(1)}s</span>
                              <span className="text-[9px] text-emerald-400">{proRefRenderResult.primaryOutput.videoCodec}</span>
                            </div>
                          )}
                          <p className="text-[10px] text-gray-500">jobId: {proRefRenderResult.jobId}</p>
                        </div>
                      )}
                    </div>

                    {/* ── MOTOR PRO FULL STUDIO ─────────────────────────── */}
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-[11px] font-bold text-cyan-300">MOTOR PRO FULL STUDIO</p>
                        {fsPreflight && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fsPreflight.ready ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'}`}>
                            {fsPreflight.ready ? 'READY' : 'BLOQUEADO'}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500">Renderização nível After Effects / DaVinci — 10 etapas, sem fallback silencioso. Bloqueado se ferramenta obrigatória estiver ausente.</p>

                      {/* Preset selector */}
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider">Preset Full Studio</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200"
                          value={fsPresetId}
                          onChange={e => { setFsPresetId(e.target.value); setFsPreflight(null); }}
                        >
                          {[
                            ['podcast_studio_full_studio',  'Podcast Studio Full Studio'],
                            ['viral_kinetic_full_studio',   'Viral Kinetic Full Studio'],
                            ['product_premium_full_studio', 'Product Premium Full Studio'],
                            ['sports_broadcast_full_studio','Sports Broadcast Full Studio (req. Blender)'],
                            ['cinematic_trailer_full_studio','Cinematic Trailer Full Studio (req. Blender)'],
                            ['worship_atmosphere_full_studio','Worship Atmosphere Full Studio (req. Blender+Natron)'],
                          ].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>

                      {/* Preflight result */}
                      {fsPreflight && (
                        <div className={`rounded-xl border p-2 space-y-2 ${fsPreflight.ready ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                          <p className="text-[10px] font-bold text-gray-300 uppercase">Status: {fsPreflight.status || (fsPreflight.ready ? 'ready' : 'blocked')}</p>

                          {/* Tool layers */}
                          {fsPreflight.toolStatus && (
                            <div className="grid grid-cols-3 gap-1">
                              {Object.entries(fsPreflight.toolStatus).map(([tool, avail]) => (
                                <div key={tool} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${avail ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {avail ? '✓' : '✗'} {tool}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Missing tools */}
                          {fsPreflight.missingRequiredTools?.length > 0 && (
                            <div>
                              <p className="text-[9px] text-red-400 font-bold uppercase">Ferramentas obrigatórias ausentes:</p>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {fsPreflight.missingRequiredTools.map(t => (
                                  <span key={t} className="rounded px-1.5 py-0.5 text-[9px] bg-red-500/20 text-red-300 border border-red-500/30">{t}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Blocking reasons */}
                          {fsPreflight.blockingReasons?.length > 0 && (
                            <div>
                              <p className="text-[9px] text-amber-400 font-bold uppercase">Motivos de bloqueio:</p>
                              <ul className="mt-0.5 space-y-0.5">
                                {fsPreflight.blockingReasons.map((r, i) => (
                                  <li key={i} className="text-[9px] text-gray-400">• {r}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Next actions */}
                          {fsPreflight.nextActions?.length > 0 && (
                            <div>
                              <p className="text-[9px] text-cyan-400 font-bold uppercase">Próximas ações:</p>
                              <ul className="mt-0.5 space-y-0.5">
                                {fsPreflight.nextActions.map((a, i) => (
                                  <li key={i} className="text-[9px] text-gray-400 font-mono break-all">• {a}</li>
                                ))}
                              </ul>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(fsPreflight.nextActions.filter(a => a.startsWith('apt') || a.startsWith('pip') || a.startsWith('brew') || a.startsWith('sudo') || a.startsWith('docker')).join('\n'));
                                  toast.success('Comandos copiados!');
                                }}
                                className="mt-1 rounded-lg border border-cyan-500/30 px-2 py-0.5 text-[9px] text-cyan-400 hover:border-cyan-500/60"
                              >
                                Copiar comandos
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {fsError && (
                        <p className="text-[10px] text-red-400 rounded-lg border border-red-500/20 bg-red-500/5 p-2">{fsError}</p>
                      )}

                      {/* Buttons */}
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={fsPreflightLoading}
                          onClick={handleFullStudioPreflight}
                          className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"
                        >
                          {fsPreflightLoading ? 'Verificando...' : 'Verificar Full Studio'}
                        </button>
                        <button
                          type="button"
                          disabled={fsRenderLoading || !proSourceVideo.trim() || (fsPreflight && !fsPreflight.ready)}
                          onClick={handleFullStudioRender}
                          title={fsPreflight && !fsPreflight.ready ? 'Toolchain bloqueado — execute preflight para ver ferramentas faltantes' : !proSourceVideo.trim() ? 'Informe vídeo fonte no Motor Pro' : ''}
                          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                        >
                          {fsRenderLoading ? 'Renderizando Full Studio...' : 'Rodar Edição Full Studio'}
                        </button>
                      </div>
                      {fsPreflight && !fsPreflight.ready && (
                        <p className="text-[10px] text-amber-400">Full Studio bloqueado. Resolva as ferramentas ausentes antes de renderizar.</p>
                      )}
                      {!proSourceVideo.trim() && (
                        <p className="text-[10px] text-gray-600">Informe o vídeo fonte no campo "Caminho do vídeo" acima para habilitar o render.</p>
                      )}

                      {/* Render result */}
                      {fsRenderResult && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2 space-y-1">
                          <p className="text-[10px] font-bold text-emerald-300 uppercase">Full Studio — {fsRenderResult.outputs?.length || 0} clip(s)</p>
                          {fsRenderResult.primaryOutput && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[10px] text-gray-300">{fsRenderResult.primaryOutput.fileName}</p>
                              <span className="text-[9px] text-gray-500">{((fsRenderResult.primaryOutput.size || 0) / 1024 / 1024).toFixed(1)}MB</span>
                              <span className="text-[9px] text-gray-500">{fsRenderResult.primaryOutput.duration?.toFixed(1)}s</span>
                              <span className="text-[9px] text-emerald-400">{fsRenderResult.primaryOutput.videoCodec}</span>
                            </div>
                          )}
                          {fsRenderResult.stages && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(fsRenderResult.stages).map(([stage, ok]) => (
                                <span key={stage} className={`text-[8px] px-1 rounded ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {ok ? '✓' : '✗'} {stage}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[9px] text-gray-500">jobId: {fsRenderResult.jobId}</p>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                      <p className="text-[11px] font-bold text-gray-200 mb-2">RELATORIO DO ULTIMO JOB</p>
                      {jobs[0] ? (
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <div className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-2">
                            <p className="text-[10px] text-gray-500">Job</p>
                            <p className="text-[11px] font-bold text-gray-200">{jobs[0].jobId || jobs[0].id || '—'}</p>
                          </div>
                          <div className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-2">
                            <p className="text-[10px] text-gray-500">Status</p>
                            <p className="text-[11px] font-bold text-gray-200">{jobs[0].status || '—'}</p>
                          </div>
                          <div className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-2">
                            <p className="text-[10px] text-gray-500">Arquivos</p>
                            <p className="text-[11px] font-bold text-gray-200">{jobs[0].outputs?.length || 0}</p>
                          </div>
                          <div className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-2">
                            <p className="text-[10px] text-gray-500">Base</p>
                            <p className="text-[11px] font-bold text-gray-200">FFmpeg / FFprobe</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">Nenhum job processado nesta sessao para relatorio.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
              <div>
                <p className="text-xs font-bold text-gray-200">PORTFÓLIO</p>
                <p className="text-[11px] text-gray-500">Guarde vídeos, estilos e referências que você quer reutilizar em futuras edições.</p>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {references.length === 0 && <p className="text-xs text-gray-500">Portfólio vazio.</p>}
                {references.map(ref => (
                  <div key={`portfolio-${ref.id}`} className="rounded-xl border border-gray-800 bg-gray-900 px-2.5 py-2">
                    <p className="text-xs font-bold text-gray-200">{ref.name}</p>
                    <p className="text-[10px] text-gray-600 mt-1">Tipo: {ref.sourceType || 'vídeo exemplo'} • Tags: {Array.isArray(ref.tags) ? ref.tags.join(', ') : (ref.tags || '-')}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{ref.description || ref.notes || 'Sem descrição'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {/* ── botões originais SmartCut (não remover) ── */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReferenceId(ref.id);
                          setUseReferenceStyle(true);
                          setUseFrameCutAnalysis(true);
                        }}
                        className="rounded-lg border border-brand-500/40 px-2 py-1 text-[10px] font-semibold text-brand-300"
                      >
                        Aplicar no SmartCut
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReferenceId(ref.id);
                          handleAnalyzeStyle(ref.id);
                        }}
                        className="rounded-lg border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:border-gray-600"
                      >
                        Comparar com vídeo atual
                      </button>
                      {/* ── botões novos Motor Pro ── */}
                      <button
                        type="button"
                        disabled={portfolioProAnalyzed[ref.id]?.loading}
                        onClick={() => handleAnalyzePortfolioRef(ref)}
                        className="rounded-lg border border-violet-500/40 px-2 py-1 text-[10px] font-semibold text-violet-300 hover:border-violet-500/70 disabled:opacity-40"
                      >
                        {portfolioProAnalyzed[ref.id]?.loading ? 'Analisando...' : portfolioProAnalyzed[ref.id]?.proRefId ? '✓ Analisado (repetir)' : 'Analisar como ref. Motor Pro'}
                      </button>
                      {portfolioProAnalyzed[ref.id]?.proRefId && (
                        <button
                          type="button"
                          disabled={portfolioProAnalyzed[ref.id]?.renderLoading || !proSourceVideo.trim()}
                          onClick={() => handleApplyPortfolioRefToMotorPro(ref)}
                          title={!proSourceVideo.trim() ? 'Carregue um vídeo fonte no Motor Pro primeiro' : ''}
                          className="rounded-lg border border-emerald-500/40 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:border-emerald-500/70 disabled:opacity-40"
                        >
                          {portfolioProAnalyzed[ref.id]?.renderLoading ? 'Renderizando...' : 'Aplicar no Motor Pro'}
                        </button>
                      )}
                      {portfolioProAnalyzed[ref.id]?.error && (
                        <p className="w-full text-[10px] text-red-400 mt-0.5">{portfolioProAnalyzed[ref.id].error}</p>
                      )}
                      {portfolioProAnalyzed[ref.id]?.renderResult?.primaryOutput && (
                        <p className="w-full text-[10px] text-emerald-400 mt-0.5">
                          Clip gerado: {portfolioProAnalyzed[ref.id].renderResult.primaryOutput.fileName} — {portfolioProAnalyzed[ref.id].renderResult.primaryOutput.duration}s
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
              <div>
                <p className="text-xs font-bold text-gray-200">IA SUPERVISORA DE EDIÇÃO</p>
                <p className="text-[11px] text-gray-500">A IA supervisora analisa o vídeo original, compara com referências e orienta o melhor plano de edição.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const review = await runSupervisorValidation();
                      toast.success(review?.finalRecommendation || 'Análise do vídeo atual concluída');
                    } catch (err) {
                      toast.error(err.message || 'Falha ao analisar vídeo atual');
                    }
                  }}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600"
                >
                  Analisar vídeo atual
                </button>
                <button
                  type="button"
                  onClick={() => selectedReferenceId ? handleAnalyzeStyle(selectedReferenceId) : toast.error('Selecione uma referência primeiro')}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600"
                >
                  Analisar referências
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const suggestion = await videoApi.supervisorSuggest({
                        editingPlanId: selectedEditPlanId || null,
                        referenceVideoIds: selectedReferenceId ? [selectedReferenceId] : [],
                        platform: platform || 'tiktok',
                        objective,
                      });
                      const planName = suggestion?.suggestion?.editingPlanName;
                      if (planName) toast.success(`Plano sugerido: ${planName}`);
                    } catch (err) {
                      toast.error(err.message || 'Falha ao sugerir plano');
                    }
                  }}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600"
                >
                  Sugerir plano de edição
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const review = await runSupervisorValidation();
                      toast.success(review?.finalRecommendation || 'Validação concluída');
                    } catch (err) {
                      toast.error(err.message || 'Falha na validação');
                    }
                  }}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600"
                >
                  Validar se o corte final ficou bom
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (!lastSupervisorReview) {
                        await runSupervisorValidation();
                      }
                      if (!lastSupervisorChecklist.length) {
                        return toast.error('Checklist ainda não disponível');
                      }
                      toast.success('Checklist da edição gerado');
                    } catch (err) {
                      toast.error(err.message || 'Falha ao gerar checklist');
                    }
                  }}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-600"
                >
                  Gerar checklist da edição
                </button>
              </div>
              {lastSupervisorReview && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 px-2.5 py-2 space-y-1">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider">Última validação</p>
                  <p className="text-xs text-gray-300">
                    Status: {lastSupervisorReview.approved ? 'aprovado' : 'revisar'} • Score: {lastSupervisorReview.score}
                  </p>
                  <p className="text-[11px] text-brand-300">{lastSupervisorReview.finalRecommendation}</p>
                  {lastSupervisorChecklist.length > 0 && (
                    <div className="max-h-[150px] overflow-y-auto border border-gray-800 rounded-lg bg-gray-950 px-2 py-1.5">
                      {lastSupervisorChecklist.map((item, idx) => (
                        <p key={`check-${idx}`} className="text-[11px] text-gray-400 py-0.5">{item}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {videoSquadTab === 'smartcut' && (
              <>
            <div ref={smartcutSectionRef} />

            {/* Drop zone */}
            <div {...getRootProps()} className={clsx(
              'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all',
              isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-gray-800 hover:border-gray-600 bg-gray-900/40')}>
              <input {...getInputProps()} />
              <Film size={28} className={clsx('mx-auto mb-2', isDragActive ? 'text-brand-400' : 'text-gray-700')} />
              <p className="text-sm font-semibold text-gray-300">{isDragActive ? 'Solte aqui' : 'Arraste ou toque para selecionar'}</p>
              <p className="text-xs text-gray-600 mt-1">MP4 · MOV · AVI · MKV · WEBM · máx 2GB</p>
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

            {/* Import URL section (v28) */}
            <div>
              <button onClick={() => setShowImportUrl(v => !v)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2">
                <Link size={12} /> Importar por link / URL
                {showImportUrl ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showImportUrl && (
                <div className="space-y-2.5 bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { id: 'direct_url',         label: 'Link direto (.mp4)' },
                      { id: 'google_drive',        label: 'Google Drive' },
                      { id: 'dropbox',             label: 'Dropbox' },
                      { id: 'youtube_authorized',  label: 'YouTube (autorizado)' },
                    ].map(s => (
                      <button key={s.id} onClick={() => setImportSourceType(s.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          importSourceType === s.id
                            ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
                            : 'border-gray-700 text-gray-500 hover:border-gray-600'
                        }`}>{s.label}</button>
                    ))}
                  </div>

                  <input
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    placeholder={
                      importSourceType === 'google_drive' ? 'https://drive.google.com/file/d/...'
                      : importSourceType === 'dropbox'    ? 'https://www.dropbox.com/s/...'
                      : importSourceType === 'youtube_authorized' ? 'https://www.youtube.com/watch?v=...'
                      : 'https://exemplo.com/video.mp4'
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                    onKeyDown={e => e.key === 'Enter' && handleImportUrl()}
                  />

                  {importSourceType === 'youtube_authorized' && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={confirmedAuthorized}
                        onChange={e => setConfirmedAuthorized(e.target.checked)}
                        className="mt-0.5 accent-brand-500" />
                      <span className="text-xs text-gray-400 leading-relaxed">
                        Confirmo que tenho autorização para baixar este conteúdo (conteúdo próprio, licença Creative Commons ou permissão explícita do autor).
                      </span>
                    </label>
                  )}

                  <p className="text-[10px] text-gray-600 leading-relaxed">
                    {importSourceType === 'direct_url'
                      ? 'Use uma URL pública que aponta diretamente para o arquivo de vídeo. YouTube, Instagram e TikTok não entram como link direto.'
                      : importSourceType === 'google_drive'
                        ? 'Use um link público ou autorizado do Google Drive. O backend converte para baixar o arquivo real.'
                        : importSourceType === 'dropbox'
                          ? 'Use um link público do Dropbox. Links dl=0 são convertidos para download direto.'
                          : 'YouTube usa yt-dlp somente quando YTDLP_ENABLED=true e pode exigir cookies/autorização.'}
                  </p>

                  <button onClick={handleImportUrl} disabled={submitting || !importUrl.trim() || (importSourceType === 'youtube_authorized' && !confirmedAuthorized)}
                    className="w-full py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 text-white"
                    style={{ background: '#e50914' }}>
                    {submitting ? 'Importando...' : 'Importar e processar'}
                  </button>
                </div>
              )}
            </div>

            {/* Metadata panel (v28) */}
            <div>
              <button onClick={() => setShowMetaPanel(v => !v)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2">
                <Settings2 size={12} /> Metadados do export
                {showMetaPanel ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showMetaPanel && (
                <div className="space-y-2 bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <p className="text-xs text-gray-600">Metadados aplicados a cada clip exportado. Originais são removidos automaticamente.</p>
                  {[
                    { label: 'Título',       value: metaTitle,   set: setMetaTitle,   placeholder: 'BotSquad Clip' },
                    { label: 'Autor',        value: metaAuthor,  set: setMetaAuthor,  placeholder: 'BotSquad' },
                    { label: 'Comentário',   value: metaComment, set: setMetaComment, placeholder: 'Created with BotSquad' },
                    { label: 'Tags',         value: metaTags,    set: setMetaTags,    placeholder: 'tiktok,kwai,shorts,reels' },
                  ].map(({ label, value, set, placeholder }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
                      <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Squad toggle */}
            <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5">
              <div>
                <p className="text-xs font-bold text-gray-300">🤖 Video Squad (IA completa)</p>
                <p className="text-[10px] text-gray-600">Transcrição + detecção por IA + metadados</p>
              </div>
              <button onClick={() => setUseSquadPipeline(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative ${useSquadPipeline ? 'bg-brand-500' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useSquadPipeline ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {useSquadPipeline && (
              <label className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-gray-300">Enviar automaticamente para Telegram</p>
                  <p className="text-[10px] text-gray-600">Envia os cortes válidos como documento após a renderização</p>
                </div>
                <input
                  type="checkbox"
                  checked={autoSendTelegram}
                  onChange={e => setAutoSendTelegram(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-brand-500"
                />
              </label>
            )}

            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Integração SmartCut + Biblioteca</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">Plano de edição</label>
                  <select
                    value={selectedEditPlanId}
                    onChange={e => setSelectedEditPlanId(e.target.value)}
                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Nenhum plano</option>
                    {editPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">Exemplo de edição</label>
                  <select
                    value={selectedReferenceId}
                    onChange={e => setSelectedReferenceId(e.target.value)}
                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Nenhuma referência</option>
                    {currentPlanReferences.map(ref => <option key={ref.id} value={ref.id}>{ref.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 cursor-pointer">
                  <span className="text-xs text-gray-300">Usar estilo da referência</span>
                  <input type="checkbox" checked={useReferenceStyle} onChange={e => setUseReferenceStyle(e.target.checked)} className="h-4 w-4 accent-brand-500" />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 cursor-pointer">
                  <span className="text-xs text-gray-300">Usar cortes por frame da referência</span>
                  <input type="checkbox" checked={useFrameCutAnalysis} onChange={e => setUseFrameCutAnalysis(e.target.checked)} className="h-4 w-4 accent-brand-500" />
                </label>
              </div>
              <div className="text-[10px] text-gray-600">
                Plano ativo: {selectedPlan?.name || 'nenhum'} • Referência ativa: {selectedReference?.name || 'nenhuma'}
              </div>
            </div>

            {useSquadPipeline && (
              <>
                {/* Processing mode */}
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Modo de processamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PROCESSING_MODES.map(m => (
                      <button key={m.id} onClick={() => setProcessingMode(m.id)}
                        className={clsx('p-2.5 rounded-xl border text-left transition-all',
                          processingMode === m.id ? 'bg-brand-500/15 border-brand-500/50' : 'bg-gray-900 border-gray-800 hover:border-gray-700')}>
                        <p className={clsx('text-[11px] font-bold', processingMode === m.id ? 'text-brand-300' : 'text-gray-300')}>{m.label}</p>
                        <p className="text-[9px] text-gray-600 leading-tight mt-1">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Edit mode */}
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Modo de edição</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {EDIT_MODES.map(m => (
                      <button key={m.id} type="button" onClick={() => setEditMode(m.id)}
                        className={clsx('p-2.5 rounded-xl border text-left transition-all',
                          editMode === m.id ? 'bg-brand-500/15 border-brand-500/50' : 'bg-gray-900 border-gray-800 hover:border-gray-700')}>
                        <p className={clsx('text-[11px] font-bold', editMode === m.id ? 'text-brand-300' : 'text-gray-300')}>{m.label}</p>
                        <p className="text-[9px] text-gray-600 leading-tight mt-1">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {isChannelCleanEdit && (
                  <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                    <div>
                      <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Tipo de vídeo</p>
                      <div className="grid grid-cols-2 gap-2">
                        {VIDEO_CONTENT_TYPES.map(type => (
                          <button key={type.id} type="button" onClick={() => setVideoContentType(type.id)}
                            className={clsx('px-2.5 py-2 rounded-lg border text-left text-[10px] font-bold transition-colors',
                              videoContentType === type.id ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'border-gray-800 text-gray-400 hover:border-gray-700')}>
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Destino</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {CLEAN_EDIT_DESTINATIONS.map(dest => (
                          <button key={dest.id} type="button" onClick={() => setCleanDestination(dest.id)}
                            className={clsx('px-2.5 py-2 rounded-lg border text-left text-[10px] font-bold transition-colors',
                              cleanDestination === dest.id ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'border-gray-800 text-gray-400 hover:border-gray-700')}>
                            {dest.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Corte de pausas</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {PAUSE_CUT_MODES.map(mode => (
                            <button key={mode.id} type="button" onClick={() => setPauseCutMode(mode.id)}
                              className={clsx('px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-colors',
                                pauseCutMode === mode.id ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'border-gray-800 text-gray-500')}>
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Tratamento de erros de fala</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {MISTAKE_CUT_MODES.map(mode => (
                            <button key={mode.id} type="button" onClick={() => setMistakeCutMode(mode.id)}
                              className={clsx('px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-colors',
                                mistakeCutMode === mode.id ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'border-gray-800 text-gray-500')}>
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Objective */}
                {!isChannelCleanEdit && <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Objetivo do corte</p>
                  <div className="grid grid-cols-3 gap-2">
                    {OBJECTIVES.map(o => (
                      <button key={o.id} onClick={() => setObjective(o.id)}
                        className={clsx('p-2.5 rounded-xl border text-left transition-all',
                          objective === o.id ? 'bg-brand-500/15 border-brand-500/50' : 'bg-gray-900 border-gray-800 hover:border-gray-700')}>
                        <p className="text-sm mb-0.5">{o.icon}</p>
                        <p className={clsx('text-[10px] font-bold', objective === o.id ? 'text-brand-300' : 'text-gray-300')}>{o.label}</p>
                        <p className="text-[9px] text-gray-600 leading-tight">{o.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>}

                {/* Count */}
                {!isChannelCleanEdit && <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Cortes</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {CLIP_COUNT_OPTIONS.map(n => (
                      <button key={n} onClick={() => {
                        if (n === 'auto') {
                          setClipCountMode('auto');
                          setClipCount(null);
                        } else {
                          setClipCountMode('fixed');
                          setClipCount(n);
                        }
                      }}
                        className={clsx('px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                          (n === 'auto' ? clipCountMode === 'auto' : clipCountMode === 'fixed' && clipCount === n)
                            ? 'bg-brand-500/15 border-brand-500/50 text-brand-300'
                            : 'border-gray-800 text-gray-500')}>
                        {n === 'auto' ? 'Auto' : n}
                      </button>
                    ))}
                  </div>
                </div>}

                {/* Clip duration */}
                {!isChannelCleanEdit && <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3">
                  <p className="text-[11px] font-bold text-brand-300 uppercase tracking-wider mb-2">Duração do corte</p>
                  <div className="flex gap-2 flex-wrap">
                    {visibleClipDurationOptions.map(option => (
                      <button key={String(option.value)} onClick={() => {
                        setClipDurationSeconds(option.value);
                        setClipDurationMode(option.mode);
                      }}
                        className={clsx('min-h-[38px] px-4 py-2 rounded-xl border text-sm font-bold transition-colors touch-manipulation',
                          clipDurationSeconds === option.value
                            ? 'bg-brand-500/20 border-brand-500 text-brand-300'
                            : 'border-gray-800 text-gray-500')}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {clipDurationMode === 'custom' && (
                    <label className="block mt-3 space-y-1">
                      <span className="text-[10px] text-gray-500">Duração em segundos</span>
                      <input
                        type="number"
                        min="5"
                        max="600"
                        step="1"
                        value={customClipDurationSeconds}
                        onChange={e => setCustomClipDurationSeconds(e.target.value)}
                        className="w-full min-h-[42px] bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                      />
                    </label>
                  )}
                </div>}

                {/* Format */}
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Formato</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {FORMATS.map(f => (
                      <button key={f.id} onClick={() => setClipFormat(f.id)}
                        className={clsx('px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-colors',
                          clipFormat === f.id ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'border-gray-800 text-gray-500')}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Estilo de legenda</p>
                <label className="flex items-center gap-2 text-[10px] text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={captionsEnabled}
                    onChange={e => {
                      setCaptionsEnabled(e.target.checked);
                      if (!e.target.checked) setCaptionStyle('none');
                      else if (captionStyle === 'none') setCaptionStyle('classic');
                    }}
                    className="h-3.5 w-3.5 accent-brand-500" />
                  Legendas
                </label>
              </div>
              <div className="flex gap-2 flex-wrap">
                {CAPTION_STYLES.map(s => (
                  <button key={s.id} onClick={() => {
                    setCaptionStyle(s.id);
                    setCaptionsEnabled(s.id !== 'none');
                  }}
                    className={clsx('px-3 py-2 rounded-xl border text-xs font-bold transition-all',
                      captionStyle === s.id ? 'border-brand-500/50 ring-1 ring-brand-500/30 scale-[1.04]' : 'border-gray-800 hover:border-gray-700',
                      s.color)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {useSquadPipeline && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 cursor-pointer">
                  <span className="text-xs font-bold text-gray-300">Cortes dinâmicos</span>
                  <input type="checkbox" checked={dynamicCutsEnabled} onChange={e => setDynamicCutsEnabled(e.target.checked)}
                    className="h-4 w-4 accent-brand-500" />
                </label>
                <label className="flex items-center justify-between gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 cursor-pointer">
                  <span className="text-xs font-bold text-gray-300">Remover metadata</span>
                  <input type="checkbox" checked={metadataCleanup} onChange={e => setMetadataCleanup(e.target.checked)}
                    className="h-4 w-4 accent-brand-500" />
                </label>
                <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Ritmo</p>
                  <div className="flex gap-1.5">
                    {['slow','medium','fast'].map(p => (
                      <button key={p} onClick={() => setEditPace(p)}
                        className={clsx('px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors',
                          editPace === p ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'border-gray-800 text-gray-500')}>
                        {p === 'slow' ? 'Leve' : p === 'fast' ? 'Rápido' : 'Médio'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Score mínimo</p>
                  <input type="number" min="50" max="95" value={minScore}
                    onChange={e => setMinScore(Number(e.target.value || 70))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500" />
                </div>
              </div>
            )}

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

            {/* Edit style */}
            <div className="space-y-2 pb-20 sm:pb-4">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">ESTILO DE EDIÇÃO</p>
                <span className="text-[10px] text-gray-500">SmartCut escolhe o trecho. O estilo escolhe a aparência.</span>
              </div>

              <input
                value={styleSearch}
                onChange={e => setStyleSearch(e.target.value)}
                placeholder="Buscar estilo por nome (ex: Zoom, Podcast, Worship...)"
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />

              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {VIDEO_STYLE_CATEGORIES.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setStyleCategory(category)}
                    className={clsx(
                      "shrink-0 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-colors",
                      styleCategory === category
                        ? "bg-brand-500/15 border-brand-500/60 text-brand-300"
                        : "bg-gray-900 border-gray-800 text-gray-500"
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-gray-600">
                {visibleEditStyles.length} estilo(s)
                {styleCategory !== "Todos" ? ` em ${styleCategory}` : ""}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {visibleEditStyles.map(style => {
                  const selected = selectedEditStyleMeta.id === style.id;
                  const detailsOpen = Boolean(expandedStyles[style.id]);
                  return (
                    <div
                      key={style.id}
                      className={clsx(
                        "touch-manipulation rounded-xl border p-2 text-left transition-all bg-gray-900",
                        selected ? "border-brand-500 ring-1 ring-brand-500/40 bg-brand-500/10" : "border-gray-800"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setEditStyle(style.id)}
                        className="w-full text-left"
                      >
                        <EditStylePreview
                          visualPreviewType={style.visualPreviewType}
                          intensity={style.intensity}
                          badge={style.badge}
                        />
                        <div className="mt-2 flex items-start justify-between gap-2">
                          <p className={clsx("text-xs font-bold leading-tight", selected ? "text-brand-200" : "text-gray-200")}>{style.name}</p>
                          <span className={clsx(
                            "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold",
                            style.badge === "Recomendado" ? "bg-brand-500/15 text-brand-300" :
                            style.badge === "Viral" ? "bg-orange-500/15 text-orange-300" :
                            style.badge === "Cinema" ? "bg-amber-500/15 text-amber-300" :
                            style.badge === "Worship" ? "bg-yellow-500/15 text-yellow-300" :
                            style.badge === "Podcast" ? "bg-blue-500/15 text-blue-300" :
                            style.badge === "Clean" ? "bg-emerald-500/15 text-emerald-300" :
                            style.badge === "Ads" ? "bg-cyan-500/15 text-cyan-300" :
                            style.badge === "Pro" ? "bg-violet-500/15 text-violet-300" :
                            style.badge === "Novo" ? "bg-pink-500/15 text-pink-300" :
                            "bg-gray-800 text-gray-400"
                          )}>
                            {style.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] leading-snug text-gray-500">{style.shortDescription}</p>
                        <p className="mt-1 text-[9px] leading-snug text-gray-600">{style.category}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {style.bestFor.slice(0, 4).map(item => (
                            <span key={item} className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-400">
                              {item}
                            </span>
                          ))}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedStyles(prev => ({ ...prev, [style.id]: !prev[style.id] }))}
                        className="mt-2 text-[10px] text-brand-300 hover:text-brand-200"
                      >
                        {detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}
                      </button>

                      {detailsOpen && (
                        <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/60 p-2 text-[10px] text-gray-400 space-y-1">
                          <p><span className="text-gray-500">Intensidade:</span> {style.intensity}</p>
                          <p><span className="text-gray-500">Legenda:</span> {style.captionBehavior}</p>
                          <p><span className="text-gray-500">Movimento:</span> {style.motionBehavior}</p>
                          <p><span className="text-gray-500">Crop:</span> {style.cropBehavior}</p>
                          <p className="text-[9px] text-gray-500">{style.aiInstructions}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {visibleEditStyles.length === 0 && (
                <p className="text-xs text-gray-500">Nenhum estilo encontrado para esse filtro/busca.</p>
              )}

              <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2">
                <p className="text-[10px] font-bold text-brand-300">Selecionado: {selectedEditStyleMeta.name}</p>
                <p className="text-[10px] text-gray-500">Categoria: {selectedEditStyleMeta.category}</p>
              </div>
            </div>

            {lastAutoAnalysis && (
              <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-500/15 px-2 py-1 text-[10px] font-bold text-brand-300">AUTO INTELIGENTE</span>
                  <span className="text-[11px] text-gray-500">Preset recomendado: {lastAutoAnalysis.recommendedPreset || 'auto'}</span>
                  <span className="text-[11px] text-gray-500">Fallback: {lastAutoAnalysis.fallbackUsed ? 'sim' : 'não'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 md:grid-cols-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-2">Duração: {Math.round(lastAutoAnalysis.duration || 0)}s</div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-2">Resolução: {lastAutoAnalysis.resolution || '—'}</div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-2">FPS: {lastAutoAnalysis.fps || '—'}</div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-2">Áudio: {lastAutoAnalysis.hasAudio ? 'sim' : 'não'}</div>
                </div>
                {lastAutoAnalysis.recommendedClips?.length > 0 && (
                  <div className="space-y-2">
                    {lastAutoAnalysis.recommendedClips.slice(0, 3).map((clip, index) => (
                      <div key={`${clip.start}-${clip.end}-${index}`} className="rounded-xl border border-gray-800 bg-gray-900/60 p-2 text-[11px] text-gray-400">
                        <p className="font-semibold text-gray-200">Clip {index + 1}: {clip.start}s → {clip.end}s · score {clip.score}</p>
                        <p className="mt-1">{(clip.reasons || []).join(' • ')}</p>
                      </div>
                    ))}
                  </div>
                )}
                {lastGeneratedEditPlan && (
                  <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-[11px] text-gray-300">
                    <p className="font-semibold text-brand-300">Edit plan supervisionado</p>
                    <p className="mt-1">ID: {lastGeneratedEditPlan.id}</p>
                    <p className="mt-1">Preset aplicado: {lastGeneratedEditPlan.presetId || 'auto'}</p>
                    <p className="mt-1">Clips: {lastGeneratedEditPlan.clips?.length || 0} • Formato: {lastGeneratedEditPlan.format || clipFormat}</p>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <div className="grid gap-2 md:grid-cols-2">
              <button onClick={handleAnalyzeVideo} disabled={isSubmitDisabled || analyzingVideo || submitting}
                className={clsx('w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-all border',
                  isSubmitDisabled || analyzingVideo || submitting
                    ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-not-allowed'
                    : 'border-gray-700 bg-gray-950 text-gray-100 hover:border-brand-500/50')}>
                {analyzingVideo
                  ? <><Loader size={18} className="animate-spin" /> Analisando...</>
                  : <><BarChart2 size={18} /> Analisar Vídeo</>}
              </button>
              <button onClick={handleProcessVideo} disabled={isSubmitDisabled}
                className={clsx('w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-all',
                  isSubmitDisabled
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-brand-500 hover:bg-brand-600 text-white active:scale-[0.98] shadow-lg shadow-brand-500/20')}>
                {submitting
                  ? <><Loader size={18} className="animate-spin" /> Enviando...</>
                  : processingMode === 'finalize_approved'
                    ? <><Wand2 size={18} /> Finalizar este corte</>
                    : <><Wand2 size={18} /> Gerar Cortes</>}
              </button>
            </div>
            {isSubmitDisabled && submitDisabledReason && (
              <p className="text-[11px] text-gray-500 text-center leading-relaxed -mt-1">
                {submitDisabledReason}
              </p>
            )}
            {processingMode === 'finalize_approved' && (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Este modo não procura novos trechos. Ele apenas finaliza o corte escolhido com legenda, áudio, metadata e Telegram.
              </p>
            )}
              </>
            )}

            {/* Jobs */}
            {videoSquadTab === 'results' && jobs.length === 0 && (
              <p ref={resultsSectionRef} className="text-xs text-gray-500">Ainda não há resultados. Execute o SmartCut para ver os cortes aqui.</p>
            )}
            {(videoSquadTab === 'results' || videoSquadTab === 'smartcut') && jobs.length > 0 && (
              <div ref={resultsSectionRef} className="space-y-3">
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

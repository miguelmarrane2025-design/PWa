import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Music, Upload, CheckCircle, XCircle, Loader,
  Download, RefreshCw, Wifi, WifiOff, Sliders,
  Blend, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { audioApi } from '../services/api.js';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ── Constants ─────────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'default',        label: 'Default' },
  { id: 'ir-reverb',      label: 'IR Reverb' },
  { id: 'worship-clean',  label: 'Worship Clean' },
  { id: 'bethel-ambient', label: 'Bethel Ambient' },
  { id: 'hillsong',       label: 'Hillsong' },
  { id: 'lead',           label: 'Lead' },
];

const SAMPLE_RATES = [
  { id: '44k', label: '44.1 kHz', desc: 'Standard' },
  { id: '48k', label: '48 kHz',   desc: 'Video / DAW' },
  { id: '96k', label: '96 kHz',   desc: 'Hi-Res' },
];

const MIC_PROFILES = [
  { id: '',           label: 'None'           },
  { id: 'sm57_cap',   label: 'SM57 Cone'      },
  { id: 'sm57_edge',  label: 'SM57 Edge'      },
  { id: 'ribbon_cap', label: 'Ribbon'         },
  { id: 'condenser',  label: 'Condenser'      },
  { id: 'dual_sm57',  label: 'Dual SM57'      },
];

const PEDALEIRAS = [
  { id: 'generic',     label: 'Generic'      },
  { id: 'hx_stomp',   label: 'HX Stomp'     },
  { id: 'helix',       label: 'Helix'        },
  { id: 'quad_cortex', label: 'Quad Cortex'  },
  { id: 'kemper',      label: 'Kemper'       },
  { id: 'fractal',     label: 'Fractal'      },
];

const GUITARS = [
  { id: 'stratocaster', label: 'Stratocaster' },
  { id: 'telecaster', label: 'Telecaster' },
  { id: 'les_paul', label: 'Les Paul' },
  { id: 'semi_hollow', label: 'Semi-hollow' },
  { id: 'gretsch_duesenberg', label: 'Gretsch / Duesenberg' },
  { id: 'humbucker', label: 'Humbucker' },
  { id: 'single_coil', label: 'Single coil' },
  { id: 'p90', label: 'P90' },
];

const STYLES = [
  { id: 'worship', label: 'Worship' },
  { id: 'hillsong', label: 'Hillsong' },
  { id: 'bethel', label: 'Bethel' },
  { id: 'jesus_culture', label: 'Jesus Culture' },
  { id: 'morada', label: 'Morada' },
  { id: 'gospel', label: 'Gospel' },
  { id: 'ambient', label: 'Ambient' },
  { id: 'rock', label: 'Rock leve' },
  { id: 'lead', label: 'Lead emocional' },
  { id: 'mix_ready', label: 'Base rítmica' },
];

const MIC_CHOICES = [
  { id: 'sm57', label: 'SM57' }, { id: 'r121', label: 'R121' },
  { id: 'md421', label: 'MD421' }, { id: 'e906', label: 'e906' },
  { id: 'c414', label: 'C414' }, { id: 'u87', label: 'U87' },
  { id: 'sm7b', label: 'SM7B' }, { id: 'coles4038', label: 'Coles 4038' },
];

const IR_PRESETS = [
  { id: 'worship_balanced', label: 'Worship Balanced', ampA: 'Vox AC30', ampB: '', cab: '2x12 Blue', micA: 'sm57', micB: 'r121', blend: 55, position: 'cap_edge' },
  { id: 'vox_chime', label: 'Vox Chime', ampA: 'Vox AC30', ampB: '', cab: '2x12 Blue', micA: 'sm57', micB: 'c414', blend: 45, position: 'cap_edge' },
  { id: 'matchless_open', label: 'Matchless Open', ampA: 'Matchless DC30', ampB: '', cab: '2x12 Blue', micA: 'e906', micB: 'r121', blend: 40, position: 'cap_edge' },
  { id: 'live_safe', label: 'Live Safe', ampA: 'Vox AC30', ampB: '', cab: '2x12', micA: 'sm57', micB: 'md421', blend: 60, position: 'cap_edge' },
  { id: 'ambient_clean', label: 'Ambient Clean', ampA: 'Vox AC30', ampB: 'Matchless DC30', cab: '2x12 Blue', micA: 'r121', micB: 'c414', blend: 55, position: 'cone' },
  { id: 'lead_emotional', label: 'Lead Emotional', ampA: 'Vox AC30', ampB: 'Matchless DC30', cab: '2x12 Blue', micA: 'sm57', micB: 'u87', blend: 50, position: 'cap_edge' },
];

const STATUS_ICON = {
  pending:    <Loader size={15} className="animate-spin text-yellow-400" />,
  processing: <Loader size={15} className="animate-spin text-brand-400" />,
  done:       <CheckCircle size={15} className="text-green-400" />,
  error:      <XCircle size={15} className="text-red-400" />,
};

// ── EQ Slider ─────────────────────────────────────────────────────────────
function EQSlider({ label, value, min, max, step = 1, unit = 'dB', onChange, center = 0 }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={clsx(
          'text-xs font-mono font-semibold tabular-nums',
          value > center ? 'text-green-400' : value < center ? 'text-red-400' : 'text-gray-500',
        )}>
          {value > 0 ? '+' : ''}{value}{unit}
        </span>
      </div>
      <div className="relative h-1.5 bg-gray-700 rounded-full">
        {/* Center mark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-3 bg-gray-600 rounded-full" />
        {/* Fill */}
        <div
          className={clsx('absolute top-0 h-full rounded-full', value >= center ? 'bg-brand-500' : 'bg-red-500/70')}
          style={value >= center
            ? { left: '50%', width: `${(value - center) / (max - center) * 50}%` }
            : { left: `${50 - (center - value) / (center - min) * 50}%`, width: `${(center - value) / (center - min) * 50}%` }
          }
        />
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          style={{ WebkitAppearance: 'none' }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow border border-gray-300 pointer-events-none"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
    </div>
  );
}

// ── Blend ratio visualiser ─────────────────────────────────────────────────
function BlendBar({ ratioA }) {
  const pctA = Math.round(ratioA * 100);
  const pctB = 100 - pctA;
  return (
    <div className="flex rounded-xl overflow-hidden h-6 text-[11px] font-semibold">
      <div className="flex items-center justify-center bg-brand-500/70 transition-all" style={{ width: `${pctA}%` }}>
        {pctA >= 20 && `IR A ${pctA}%`}
      </div>
      <div className="flex items-center justify-center bg-orange-500/70 transition-all" style={{ width: `${pctB}%` }}>
        {pctB >= 20 && `IR B ${pctB}%`}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function AudioPage() {
  // Mode: 'process' | 'blend'
  const [mode,         setMode]         = useState('process');

  // Process mode
  const [preset,       setPreset]       = useState('default');
  const [sampleRate,   setSampleRate]   = useState('44k');
  const [mic,          setMic]          = useState('');
  const [guitar,       setGuitar]       = useState('stratocaster');
  const [style,        setStyle]        = useState('worship');
  const [micBlend,     setMicBlend]     = useState({
    micA: 'sm57',
    micB: 'r121',
    blend: 55,
    position: 'center',
    distance: 'close',
    body: 0,
    brightness: 0,
    presence: 0,
    harshControl: 0,
  });
  const [ampA, setAmpA] = useState('Vox AC30');
  const [ampB, setAmpB] = useState('');
  const [cabinet, setCabinet] = useState('2x12 Blue');
  const [blendPreset, setBlendPreset] = useState('worship_balanced');
  const [include96k, setInclude96k] = useState(false);
  const [pedaleira,    setPedaleira]    = useState('generic');
  const [showEQ,       setShowEQ]       = useState(false);
  const [eq,           setEQ]           = useState({ low: 0, mid: 0, midFreq: 2500, high: 0, highCut: 16000 });
  const [uploading,    setUploading]    = useState(false);

  // Blend mode
  const [fileA,        setFileA]        = useState(null);
  const [fileB,        setFileB]        = useState(null);
  const [ratioA,       setRatioA]       = useState(0.5);
  const [blendSR,      setBlendSR]      = useState('44k');
  const [blendPedal,   setBlendPedal]   = useState('generic');
  const [blending,     setBlending]     = useState(false);

  // Jobs
  const [jobs,         setJobs]         = useState([]);
  const [camillaOk,    setCamillaOk]    = useState(null);

  useEffect(() => {
    audioApi.getHealth().then(r => setCamillaOk(r.camilla)).catch(() => setCamillaOk(false));
    refreshJobs();
  }, []);

  useEffect(() => {
    const active = jobs.some(j => j.status === 'pending' || j.status === 'processing');
    if (!active) return;
    const t = setTimeout(refreshJobs, 3000);
    return () => clearTimeout(t);
  }, [jobs]);

  const refreshJobs = () => audioApi.getJobs().then(setJobs).catch(() => {});

  // Process drop
  const onDrop = useCallback(async accepted => {
    if (!accepted.length) return;
    setUploading(true);
    try {
      for (const file of accepted) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('config', preset);
        fd.append('sampleRate', sampleRate);
        if (mic)       fd.append('mic', mic);
        fd.append('guitar', guitar);
        fd.append('style', style);
        fd.append('micA', micBlend.micA);
        fd.append('micB', micBlend.micB);
        fd.append('micBlend', String(micBlend.blend));
        fd.append('micPosition', micBlend.position);
        fd.append('micDistance', micBlend.distance);
        fd.append('body', String(micBlend.body));
        fd.append('brightness', String(micBlend.brightness));
        fd.append('presence', String(micBlend.presence));
        fd.append('harshControl', String(micBlend.harshControl));
        fd.append('ampA', ampA);
        fd.append('ampB', ampB);
        fd.append('cabinet', cabinet);
        fd.append('blendPreset', blendPreset);
        fd.append('include96k', String(include96k));
        fd.append('pedaleira', pedaleira);
        if (showEQ) {
          fd.append('eq_low',      eq.low);
          fd.append('eq_mid',      eq.mid);
          fd.append('eq_mid_freq', eq.midFreq);
          fd.append('eq_high',     eq.high);
          fd.append('eq_high_cut', eq.highCut);
        }
        const result = await audioApi.processAudioRaw(fd);
        toast.success(`✅ ${file.name} processed`);
        refreshJobs();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }, [preset, sampleRate, mic, pedaleira, guitar, style, micBlend, ampA, ampB, cabinet, blendPreset, include96k, eq, showEQ]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/*': ['.wav', '.mp3', '.flac', '.ogg', '.aac', '.m4a'] },
    multiple: true,
    disabled: uploading,
  });

  // Blend submit
  const handleBlend = async () => {
    if (!fileA || !fileB) { toast.error('Select both IR files'); return; }
    setBlending(true);
    try {
      const fd = new FormData();
      fd.append('ir_a', fileA);
      fd.append('ir_b', fileB);
      fd.append('ratio_a', ratioA.toFixed(2));
      fd.append('ratio_b', (1 - ratioA).toFixed(2));
      fd.append('sampleRate', blendSR);
      fd.append('pedaleira',  blendPedal);
      await audioApi.blendIRs(fd);
      toast.success('✅ Blend complete');
      refreshJobs();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBlending(false);
    }
  };

  const handleDownload = async job => {
    try { await audioApi.downloadJob(job.id, job.downloadName || job.fileName || 'botsquad-ir.wav'); }
    catch (err) { toast.error(err.message); }
  };

  const updateMicBlend = patch => setMicBlend(prev => ({ ...prev, ...patch }));
  const predictedName = `${ampA}${ampB ? ` + ${ampB} Blend` : ''}`;

  return (
    <div className="px-4 py-4 space-y-5 pb-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Music size={20} className="text-brand-400" /> Audio
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">DSP pipeline + IR processor</p>
        </div>
        <div className={clsx(
          'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl shrink-0',
          camillaOk === true  ? 'bg-green-500/20 text-green-400' :
          camillaOk === false ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-800 text-gray-500',
        )}>
          {camillaOk ? <Wifi size={11} /> : <WifiOff size={11} />}
          {camillaOk === true ? 'CamillaDSP' : camillaOk === false ? 'IR Fallback' : '…'}
        </div>
      </div>

      {/* Mode switcher */}
      <div className="flex rounded-xl overflow-hidden border border-gray-700">
        {[
          { id: 'process', icon: Sliders, label: 'Process' },
          { id: 'blend',   icon: Blend,  label: 'Blend IR A+B' },
        ].map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setMode(id)}
            className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors',
              mode === id ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400')}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── PROCESS MODE ─────────────────────────────────────────────────── */}
      {mode === 'process' && (<>

        {/* Preset + sample rate */}
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preset</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={clsx('py-2 rounded-xl border text-xs font-medium transition-colors',
                  preset === p.id ? 'bg-brand-500/20 border-brand-500 text-brand-300' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                {p.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Sample Rate</p>
          <div className="flex gap-2">
            {SAMPLE_RATES.map(s => (
              <button key={s.id} onClick={() => setSampleRate(s.id)}
                className={clsx('flex-1 py-2 rounded-xl border text-center transition-colors',
                  sampleRate === s.id ? 'bg-brand-500/20 border-brand-500 text-brand-300' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                <p className="text-xs font-semibold">{s.label}</p>
                <p className="text-[10px] text-gray-600">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Mic + Pedaleira */}
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Amp / Cab / IR</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={ampA} onChange={e => setAmpA(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200"
              placeholder="Amp A" />
            <input value={ampB} onChange={e => setAmpB(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200"
              placeholder="Amp B opcional" />
          </div>
          <input value={cabinet} onChange={e => setCabinet(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200"
            placeholder="Cabinet" />
          <div className="flex gap-2 flex-wrap">
            {IR_PRESETS.map(p => (
              <button key={p.id} onClick={() => {
                setBlendPreset(p.id);
                setAmpA(p.ampA); setAmpB(p.ampB); setCabinet(p.cab);
                updateMicBlend({ micA: p.micA, micB: p.micB, blend: p.blend, position: p.position });
              }}
                className={clsx('px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                  blendPreset === p.id ? 'bg-brand-500/20 border-brand-500 text-brand-300' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-xs font-semibold text-gray-300">{predictedName}</p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Gerar: 44.1k WAV · 48k WAV{include96k ? ' · 96k WAV' : ''}
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" checked={include96k} onChange={e => setInclude96k(e.target.checked)}
                className="accent-brand-500" />
              Exportar 96k opcional
            </label>
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Guitarra</p>
          <div className="flex gap-2 flex-wrap">
            {GUITARS.map(g => (
              <button key={g.id} onClick={() => setGuitar(g.id)}
                className={clsx('px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                  guitar === g.id ? 'bg-brand-500/20 border-brand-500 text-brand-300' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                {g.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Estilo</p>
          <div className="flex gap-2 flex-wrap">
            {STYLES.map(s => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                className={clsx('px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                  style === s.id ? 'bg-green-500/20 border-green-500 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                {s.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Blend de microfones</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Mic A</p>
              <select value={micBlend.micA} onChange={e => updateMicBlend({ micA: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200">
                {MIC_CHOICES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Mic B</p>
              <select value={micBlend.micB} onChange={e => updateMicBlend({ micB: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200">
                {MIC_CHOICES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <EQSlider label="Blend A" value={micBlend.blend} min={0} max={100} unit="%" center={50}
            onChange={v => updateMicBlend({ blend: v })} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Position</p>
              <select value={micBlend.position} onChange={e => updateMicBlend({ position: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200">
                <option value="cap_center">Centro do falante</option>
                <option value="cap_edge">Borda da calota</option>
                <option value="cone">Cone</option>
                <option value="edge">Borda do falante</option>
                <option value="off_axis">Off-axis</option>
                <option value="room_close">Room curto</option>
                <option value="room_far">Room distante</option>
              </select>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Distance</p>
              <select value={micBlend.distance} onChange={e => updateMicBlend({ distance: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200">
                <option value="close">close</option>
                <option value="mid">mid</option>
                <option value="far">far</option>
              </select>
            </div>
          </div>
          <div className="space-y-3">
            <EQSlider label="Body" value={micBlend.body} min={-6} max={6} onChange={v => updateMicBlend({ body: v })} />
            <EQSlider label="Brightness" value={micBlend.brightness} min={-6} max={6} onChange={v => updateMicBlend({ brightness: v })} />
            <EQSlider label="Presence" value={micBlend.presence} min={-6} max={6} onChange={v => updateMicBlend({ presence: v })} />
            <EQSlider label="Harsh control" value={micBlend.harshControl} min={0} max={6} onChange={v => updateMicBlend({ harshControl: v })} center={0} />
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Mic Profile legado</p>
          <div className="flex gap-2 flex-wrap">
            {MIC_PROFILES.map(m => (
              <button key={m.id} onClick={() => setMic(m.id)}
                className={clsx('px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                  mic === m.id ? 'bg-brand-500/20 border-brand-500 text-brand-300' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                {m.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Pedaleira</p>
          <div className="flex gap-2 flex-wrap">
            {PEDALEIRAS.map(p => (
              <button key={p.id} onClick={() => setPedaleira(p.id)}
                className={clsx('px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                  pedaleira === p.id ? 'bg-orange-500/20 border-orange-500 text-orange-200' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Manual EQ */}
        <div className="card">
          <button
            onClick={() => setShowEQ(v => !v)}
            className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-brand-400" />
              <span className="text-sm font-semibold text-gray-200">Manual EQ</span>
              {(eq.low !== 0 || eq.mid !== 0 || eq.high !== 0) && (
                <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">Active</span>
              )}
            </div>
            {showEQ ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
          </button>

          {showEQ && (
            <div className="mt-4 space-y-4">
              <EQSlider label="Low Shelf"    value={eq.low}     min={-12} max={12} onChange={v => setEQ(e => ({ ...e, low: v }))} />
              <EQSlider label="Mid Gain"     value={eq.mid}     min={-12} max={12} onChange={v => setEQ(e => ({ ...e, mid: v }))} />
              <EQSlider label="Mid Freq"     value={eq.midFreq} min={200} max={8000} step={100} unit=" Hz" onChange={v => setEQ(e => ({ ...e, midFreq: v }))} center={200} />
              <EQSlider label="High Shelf"   value={eq.high}    min={-12} max={12} onChange={v => setEQ(e => ({ ...e, high: v }))} />
              <EQSlider label="High Cut"     value={eq.highCut} min={4000} max={20000} step={500} unit=" Hz" onChange={v => setEQ(e => ({ ...e, highCut: v }))} center={4000} />

              <button
                onClick={() => setEQ({ low: 0, mid: 0, midFreq: 2500, high: 0, highCut: 16000 })}
                className="btn-ghost text-xs py-1.5 px-3 w-full justify-center">
                Reset EQ
              </button>
            </div>
          )}
        </div>

        {/* Drop zone */}
        <div {...getRootProps()} className={clsx(
          'border-2 border-dashed rounded-2xl p-7 text-center transition-all cursor-pointer',
          isDragActive ? 'border-brand-400 bg-brand-500/10 scale-[1.01]' : 'border-gray-700 bg-gray-900 active:border-brand-500',
          uploading && 'pointer-events-none opacity-70',
        )}>
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-brand-400">
              <Loader size={26} className="animate-spin" />
              <p className="text-sm font-medium">Processing…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <Upload size={24} className={isDragActive ? 'text-brand-400' : ''} />
              <p className="text-sm font-medium text-gray-300">
                {isDragActive ? 'Drop to process' : 'Tap to select audio'}
              </p>
              <p className="text-xs">WAV · MP3 · FLAC · OGG · AAC · M4A</p>
              <p className="text-[11px] text-gray-600 mt-1">
                {preset} · {SAMPLE_RATES.find(s => s.id === sampleRate)?.label}
                {mic ? ` · ${MIC_PROFILES.find(m => m.id === mic)?.label}` : ''}
              </p>
            </div>
          )}
        </div>
      </>)}

      {/* ── BLEND MODE ───────────────────────────────────────────────────── */}
      {mode === 'blend' && (
        <div className="card space-y-5">
          <p className="text-sm font-semibold text-gray-200">Blend two IR files</p>

          {/* IR A */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-brand-500/30 text-brand-300 flex items-center justify-center text-[10px] font-bold">A</span>
              IR File A
            </p>
            <label className={clsx(
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
              fileA ? 'border-brand-500/50 bg-brand-500/10' : 'border-gray-700 bg-gray-800',
            )}>
              <input type="file" accept=".wav,.flac,.mp3" className="hidden"
                onChange={e => setFileA(e.target.files?.[0] || null)} />
              {fileA
                ? <><CheckCircle size={16} className="text-brand-400 shrink-0" /><span className="text-sm text-gray-200 truncate">{fileA.name}</span></>
                : <><Upload size={16} className="text-gray-500" /><span className="text-sm text-gray-500">Select IR A</span></>
              }
              {fileA && <button onClick={e => { e.preventDefault(); setFileA(null); }} className="ml-auto text-gray-600"><X size={14} /></button>}
            </label>
          </div>

          {/* IR B */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-orange-500/30 text-orange-200 flex items-center justify-center text-[10px] font-bold">B</span>
              IR File B
            </p>
            <label className={clsx(
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
              fileB ? 'border-orange-500/50 bg-orange-500/10' : 'border-gray-700 bg-gray-800',
            )}>
              <input type="file" accept=".wav,.flac,.mp3" className="hidden"
                onChange={e => setFileB(e.target.files?.[0] || null)} />
              {fileB
                ? <><CheckCircle size={16} className="text-orange-300 shrink-0" /><span className="text-sm text-gray-200 truncate">{fileB.name}</span></>
                : <><Upload size={16} className="text-gray-500" /><span className="text-sm text-gray-500">Select IR B</span></>
              }
              {fileB && <button onClick={e => { e.preventDefault(); setFileB(null); }} className="ml-auto text-gray-600"><X size={14} /></button>}
            </label>
          </div>

          {/* Blend ratio */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-gray-400">Blend Ratio</span>
              <span className="text-xs text-gray-500 font-mono">A {Math.round(ratioA*100)}% / B {Math.round((1-ratioA)*100)}%</span>
            </div>
            <BlendBar ratioA={ratioA} />
            <input type="range" min="0" max="1" step="0.05" value={ratioA}
              onChange={e => setRatioA(parseFloat(e.target.value))}
              className="w-full accent-brand-500" />
          </div>

          {/* Sample rate + pedaleira */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Sample Rate</p>
              <div className="space-y-1">
                {SAMPLE_RATES.map(s => (
                  <button key={s.id} onClick={() => setBlendSR(s.id)}
                    className={clsx('w-full py-1.5 rounded-xl border text-xs font-medium transition-colors',
                      blendSR === s.id ? 'bg-brand-500/20 border-brand-500 text-brand-300' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Pedaleira</p>
              <div className="space-y-1">
                {PEDALEIRAS.slice(0, 3).map(p => (
                  <button key={p.id} onClick={() => setBlendPedal(p.id)}
                    className={clsx('w-full py-1.5 rounded-xl border text-xs font-medium transition-colors',
                      blendPedal === p.id ? 'bg-orange-500/20 border-orange-500 text-orange-200' : 'bg-gray-800 border-gray-700 text-gray-400')}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button onClick={handleBlend} disabled={blending || !fileA || !fileB}
            className="btn-primary w-full justify-center py-3">
            {blending
              ? <><Loader size={16} className="animate-spin" /> Blending…</>
              : '⚡ Blend & Export'
            }
          </button>
        </div>
      )}

      {/* ── JOBS ──────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Jobs</h2>
          <button onClick={refreshJobs} className="btn-ghost text-xs py-1.5 px-2.5">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {jobs.length === 0 && <p className="text-gray-600 text-sm py-4 text-center">No jobs yet</p>}

        {jobs.map(job => {
          const title = job.displayName || job.fileName || job.preset || job.config_name || 'Default · Generic · 48k';
          const meta = [job.preset || job.config_name, job.config?.device || job.config?.style, job.status]
            .filter(Boolean)
            .join(' · ');

          return (
            <div key={job.id} className="card flex items-center gap-3">
              <div className="shrink-0">{STATUS_ICON[job.status] ?? STATUS_ICON.pending}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{title}</p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">{meta}</p>
                {job.error && <p className="text-xs text-red-400 mt-0.5 truncate">{job.error}</p>}
              </div>
              <span className={clsx('text-[11px] px-2 py-0.5 rounded-full shrink-0 font-medium',
                job.status === 'done'      ? 'bg-green-500/20 text-green-400' :
                job.status === 'error'     ? 'bg-red-500/20 text-red-400' :
                                             'bg-yellow-500/20 text-yellow-400',
              )}>{job.status}</span>
              {job.status === 'done' && (
                <button onClick={() => handleDownload(job)}
                  className="btn-primary text-xs px-3 py-1.5 shrink-0">
                  <Download size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

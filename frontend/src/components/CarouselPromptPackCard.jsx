import React, { useRef, useState } from 'react';
import { Copy, Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { carouselApi } from '../services/api.js';

export default function CarouselPromptPackCard({ pack, resolveAssetUrl, filenameFromUrl }) {
  const [slides, setSlides] = useState(Array.isArray(pack.slides) ? pack.slides : []);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(pack.status);
  const [rendered, setRendered] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const updateSlide = (index, patch) => {
    setSlides(current => current.map(slide => slide.index === index ? { ...slide, ...patch } : slide));
  };

  const copyText = async text => {
    await navigator.clipboard.writeText(text);
    toast.success('Prompt copiado');
  };

  const copyAll = async () => {
    const text = slides.map(slide => [
      `Slide ${String(slide.index).padStart(2, '0')}`,
      `Headline: ${slide.headline}`,
      `Texto: ${slide.body}`,
      `Prompt de imagem: ${slide.imagePrompt}`,
      `Negative prompt: ${slide.negativePrompt}`,
      `Composicao: ${slide.composition}`,
      slide.visual_purpose ? `Proposito visual: ${slide.visual_purpose}` : null,
      slide.notes ? `Notas: ${slide.notes}` : null,
    ].filter(Boolean).join('\n')).join('\n\n');
    await copyText(text);
  };

  const handleUpload = async event => {
    const nextFiles = Array.from(event.target.files || []).slice(0, 6);
    setSelectedFiles(nextFiles);
    if (nextFiles.length !== 6) {
      toast.error('Selecione exatamente 6 imagens');
      return;
    }

    setBusy(true);
    try {
      const response = await carouselApi.uploadImages(pack.planId, nextFiles);
      setUploadStatus(response.status);
      toast.success('6 imagens recebidas');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const finalizeWithImages = async () => {
    setBusy(true);
    try {
      const response = await carouselApi.finalize(pack.planId);
      setRendered(response);
      setUploadStatus(response.status);
      toast.success('Carrossel finalizado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const finalizeHtmlSvg = async () => {
    setBusy(true);
    try {
      const response = await carouselApi.render({ planId: pack.planId });
      setRendered(response);
      toast.success('Fallback HTML/SVG gerado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-100">Prompts das imagens do carrossel</h3>
          <p className="text-xs text-gray-400 mt-0.5">Gere as imagens fora do app usando estes prompts. Depois envie as 6 imagens para eu finalizar o carrossel.</p>
        </div>
        <button type="button" onClick={copyAll}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/70 px-2.5 py-1.5 text-xs font-semibold text-gray-200 active:bg-gray-700">
          <Copy size={13} />
          Copiar todos
        </button>
      </div>

      <div className="space-y-2">
        {slides.map(slide => (
          <div key={slide.index} className="rounded-xl border border-gray-700 bg-gray-950/45 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-brand-300">Slide {String(slide.index).padStart(2, '0')}</p>
              <button type="button" onClick={() => copyText(slide.imagePrompt)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2 py-1 text-[11px] font-bold text-gray-300 active:bg-gray-800">
                <Copy size={11} />
                Copiar prompt
              </button>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-2 py-1.5">
              <p className="text-[11px] uppercase tracking-normal text-gray-500 font-bold">Headline</p>
              <p className="text-xs font-black text-gray-100 mt-0.5">{slide.headline}</p>
              <p className="text-[11px] uppercase tracking-normal text-gray-500 font-bold mt-2">Texto</p>
              <p className="text-xs text-gray-400 mt-0.5">{slide.body}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-normal text-gray-500 font-bold">Prompt de imagem</p>
              <textarea value={slide.imagePrompt}
                onChange={event => updateSlide(slide.index, { imagePrompt: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-100 resize-none"
                rows={3} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-normal text-gray-500 font-bold">Negative prompt</p>
              <textarea value={slide.negativePrompt}
                onChange={event => updateSlide(slide.index, { negativePrompt: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-100 resize-none"
                rows={2} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-normal text-gray-500 font-bold">Composicao</p>
              <p className="text-xs text-gray-400 mt-0.5">{slide.composition}</p>
            </div>
            {slide.visual_purpose && (
              <div>
                <p className="text-[11px] uppercase tracking-normal text-gray-500 font-bold">Proposito visual</p>
                <p className="text-xs text-gray-400 mt-0.5">{slide.visual_purpose}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs font-semibold text-gray-200 disabled:opacity-50 active:bg-gray-700">
          <Upload size={13} />
          Enviar imagens
        </button>
        <button type="button" onClick={finalizeWithImages} disabled={busy || uploadStatus !== 'CAROUSEL_IMAGES_RECEIVED'}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
          Finalizar carrossel com imagens enviadas
        </button>
        <button type="button" onClick={finalizeHtmlSvg} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs font-semibold text-gray-300 disabled:opacity-50 active:bg-gray-700">
          Finalizar com HTML/SVG mesmo assim
        </button>
        <span className="self-center text-xs text-gray-500">{selectedFiles.length ? `${selectedFiles.length}/6 imagens selecionadas` : pack.nextStep}</span>
      </div>

      {rendered?.files?.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {rendered.files.map((file, index) => (
              <img key={file} src={resolveAssetUrl(file)} alt={`Slide final ${index + 1}`}
                className="rounded-xl w-full border border-gray-700 bg-gray-900" />
            ))}
          </div>
          <div className="flex gap-2">
            {rendered.downloadUrl && <DownloadButton url={rendered.downloadUrl} label="Download" resolveAssetUrl={resolveAssetUrl} filenameFromUrl={filenameFromUrl} />}
            {rendered.zipUrl && <DownloadButton url={rendered.zipUrl} label="Download ZIP" resolveAssetUrl={resolveAssetUrl} filenameFromUrl={filenameFromUrl} />}
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadButton({ url, label, resolveAssetUrl, filenameFromUrl }) {
  const handleDownload = async () => {
    const resolved = resolveAssetUrl(url);
    if (!resolved) return;
    try {
      const response = await fetch(resolved);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filenameFromUrl(resolved);
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <button type="button" onClick={handleDownload}
      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/70 px-3 py-1.5 text-xs font-semibold text-gray-200 active:bg-gray-700">
      <Download size={13} />
      {label}
    </button>
  );
}

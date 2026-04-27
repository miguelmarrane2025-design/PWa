// video/sourceDetector.js
// Detecta a fonte de um vídeo a partir de URL e decide como importar.

export function detectVideoSource(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  const u = url.toLowerCase().trim();

  if (u.includes('drive.google.com') || u.includes('docs.google.com/file')) return 'google_drive';
  if (u.includes('dropbox.com'))        return 'dropbox';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com'))         return 'tiktok';
  if (/\.(mp4|mov|mkv|webm|avi|m4v|3gp)(\?|$)/.test(u)) return 'direct_file';

  return 'unknown';
}

/**
 * Converte URL para formato diretamente baixável.
 */
export function normalizeUrl(url, source) {
  switch (source) {
    case 'google_drive': {
      // https://drive.google.com/file/d/FILE_ID/view → https://drive.google.com/uc?export=download&id=FILE_ID
      const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
      // Already a uc?export link
      if (url.includes('uc?export=download')) return url;
      return url;
    }
    case 'dropbox': {
      // dl=0 → dl=1
      return url.replace(/dl=0/, 'dl=1').replace(/\?dl=0/, '?dl=1');
    }
    default:
      return url;
  }
}

/**
 * Mensagem amigável para fontes que requerem upload manual.
 */
export function getManualUploadMessage(source) {
  const base = {
    ok: false,
    source,
    requiresManualFile: true,
    alternatives: [
      'Enviar arquivo diretamente (até 100MB)',
      'Upload em partes (chunk upload) para arquivos grandes',
      'Google Drive (link público/baixável)',
      'Dropbox (link direto dl=1)',
      'Link direto MP4/MOV autorizado',
    ],
  };

  if (source === 'youtube') {
    return {
      ...base,
      message: 'YouTube requer conteúdo próprio/autorizado. Faça o download do seu vídeo e envie aqui, ou use Google Drive, Dropbox ou link direto.',
    };
  }
  if (source === 'tiktok') {
    return {
      ...base,
      message: 'TikTok requer conteúdo próprio/autorizado. Envie o arquivo original, use Google Drive, Dropbox ou link direto MP4.',
    };
  }
  return {
    ...base,
    message: 'Fonte desconhecida. Use upload direto, Google Drive, Dropbox ou link MP4 público.',
  };
}

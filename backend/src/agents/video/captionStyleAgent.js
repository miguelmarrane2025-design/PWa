// agents/video/captionStyleAgent.js
// Define e descreve estilos de legenda para cortes de vídeo.
// Provider: OpenAI via chatFast. Nunca Anthropic/Gemini.

import { chatFast } from '../../lib/llm.js';
import { logger } from '../../lib/logger.js';

const CAPTION_STYLES = {
  classic:  { name: 'Classic',  desc: 'Texto branco com sombra preta. Fonte: Impact ou Arial Bold. Legível em qualquer fundo.', color: '#FFFFFF', shadow: true,  position: 'bottom', animation: 'none' },
  fire:     { name: '🔥 Fire',   desc: 'Texto amarelo/laranja vibrante com borda preta. Fonte: Impact. Alta energia.', color: '#FF6B00', shadow: true,  position: 'center', animation: 'pop' },
  neon:     { name: '⚡ Neon',   desc: 'Texto branco com brilho neon colorido (ciano ou verde). Estilo cyberpunk/gaming.', color: '#00FFFF', shadow: false, position: 'bottom', animation: 'glow' },
  gospel:   { name: '✝️ Gospel', desc: 'Texto dourado com fundo translúcido escuro. Fonte elegante. Ideal para conteúdo cristão/worship.', color: '#FFD700', shadow: true,  position: 'bottom', animation: 'fade' },
  contrast: { name: '◼ Contrast',desc: 'Texto preto em caixa branca sólida. Máximo contraste. Melhor acessibilidade.', color: '#000000', shadow: false, position: 'bottom', animation: 'none', background: '#FFFFFF' },
};

export async function captionStyleAgent({ captionStyle = 'classic', platform = 'instagram', userId = null }) {
  logger.info(`[CaptionStyleAgent] style=${captionStyle} platform=${platform}`);

  const style = CAPTION_STYLES[captionStyle] || CAPTION_STYLES.classic;

  // Position note by platform
  const positionNote = {
    tiktok:    'No TikTok, evite a região inferior (interface) e superior (câmera). Use a faixa central.',
    reels:     'No Reels, posicione na faixa inferior-central. Evite os 20% inferiores (botões).',
    shorts:    'No Shorts, centro-inferior. Evite o terço inferior (interface do YouTube).',
    youtube:   'No YouTube horizontal, parte inferior-central. Fonte maior para TV.',
    instagram: 'No Instagram, inferior-central. Fonte menor que TikTok/Reels.',
  }[platform] || 'Posição: inferior-central.';

  const content = [
    `## 🎬 Estilo de Legenda: ${style.name}`,
    '',
    `**Descrição:** ${style.desc}`,
    `**Cor principal:** ${style.color}`,
    `**Sombra:** ${style.shadow ? 'Sim' : 'Não'}`,
    `**Posição padrão:** ${style.position}`,
    `**Animação:** ${style.animation}`,
    style.background ? `**Fundo:** ${style.background}` : '',
    '',
    `**📱 ${platform.charAt(0).toUpperCase() + platform.slice(1)}:**`,
    positionNote,
    '',
    `**Estilos disponíveis:**`,
    Object.entries(CAPTION_STYLES).map(([k, s]) => `• \`${k}\` — ${s.name}: ${s.desc}`).join('\n'),
    '',
    `> 💡 O estilo é aplicado automaticamente no pipeline de renderização. Altere em *Configurações de Legenda* na aba Vídeo.`,
  ].filter(Boolean).join('\n');

  return {
    content,
    metadata: { agent: 'caption_style_agent', style: captionStyle, styleConfig: style, platform },
  };
}

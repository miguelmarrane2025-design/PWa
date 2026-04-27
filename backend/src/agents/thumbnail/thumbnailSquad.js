// agents/thumbnail/thumbnailSquad.js
// ThumbnailStrategist → ThumbnailPromptDirector → ThumbnailReview.
// Provider: OpenAI. Nunca Anthropic.

import { chat, chatFast } from '../../lib/llm.js';
import { runWithReview, makeReviewer } from '../../core/runWithReview.js';
import { logger } from '../../lib/logger.js';

// ── ThumbnailStrategistAgent ──────────────────────────────────────────────────
async function thumbnailStrategistAgent({ videoTitle, niche, channel, userId }) {
  logger.info(`[ThumbnailStrategist] title=${videoTitle}`);

  const prompt = `Você é um especialista em thumbnails de YouTube com foco em CTR.
Defina a estratégia visual ANTES de criar o design.

TÍTULO DO VÍDEO: ${videoTitle}
NICHO: ${niche || 'geral'}
CANAL: ${channel || 'não informado'}

Retorne JSON:
{
  "visualPromise": "promessa visual principal (o que o espectador espera ao clicar)",
  "emotionalHook": "emoção principal que a thumb deve transmitir",
  "mainElement": "elemento visual central (pessoa/objeto/texto/combinação)",
  "textOverlay": "texto sobreposto (máx 5 palavras, se necessário)",
  "colorScheme": "esquema de cores (ex: preto/amarelo, azul/branco)",
  "contrast": "alto/médio - para legibilidade em miniatura",
  "faceRecommended": true,
  "facialExpression": "expressão ideal (surpresa/confiante/provocativa)",
  "backgroundType": "sólido/desfocado/cenário específico",
  "competition": "como se diferenciar de outras thumbs do nicho",
  "abTest": "variação A/B sugerida"
}`;

  const raw = await chatFast([{ role: 'user', content: prompt }], { userId, max_tokens: 800 });
  try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
  catch { return null; }
}

// ── ThumbnailPromptDirectorAgent ──────────────────────────────────────────────
async function thumbnailPromptDirectorAgent({ videoTitle, strategy, userId }) {
  const prompt = `Você é um diretor de arte para thumbnails de YouTube (1280x720).
Crie o prompt de imagem para esta thumbnail.

TÍTULO: ${videoTitle}
ESTRATÉGIA: ${JSON.stringify(strategy)}

Retorne JSON:
{
  "image_prompt": "prompt de imagem realista e editorial em inglês, detalhado",
  "negative_prompt": "o que evitar na imagem",
  "layout": "descrição do layout: posição do texto, elementos visuais",
  "text_overlay": { "main": "texto principal", "sub": "subtexto se houver" },
  "color_palette": ["#cor1", "#cor2"],
  "html_preview": "<div style='background:#000;color:#fff;font-size:48px;padding:20px;width:1280px;height:720px;display:flex;align-items:center;justify-content:center;font-family:Impact'>${strategy?.textOverlay || videoTitle.toUpperCase()}</div>",
  "notes": "observações de implementação"
}`;

  const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 1200 });
  try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
  catch { return null; }
}

// ── ThumbnailReviewAgent ──────────────────────────────────────────────────────
const THUMB_REVIEW_SYSTEM = `Você é um especialista em CTR de thumbnails de YouTube.
Avalie com score 0-100:
- Clareza em 1 segundo em miniatura? (0-15)
- Legibilidade no celular? (0-15)
- Contraste adequado? (0-10)
- Emoção/curiosidade transmitida? (0-15)
- Hierarquia visual clara? (0-10)
- Promessa visual alinhada ao vídeo? (0-15)
- Texto conciso (máx 5 palavras)? (0-10)
- Parece template genérico? (0-10 - pontua alto se NÃO parecer)
Score mínimo: 85. Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const thumbnailReviewer = makeReviewer({ systemPrompt: THUMB_REVIEW_SYSTEM, minScore: 85 });

// ── Fluxo principal ───────────────────────────────────────────────────────────
export async function runThumbnailFlow({ videoTitle, niche, channel, userId }) {
  logger.info(`[ThumbnailSquad] start title=${videoTitle}`);

  const strategy = await thumbnailStrategistAgent({ videoTitle, niche, channel, userId });

  const result = await runWithReview({
    specialist: async () => {
      const design = await thumbnailPromptDirectorAgent({ videoTitle, strategy, userId });
      return { content: design, raw: JSON.stringify(design) };
    },
    reviewer: thumbnailReviewer,
    refiner: async (input, draft, notes) => {
      const draftStr = JSON.stringify(draft?.content ?? draft ?? '');
      const prompt = `Melhore este design de thumbnail com base nas críticas.\n\nTÍTULO: ${videoTitle}\nDESIGN ATUAL: ${draftStr.slice(0,1200)}\nCRÍTICAS: ${notes.join('\n')}\n\nRetorne JSON melhorado no mesmo formato.`;
      const raw = await chat([{ role: 'user', content: prompt }], { userId, max_tokens: 1200 });
      try { const m = raw.match(/\{[\s\S]*\}/); return m ? { content: JSON.parse(m[0]), raw } : draft; }
      catch { return draft; }
    },
    input: { videoTitle, strategy },
    minScore: 85, maxAttempts: 2, memoryKey: 'thumbnail', userId,
  });

  const design = result.output?.content ?? result.output;

  const lines = [
    `🖼️ **Thumbnail: "${videoTitle}"**`,
    `*(score: ${result.qualityScore}/100)*`,
    ``,
    strategy ? [
      `**Promessa visual:** ${strategy.visualPromise || ''}`,
      `**Emoção:** ${strategy.emotionalHook || ''}`,
      `**Texto sugerido:** ${strategy.textOverlay || ''}`,
      `**Esquema de cores:** ${strategy.colorScheme || ''}`,
    ].filter(Boolean).join('\n') : '',
    ``,
    design?.image_prompt ? `**🖼️ Prompt de imagem:**\n\`\`\`\n${design.image_prompt}\n\`\`\`` : '',
    design?.negative_prompt ? `**🚫 Negative:** ${design.negative_prompt}` : '',
    design?.layout ? `**📐 Layout:** ${design.layout}` : '',
    design?.notes ? `💡 ${design.notes}` : '',
    ``,
    strategy?.abTest ? `**Variação A/B:** ${strategy.abTest}` : '',
    ``,
    result.approved ? `✅ *Aprovada pelo revisor*` : `⚠️ *Score ${result.qualityScore}/100 — ${result.reviewNotes.slice(0,2).join('; ')}*`,
  ].filter(Boolean).join('\n');

  return { content: lines, agent: 'thumbnail-squad', metadata: { strategy, design, ...result } };
}

export default { runThumbnailFlow };

// agents/video/videoCuttingSquad.js
// Cortes de vídeo estilo OpusClip: melhores momentos, shorts, legendas, download.
// Provider: OpenAI via llm.js. FFmpeg via videoAgent existente.

import { chat, chatFast }          from '../../lib/llm.js';
import { runWithReview, makeReviewer, makeSpecialist } from '../../core/runWithReview.js';
import { agentMemoryService }      from '../../memory/agentMemoryService.js';
import { logger }                  from '../../lib/logger.js';

const REVIEWER_SYSTEM = `Você é o VideoCuttingReviewAgent.
Avalie planos de corte de vídeo.

Score 0-100. Critérios: gancho forte (primeiros 3s), retenção no clip, corte faz sentido sozinho, sem pausa morta, título coerente, CTA ou loop, enquadramento vertical mencionado.

NÃO aprovar se outputs estiver vazio.

Retorne APENAS JSON: {"score":0,"notes":[],"passed":false}`;

const SPECIALIST_SYSTEM = `Você é o VideoCuttingSquad do BotSquad.
Analise descrições de vídeo e gere planos de corte profissionais estilo OpusClip.

Para cada pedido entregue:
- Análise do vídeo (duração, tipo, conteúdo esperado)
- Plano de cortes: 3-8 clips de 30-90 segundos cada
  - clip_id, título, start (em segundos), end, duração, score, razão do corte
  - estratégia de gancho (primeiros 3 segundos de cada clip)
  - CTA/loop sugerido para o final
- Estilo de legenda (fonte, cor, posição)
- Metadados por clip: título YouTube/TikTok, descrição, hashtags
- Recomendações de edição vertical 1080x1920

Se tiver transcrição disponível, identifique os melhores momentos semanticamente.

Responda na língua do usuário.`;

// ── Clip Plan Generator ───────────────────────────────────────────────────────
export async function clipPlannerAgent({ message, transcription, duration, userId }) {
  logger.info(`[ClipPlanner] userId=${userId} duration=${duration}`);

  const userMsg = `PEDIDO: ${message}
DURAÇÃO DO VÍDEO: ${duration ? `${duration}s (${Math.floor(duration/60)}min)` : 'desconhecida'}
${transcription ? `TRANSCRIÇÃO:\n${transcription.slice(0, 3000)}` : 'Sem transcrição disponível — analise pelo contexto do pedido.'}

Gere o plano de cortes completo.`;

  const raw = await chat(
    [{ role: 'system', content: SPECIALIST_SYSTEM }, { role: 'user', content: userMsg }],
    { userId, max_tokens: 3000 }
  );
  return { content: raw };
}

// ── Main Flow ─────────────────────────────────────────────────────────────────
export async function runVideoCuttingFlow({ message, context = [], files = [], userId, briefing = {}, transcription = null, duration = null }) {
  logger.info(`[VideoCuttingSquad] userId=${userId} files=${files?.length}`);

  const specialist = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM,
    buildUserMsg: (inp) => {
      const trans = inp.transcription ? `\nTRANSCRIÇÃO:\n${inp.transcription.slice(0, 3000)}` : '';
      const dur   = inp.duration ? `\nDURAÇÃO: ${inp.duration}s` : '';
      return `PEDIDO: ${inp.message}${dur}${trans}`;
    },
    userId,
  });

  const reviewer = makeReviewer({ systemPrompt: REVIEWER_SYSTEM, minScore: 80, userId });
  const refiner  = makeSpecialist({
    systemPrompt: SPECIALIST_SYSTEM + '\n\nAPRIMORE o plano de cortes conforme notas.',
    buildUserMsg: (inp, draft, notes) => `PEDIDO: ${inp.message}\nRASCUNHO:\n${draft?.content||''}\nNOTAS:\n${(notes||[]).join('\n')}`,
    userId,
  });

  const result = await runWithReview({
    specialist, reviewer, refiner,
    input: { message, transcription, duration },
    minScore: 80, maxAttempts: 2, memoryKey: 'video-cutting', userId,
  });

  const content = result.output?.content || result.output || 'Plano de cortes gerado.';

  // Tentar rotear para videoAgent existente se tiver arquivo de vídeo
  if (files?.some(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f.originalname ?? ''))) {
    try {
      const { default: videoAgent } = await import('../videoAgent.js');
      const videoResult = await videoAgent({ userId, message, context, files });
      if (videoResult?.content) {
        return {
          content:  `✂️ **Video Cutting Squad** | Score: ${result.qualityScore}/100\n\n${content}\n\n---\n**Processamento de vídeo:**\n${videoResult.content}`,
          agent:    'video_cutting_squad',
          metadata: { qualityScore: result.qualityScore, videoProcessed: true },
        };
      }
    } catch (err) {
      logger.warn(`[VideoCuttingSquad] videoAgent failed: ${err.message}`);
    }
  }

  return {
    content:  `✂️ **Video Cutting Squad** | Score: ${result.qualityScore}/100\n\n${content}`,
    agent:    'video_cutting_squad',
    metadata: { qualityScore: result.qualityScore },
  };
}

export default { runVideoCuttingFlow, clipPlannerAgent };

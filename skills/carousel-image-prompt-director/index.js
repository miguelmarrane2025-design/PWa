// skills/carousel-image-prompt-director/index.js
// Executor da skill — compatível com skill-manager existente.
// Entrada: (ctx, params, tools)
// Saída: { outputs, metadata }

import { v4 as uuidv4 } from 'uuid';
import { evaluatePromptPack } from './evaluator.js';

const SYSTEM = `Você é um diretor de arte especializado em carrosséis premium para Instagram, TikTok e YouTube Shorts.

Sua função é gerar prompts de imagem para cada slide. NÃO gere imagens. NÃO chame DALL-E. NÃO renderize HTML.

As imagens serão criadas fora do app pelo usuário e depois reenviadas ao BotSquad para montar o carrossel final.

REGRAS:
- Cada prompt específico ao tema — sem genéricos.
- Cenas realistas, editoriais, cinematográficas ou fotográficas.
- Nunca colocar texto dentro da imagem.
- Sempre deixar espaço para headline.
- Sempre gerar negative_prompt, composition e visual_purpose.
- Cada slide com cena visual diferente.
- Título curto — máx 7 palavras.
- Retornar APENAS JSON válido.

NÃO use como cena principal: onda sonora, curva de EQ, checklist, gráfico genérico, ícone abstrato, alvo, triângulo de alerta.

USE para nicho worship/guitarra/áudio: guitarrista no palco, pedalboard, amplificador, guitarra Strat/Tele/Les Paul, haze, luz azul/lime, home studio, interface de áudio, DAW desfocada.

Formato de saída:
{
  "type": "carousel_prompt_pack",
  "status": "CAROUSEL_PROMPTS_READY",
  "planId": "<uuid>",
  "topic": "<topic>",
  "platform": "<platform>",
  "slides": [
    {
      "slide": 1,
      "title": "<título — máx 7 palavras>",
      "text": "<texto do slide — máx 40 palavras>",
      "visual_concept": "<conceito visual>",
      "image_prompt": "<prompt completo em inglês>",
      "negative_prompt": "<o que evitar>",
      "composition": "<posicionamento e espaço para headline>",
      "aspect_ratio": "4:5",
      "visual_style": "<estilo visual>",
      "visual_purpose": "<por que funciona para este slide>",
      "notes": "<notas extras>"
    }
  ],
  "next_step": "Gere as imagens fora do app e envie as N imagens para finalizar o carrossel."
}`;

export default async function carouselImagePromptDirectorSkill(ctx, params, tools) {
  const { openaiStrong, openaiFast, log } = tools;
  const userId = ctx?.userId ?? null;

  const topic    = params.topic    || params.texto || ctx?.sessao?.ultimoTexto || 'carrossel';
  const niche    = params.niche    || params.nicho || ctx?.sessao?.nicho || '';
  const slides   = parseInt(params.slides || 6);
  const style    = params.style    || 'premium editorial dark';
  const platform = params.platform || 'instagram';
  const goal     = params.goal     || '';
  const planId   = uuidv4();

  const userMsg = `Crie um carousel_prompt_pack completo para:
Tema: ${topic}
Nicho: ${niche || 'geral'}
Slides: ${slides}
Estilo: ${style}
Plataforma: ${platform}
${goal ? `Objetivo: ${goal}` : ''}
planId: ${planId}

Retorne APENAS JSON válido com ${slides} slides.`;

  // Primeira tentativa com modelo rápido
  const llmFast = openaiFast || openaiStrong;
  let raw = await llmFast(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
    { userId, max_tokens: 4000 }
  );

  let parsed = null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}

  // Avaliar qualidade
  if (parsed && parsed.slides) {
    parsed.planId = planId;
    const { score, issues, action } = evaluatePromptPack(parsed);
    if (log) log(`[CarouselPromptSkill] score=${score} action=${action}`);

    if (action === 'escalate_to_strong') {
      if (log) log('[CarouselPromptSkill] escalating to strong model');
      const refined = await openaiStrong(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `${userMsg}\n\nAVISO: Os prompts anteriores tinham score ${score}/100. Problemas: ${issues.join(', ')}. Corrija TODOS os slides agora.` },
        ],
        { userId, max_tokens: 4000 }
      );
      try {
        const m2 = refined.match(/\{[\s\S]*\}/);
        if (m2) { parsed = JSON.parse(m2[0]); parsed.planId = planId; }
      } catch {}
    }
  }

  if (!parsed) {
    return {
      outputs: [{ tipo: 'texto', conteudo: raw }],
      metadata: { skill: 'carousel-image-prompt-director', planId, error: 'json_parse_failed' },
    };
  }

  const conteudo = formatOutput(parsed);

  return {
    outputs: [{ tipo: 'texto', conteudo }],
    metadata: {
      skill: 'carousel-image-prompt-director',
      planId,
      status: 'CAROUSEL_PROMPTS_READY',
      promptPack: parsed,
      slides: parsed.slides?.length ?? 0,
    },
  };
}

function formatOutput(pack) {
  const lines = [
    `🎨 **Pacote de Prompts — Carrossel "${pack.topic || ''}"**`,
    `📦 \`planId: ${pack.planId}\``,
    ``,
  ];
  for (const s of (pack.slides || [])) {
    lines.push(`**Slide ${s.slide} — ${s.title}**`);
    lines.push(`_${s.text}_`);
    lines.push(`\`\`\`\n${s.image_prompt}\n\`\`\``);
    lines.push(`🚫 Neg: ${s.negative_prompt}`);
    lines.push(`📐 ${s.composition}`);
    lines.push(`🎯 ${s.visual_purpose}`);
    lines.push(`---`);
  }
  lines.push(`✅ **${pack.next_step}**`);
  return lines.join('\n');
}

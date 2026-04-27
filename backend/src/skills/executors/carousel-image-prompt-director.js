// skills/executors/carousel-image-prompt-director.js
// Self-contained executor — skill-manager chama default(ctx, params, tools)

import { v4 as uuidv4 } from 'uuid';

const SYSTEM = `Você é um diretor de arte especializado em carrosséis premium para Instagram, TikTok e YouTube Shorts.

Sua função é gerar prompts de imagem para cada slide. NÃO gere imagens. NÃO chame DALL-E. NÃO renderize HTML ou SVG.

As imagens serão criadas FORA DO APP pelo usuário e depois reenviadas ao BotSquad para montar o carrossel final.

REGRAS OBRIGATÓRIAS:
- Cada prompt específico ao tema — sem genéricos.
- Cenas realistas, editoriais, cinematográficas ou fotográficas.
- Nunca colocar texto dentro da imagem.
- Sempre deixar espaço para headline.
- Sempre gerar negative_prompt, composition e visual_purpose.
- Cada slide com cena visual diferente.
- Título curto — máx 7 palavras.
- Retornar APENAS JSON válido, sem markdown, sem \`\`\`json.

NÃO use como cena principal: onda sonora, curva de EQ, checklist, gráfico genérico, ícone abstrato, alvo, triângulo de alerta.
USE para nicho worship/guitarra/áudio: guitarrista no palco, pedalboard, amplificador, guitarra Strat/Tele/Les Paul, haze, luz azul/lime, home studio, interface de áudio, DAW desfocada, monitores de referência.

Retorne SOMENTE este JSON:
{
  "type": "carousel_prompt_pack",
  "status": "CAROUSEL_PROMPTS_READY",
  "planId": "<planId>",
  "topic": "<topic>",
  "platform": "<platform>",
  "slides": [
    {
      "slide": 1,
      "title": "<título — máx 7 palavras>",
      "text": "<texto do slide — máx 40 palavras>",
      "visual_concept": "<conceito em 1 frase>",
      "image_prompt": "<prompt completo em inglês>",
      "negative_prompt": "<o que evitar>",
      "composition": "<posicionamento + espaço para headline>",
      "aspect_ratio": "4:5",
      "visual_style": "<estilo visual>",
      "visual_purpose": "<por que funciona para este slide>",
      "notes": "<notas extras>"
    }
  ],
  "next_step": "Gere as imagens fora do app e envie as N imagens aqui para finalizar o carrossel."
}`;

const GENERIC_MAIN = ['sound wave','onda sonora','eq curve','curva de eq','alert','alerta',
  'target','alvo','checklist','generic graph','gráfico genérico','icon','ícone','symbol','símbolo','waveform'];
const CINEMATIC = ['cinematic','photo','realistic','editorial','shallow depth','bokeh','studio',
  'stage','rim lighting','haze','atmospheric','50mm','lens','depth of field'];

function evaluate(pack) {
  if (!pack?.slides?.length) return { score: 0, issues: ['no slides'], action: 'escalate_to_strong' };
  const s = pack.slides; let score = 0; const issues = [];
  const hasNeg  = s.every(sl => (sl.negative_prompt||'').trim().length > 10);
  const hasComp = s.every(sl => (sl.composition||'').trim().length > 10);
  const hasPurp = s.every(sl => (sl.visual_purpose||'').trim().length > 10);
  if (!hasNeg)  issues.push('negative_prompt ausente'); else score += 10;
  if (!hasComp) issues.push('composition ausente');     else score += 10;
  if (!hasPurp) issues.push('visual_purpose ausente');  else score += 10;
  const realCount = s.filter(sl => CINEMATIC.some(t => (sl.image_prompt||'').toLowerCase().includes(t))).length;
  score += Math.round((realCount / s.length) * 15);
  if (realCount < s.length * 0.6) issues.push('prompts pouco cinematográficos');
  const specCount = s.filter(sl => (sl.image_prompt||'').length > 100).length;
  score += Math.round((specCount / s.length) * 10);
  const uniq = new Set(s.map(sl => (sl.image_prompt||'').toLowerCase().slice(0,40)));
  const varScore = uniq.size >= s.length ? 15 : Math.round((uniq.size / s.length) * 15);
  score += varScore;
  if (varScore < 10) issues.push('slides com prompts muito similares');
  const genericCount = s.filter(sl => { const main = (sl.image_prompt||'').toLowerCase().split(',')[0]; return GENERIC_MAIN.some(t => main.includes(t)); }).length;
  score += Math.max(0, 20 - genericCount * 5);
  if (genericCount > 0) issues.push(`${genericCount} slide(s) com cena principal genérica`);
  const total = Math.min(100, Math.round((score / 90) * 100));
  return { score: total, issues, action: total >= 80 ? 'accept' : total >= 65 ? 'accept_with_note' : 'escalate_to_strong' };
}

function format(pack) {
  const lines = [`🎨 **Pacote de Prompts — Carrossel**`,`📦 \`planId: ${pack.planId}\``,`📱 ${pack.platform||'Instagram'} · ${pack.slides?.length||0} slides`,``];
  for (const sl of (pack.slides||[])) {
    lines.push(`**Slide ${sl.slide} — ${sl.title}**`,`_${sl.text}_`,`\`\`\``,sl.image_prompt,`\`\`\``,`🚫 **Negative:** ${sl.negative_prompt}`,`📐 **Composição:** ${sl.composition}`,`🎯 **Propósito:** ${sl.visual_purpose}`);
    if (sl.notes) lines.push(`💡 ${sl.notes}`);
    lines.push(`---`);
  }
  lines.push(`✅ **${pack.next_step}**`);
  return lines.join('\n');
}

export default async function(ctx, params, tools) {
  const { openaiStrong, openaiFast, log } = tools;
  const userId   = ctx?.userId ?? null;
  const topic    = params.topic||params.texto||params.tema||ctx?.sessao?.ultimoTexto||'carrossel';
  const niche    = params.niche||params.nicho||ctx?.sessao?.nicho||'';
  const slides   = parseInt(params.slides||6);
  const style    = params.style||'premium editorial dark';
  const platform = params.platform||'instagram';
  const goal     = params.goal||'';
  const planId   = uuidv4();

  const userMsg = `Crie um carousel_prompt_pack completo.\nplanId: ${planId}\nTema: ${topic}\nNicho: ${niche||'geral'}\nSlides: ${slides}\nEstilo: ${style}\nPlataforma: ${platform}${goal?`\nObjetivo: ${goal}`:''}\nRetorne APENAS JSON válido com ${slides} slides.`;

  const llmFast = openaiFast||openaiStrong;
  let raw = await llmFast([{role:'system',content:SYSTEM},{role:'user',content:userMsg}],{userId,max_tokens:4000});

  let parsed = null;
  try { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch {}

  if (parsed?.slides) {
    parsed.planId = planId;
    const { score, issues, action } = evaluate(parsed);
    if (log) log(`[CarouselPromptDirector] score=${score} action=${action}`);
    if (action === 'escalate_to_strong') {
      if (log) log('[CarouselPromptDirector] escalating to strong model');
      const refined = await openaiStrong(
        [{role:'system',content:SYSTEM},{role:'user',content:`${userMsg}\n\nAVISO: score=${score}/100 Problemas: ${issues.join(', ')}. Corrija TODOS os slides.`}],
        {userId,max_tokens:4000}
      );
      try { const m = refined.match(/\{[\s\S]*\}/); if (m) { parsed = JSON.parse(m[0]); parsed.planId = planId; } } catch {}
    }
  }

  if (!parsed) return { outputs:[{tipo:'texto',conteudo:raw}], metadata:{skill:'carousel-image-prompt-director',planId,error:'json_parse_failed'} };

  return {
    outputs:[{tipo:'texto',conteudo:format(parsed)}],
    metadata:{skill:'carousel-image-prompt-director',planId,status:'CAROUSEL_PROMPTS_READY',promptPack:parsed,slides:parsed.slides?.length??0},
  };
}

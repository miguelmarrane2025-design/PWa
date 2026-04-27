// agents/imagePromptDirectorAgent.js
// Diretor de arte de prompts de imagem para carrosséis.
// NÃO gera imagens. NÃO chama DALL-E. Apenas gera prompt_pack.

import { v4 as uuidv4 } from 'uuid';
import { logger }       from '../lib/logger.js';
import { modelRouter }  from '../ai/modelRouter.js';

// ── Prompt de sistema ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é um diretor de arte especializado em carrosséis premium para Instagram, TikTok, YouTube Shorts e conteúdo educacional.

Sua ÚNICA função é gerar prompts de imagem para cada slide de um carrossel. Você NÃO deve gerar imagens, chamar APIs de imagem, renderizar HTML ou SVG.

As imagens serão criadas FORA DO APP pelo usuário (Midjourney, SDXL, Firefly, ChatGPT etc) e depois reenviadas ao BotSquad para montar o carrossel final.

REGRAS OBRIGATÓRIAS:
- Cada prompt deve ser específico ao tema do carrossel — sem prompts genéricos.
- Cada prompt deve representar visualmente a mensagem daquele slide.
- Evitar ícones genéricos, símbolos simples, SVG, gráficos abstratos, ondas sonoras, curvas de EQ, checklist genérico como CENA PRINCIPAL.
- Criar cenas realistas, editoriais, cinematográficas ou fotográficas.
- Nunca colocar texto dentro da imagem.
- Sempre deixar espaço limpo para a headline.
- Sempre gerar negative_prompt.
- Sempre gerar composition.
- Sempre gerar visual_purpose.
- Cada slide deve ter uma cena visual DIFERENTE.
- O título (title) deve ser curto e forte — máx 7 palavras.
- A saída deve ser JSON válido, sem markdown.

REFERÊNCIAS VISUAIS PARA NICHO GUITARRA/WORSHIP/ÁUDIO/MIXAGEM:
USE: guitarrista worship no palco, pedalboard, amplificador, guitarra Strat/Tele/Les Paul, igreja moderna, luz azul/lime/neon, haze atmosférico, home studio, interface de áudio, monitores de referência, DAW desfocada ao fundo, plugin de EQ sem texto legível, músico ajustando timbre, comparação visual de mix embolada vs limpa, baixo e bumbo dominando o grave, ambiência de delay/reverb.
NÃO USE como cena principal: alvo abstrato, triângulo de alerta, curva genérica de EQ, onda sonora genérica, checklist genérico, gráfico genérico, ícones soltos.

Retorne APENAS JSON válido neste formato exato:
{
  "type": "carousel_prompt_pack",
  "status": "CAROUSEL_PROMPTS_READY",
  "planId": "<uuid>",
  "topic": "<topic>",
  "platform": "<platform>",
  "slides": [
    {
      "slide": 1,
      "title": "<título curto e forte>",
      "text": "<texto do slide — máx 40 palavras>",
      "visual_concept": "<conceito visual em 1 frase>",
      "image_prompt": "<prompt completo em inglês para gerador de imagem>",
      "negative_prompt": "<o que evitar na imagem>",
      "composition": "<posicionamento dos elementos — onde fica o espaço para a headline>",
      "aspect_ratio": "4:5",
      "visual_style": "<estilo visual resumido>",
      "visual_purpose": "<por que essa imagem funciona para esse slide>",
      "notes": "<observações extras>"
    }
  ],
  "next_step": "Gere as imagens fora do app usando os prompts acima e envie as imagens para finalizar o carrossel."
}`;

// ── Agente principal ─────────────────────────────────────────────────────────
export async function imagePromptDirectorAgent({ userId, message, context = [], files = [] }) {
  logger.info(`[ImagePromptDirector] start user=${userId}`);

  // Extrair parâmetros da mensagem ou do contexto
  const planId = uuidv4();

  const userPayload = `${SYSTEM_PROMPT}

planId a usar: ${planId}

Mensagem do usuário: ${message}

${context.length ? `Contexto recente:\n${context.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

Gere agora o carousel_prompt_pack completo com 6 slides. Retorne APENAS JSON válido.`;

  const raw = await modelRouter.callMini(
    [{ role: 'user', content: userPayload }],
    { userId, max_tokens: 4000 }
  );

  let parsed = null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch (e) {
    logger.warn(`[ImagePromptDirector] JSON parse fail: ${e.message}`);
  }

  // Avaliar qualidade e refinar se necessário
  if (parsed && parsed.slides) {
    const { score, issues } = evaluatePromptPack(parsed);
    logger.info(`[ImagePromptDirector] quality score=${score}`);

    if (score < 65) {
      logger.info('[ImagePromptDirector] score<65 → escalating to strong model');
      const refined = await modelRouter.callStrong(
        [{ role: 'user', content: `${userPayload}\n\nAVISO DE QUALIDADE: Os prompts gerados tinham score ${score}/100 com os seguintes problemas: ${issues.join(', ')}. Corrija e melhore todos os prompts agora.` }],
        { userId, max_tokens: 4000 }
      );
      try {
        const m = refined.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch {}
    } else if (score < 80) {
      logger.info('[ImagePromptDirector] score 65-79 → light refinement with mini');
      // Aceita mas registra
    }

    // Garantir planId
    if (parsed) parsed.planId = planId;
  }

  if (!parsed) {
    // Fallback legível
    return {
      type: 'text',
      content: `🎨 **Direção de Arte — Prompts para o Carrossel**\n\n${raw}\n\n> _Envie as imagens geradas com esses prompts para finalizar o carrossel._`,
      agent: 'image-prompt-director',
    };
  }

  const content = formatPromptPackMessage(parsed);
  return {
    type: 'carousel_prompt_pack',
    content,
    agent: 'image-prompt-director',
    metadata: {
      agent: 'image-prompt-director',
      planId,
      status: 'CAROUSEL_PROMPTS_READY',
      promptPack: parsed,
    },
  };
}

// ── Avaliador de qualidade ───────────────────────────────────────────────────
const GENERIC_TERMS_MAIN = ['sound wave', 'onda sonora', 'eq curve', 'curva de eq',
  'alert', 'alerta', 'target', 'alvo', 'checklist', 'gráfico genérico', 'generic graph',
  'ícone', 'icon', 'símbolo', 'symbol'];

function evaluatePromptPack(pack) {
  if (!pack.slides || !Array.isArray(pack.slides)) return { score: 0, issues: ['no slides'] };

  const slides = pack.slides;
  const issues = [];
  let total = 0;

  // Presença de campos obrigatórios (0-10 por slide, média)
  const hasNeg     = slides.every(s => s.negative_prompt && s.negative_prompt.length > 10);
  const hasComp    = slides.every(s => s.composition    && s.composition.length > 10);
  const hasPurpose = slides.every(s => s.visual_purpose && s.visual_purpose.length > 10);

  if (!hasNeg)     issues.push('negative_prompt ausente');
  if (!hasComp)    issues.push('composition ausente');
  if (!hasPurpose) issues.push('visual_purpose ausente');

  total += hasNeg     ? 10 : 0;
  total += hasComp    ? 10 : 0;
  total += hasPurpose ? 10 : 0;

  // Variedade de prompts
  const prompts = slides.map(s => (s.image_prompt || '').toLowerCase().slice(0, 80));
  const uniqueStarts = new Set(prompts.map(p => p.slice(0, 30)));
  const variety = uniqueStarts.size >= slides.length * 0.8 ? 15 : 5;
  total += variety;
  if (variety < 10) issues.push('prompts muito similares entre slides');

  // Realismo visual — verifica se prompts têm termos cinematográficos
  const cinematicTerms = ['cinematic', 'photo', 'realistic', 'editorial', 'shallow depth', 'bokeh', 'studio', 'stage'];
  const realistCount = slides.filter(s =>
    cinematicTerms.some(t => (s.image_prompt || '').toLowerCase().includes(t))
  ).length;
  const realismScore = Math.round((realistCount / slides.length) * 15);
  total += realismScore;
  if (realismScore < 10) issues.push('prompts pouco realistas/cinematográficos');

  // Evita genérico como cena principal
  const genericMainCount = slides.filter(s => {
    const prompt = (s.image_prompt || '').toLowerCase().split(',')[0]; // primeiro elemento = cena principal
    return GENERIC_TERMS_MAIN.some(t => prompt.includes(t));
  }).length;
  const avoidGenericScore = Math.max(0, 20 - genericMainCount * 5);
  total += avoidGenericScore;
  if (genericMainCount > 0) issues.push(`${genericMainCount} slide(s) com cena principal genérica`);

  // Especificidade — prompts longos (>80 chars) = mais específicos
  const specificCount = slides.filter(s => (s.image_prompt || '').length > 80).length;
  const specificScore = Math.round((specificCount / slides.length) * 10);
  total += specificScore;

  // Título curto
  const shortTitleCount = slides.filter(s => (s.title || '').split(' ').length <= 8).length;
  const titleScore = Math.round((shortTitleCount / slides.length) * 10);
  total += titleScore;

  return { score: Math.min(100, total), issues };
}

// ── Formatar mensagem de saída ───────────────────────────────────────────────
function formatPromptPackMessage(pack) {
  const lines = [
    `🎨 **Pacote de Prompts para o Carrossel**`,
    `📦 Plan ID: \`${pack.planId}\``,
    `📱 Plataforma: ${pack.platform || 'Instagram'} · Slides: ${pack.slides.length}`,
    ``,
    `---`,
    ``,
  ];

  for (const s of pack.slides) {
    lines.push(`**Slide ${s.slide} — ${s.title}**`);
    lines.push(`📝 _${s.text}_`);
    lines.push(`🖼️ **Prompt de Imagem:**`);
    lines.push(`\`\`\``);
    lines.push(s.image_prompt);
    lines.push(`\`\`\``);
    lines.push(`🚫 **Negative:** ${s.negative_prompt}`);
    lines.push(`📐 **Composição:** ${s.composition}`);
    lines.push(`🎯 **Propósito Visual:** ${s.visual_purpose}`);
    lines.push(`📏 Ratio: ${s.aspect_ratio || '4:5'}`);
    if (s.notes) lines.push(`💡 ${s.notes}`);
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`✅ **Próximo passo:** ${pack.next_step}`);
  lines.push(`> Após gerar as imagens fora do app, envie todas as ${pack.slides.length} imagens aqui para eu montar o carrossel final.`);

  return lines.join('\n');
}

export default imagePromptDirectorAgent;

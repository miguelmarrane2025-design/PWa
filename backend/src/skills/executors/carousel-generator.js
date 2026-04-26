// skills/executors/carousel-generator.js
// Gera carrosséis completos com prompts de imagem para cada slide

export async function runCarouselGenerator({ input, context, llm }) {
  const { topic, type = 'educational', slides = 6, style = 'modern', niche = '' } = input;

  const typeMap = {
    educational:  'educacional (ensinar algo)',
    sales:        'de vendas (converter)',
    authority:    'de autoridade (posicionamento)',
    storytelling: 'de storytelling (narrativa)',
    comparison:   'de comparação (X vs Y)',
    infoproduct:  'de infoproduto (lançamento)',
  };

  const prompt = `Você é um especialista em criação de carrosséis de alto engajamento para redes sociais e um diretor de arte para carrosséis premium.

Crie um carrossel ${typeMap[type] || 'educacional'} sobre: "${topic}"
${niche ? `Nicho: ${niche}` : ''}
Número de slides: ${slides}
Estilo visual desejado: ${style}

As imagens serão geradas fora do app pelo usuário e depois usadas para montar o carrossel final.
Regras obrigatórias para os prompts de imagem:
- Não gere prompts genéricos de ícones, símbolos, SVG, alvos, alertas, grades, checklists ou gráficos abstratos como padrão.
- Cada prompt precisa representar uma cena visual realista/editorial diretamente ligada ao assunto do slide e ao nicho.
- Quando o tema envolver guitarra, worship, mix, áudio, equalização, palco, pedaleira, home studio, músico gravando ou plugin/EQ, use cenas reais desse universo: guitarrista worship em palco, pedalboard, DAW/EQ desfocado sem texto legível, home studio, pedaleira, guitarra elétrica, monitores, interface de áudio, palco de igreja com haze e backlight.
- Cada slide precisa ter uma imagem diferente.
- A imagem não deve conter texto.
- Sempre deixe espaço limpo para headline.
- Sempre inclua negative_prompt, composition e visual_purpose.
- O estilo deve parecer premium, realista/editorial, não desenho básico.

Para CADA slide, produza:
1. Número do slide e seu papel (hook / problema / insight / solução / prova / CTA)
2. Headline principal (máx 8 palavras, impactante)
3. Texto do slide (máx 40 palavras, claro e direto)
4. Conceito visual realista/editorial (o que mostrar na imagem)
5. Prompt de imagem pronto para Midjourney, Flux, Ideogram, Leonardo ou Stable Diffusion
6. Negative prompt
7. Composição
8. Propósito visual
9. Cores sugeridas para o slide

Estrutura obrigatória do image_prompt:
"realistic cinematic/editorial photo of [subject related to the slide], in [environment related to the niche], [lighting], [camera/lens or composition], [color palette], premium editorial look, empty space on [left/right/top] for bold headline, no text, no watermark"

Também produza:
- Legenda do post completa com emojis
- Lista de hashtags (15 relevantes)
- CTA final do carrossel

Formato de resposta (JSON):
{
  "title": "Título do carrossel",
  "objective": "Objetivo estratégico",
  "total_slides": ${slides},
  "slides": [
    {
      "number": 1,
      "role": "hook",
      "headline": "",
      "body_text": "",
      "visual_concept": "",
      "image_prompt": "realistic cinematic photo of ... empty space on left for bold headline, no text, no watermark",
      "negative_prompt": "cartoon, illustration, logo, text, watermark, blurry, low quality, messy background",
      "composition": "",
      "aspect_ratio": "4:5",
      "visual_style": "premium realistic editorial",
      "visual_purpose": "",
      "notes": "sem texto na imagem, deixar espaço para headline",
      "colors": { "bg": "#", "text": "#", "accent": "#" }
    }
  ],
  "caption": "Legenda completa do post...",
  "hashtags": [],
  "tip": "Dica de postagem"
}`;

  const raw = await llm.complete(prompt, { model: 'strong', maxTokens: 3000 });

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch { parsed = null; }

  if (!parsed) {
    return {
      success: false,
      output: raw,
      message: 'Carrossel gerado em texto (parse JSON falhou)',
    };
  }

  return {
    success: true,
    output: parsed,
    message: `Carrossel de ${parsed.total_slides} slides criado com prompts de imagem prontos para uso.`,
    metadata: { type, topic, slides: parsed.total_slides },
  };
}

// Adapter: converte assinatura (ctx, params, tools) → ({input, context, llm})
export default async function(ctx, params, tools) {
  const { openaiStrong, log } = tools;
  const userId = ctx?.userId || null;

  // Wrapper LLM compatível com assinatura da skill
  const llm = {
    complete: async (prompt, opts = {}) => {
      return openaiStrong([{ role: 'user', content: prompt }], { userId, max_tokens: opts.maxTokens || 2000 });
    },
  };

  const input = { topic: params.texto || params.topic || ctx.sessao?.ultimoTexto || '', type: params.type, slides: parseInt(params.slides||6), style: params.style||'modern', niche: params.nicho||ctx.sessao?.nicho||'' };
  const context = ctx?.sessao?.ultimoTexto ? [{ role: 'user', content: ctx.sessao.ultimoTexto }] : [];

  const result = await runCarouselGenerator({ input, context, llm });

  // Normaliza saída para formato esperado pelo skill-manager
  const textoSaida = typeof result.output === 'string'
    ? result.output
    : JSON.stringify(result.output, null, 2);

  return {
    outputs: [{ tipo: 'texto', conteudo: textoSaida }],
    metadata: { skill: 'carousel-generator', ...result.metadata },
  };
}

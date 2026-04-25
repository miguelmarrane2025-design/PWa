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

  const prompt = `Você é um especialista em criação de carrosséis de alto engajamento para redes sociais.

Crie um carrossel ${typeMap[type] || 'educacional'} sobre: "${topic}"
${niche ? `Nicho: ${niche}` : ''}
Número de slides: ${slides}
Estilo visual desejado: ${style}

Para CADA slide, produza:
1. Número do slide e seu papel (hook / problema / insight / solução / prova / CTA)
2. Headline principal (máx 8 palavras, impactante)
3. Texto do slide (máx 40 palavras, claro e direto)
4. Instrução visual (o que mostrar no fundo/imagem)
5. Prompt de imagem para ChatGPT/Midjourney (detalhado, proporção 4:5 ou 1:1)
6. Cores sugeridas para o slide

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
      "visual_instruction": "",
      "image_prompt": "Crie uma imagem vertical 4:5, estilo...",
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

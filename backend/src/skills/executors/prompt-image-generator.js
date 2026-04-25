// skills/executors/prompt-image-generator.js
// Gera prompts detalhados de imagem para ChatGPT, Midjourney ou DALL-E

export async function runPromptImageGenerator({ input, context, llm }) {
  const {
    description,
    style = 'cinematic',
    ratio = '4:5',
    count = 3,
    platform = 'instagram',
    mood = '',
    colors = '',
    no_text = true,
  } = input;

  const prompt = `Você é um diretor de arte especialista em criar prompts de imagem para IA.

Crie ${count} variações de prompts de imagem para:
Descrição: "${description}"
Estilo: ${style}
Proporção: ${ratio}
Plataforma destino: ${platform}
${mood ? `Mood/Atmosfera: ${mood}` : ''}
${colors ? `Paleta de cores: ${colors}` : ''}
${no_text ? 'IMPORTANTE: sem texto na imagem' : ''}

Cada prompt deve incluir:
- Descrição visual detalhada do que deve aparecer
- Estilo de fotografia/arte
- Iluminação específica
- Composição e enquadramento
- Paleta cromática
- Atmosfera e mood
- Técnica ou estilo artístico
- Proporção e orientação
- O que NÃO deve aparecer

Retorne JSON:
{
  "prompts": [
    {
      "version": "A",
      "label": "Principal",
      "prompt_en": "Prompt em inglês para ChatGPT/Midjourney",
      "prompt_pt": "Versão em português",
      "negative": "O que evitar",
      "style_tags": [],
      "best_for": "Slide 1 / Capa"
    }
  ],
  "general_style_guide": {
    "primary_colors": [],
    "mood": "",
    "lighting": "",
    "composition": ""
  }
}`;

  const raw = await llm.complete(prompt, { model: 'strong', maxTokens: 2000 });

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch { parsed = null; }

  return {
    success: true,
    output: parsed || { raw },
    message: `${count} prompts de imagem gerados. Cole no ChatGPT ou Midjourney.`,
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

  const input = { description: params.texto || params.description || ctx.sessao?.ultimoTexto || '', style: params.style, ratio: params.ratio||'4:5', count: parseInt(params.count||3), platform: params.platform||'instagram', mood: params.mood||'', colors: params.colors||'' };
  const context = ctx?.sessao?.ultimoTexto ? [{ role: 'user', content: ctx.sessao.ultimoTexto }] : [];

  const result = await runPromptImageGenerator({ input, context, llm });

  // Normaliza saída para formato esperado pelo skill-manager
  const textoSaida = typeof result.output === 'string'
    ? result.output
    : JSON.stringify(result.output, null, 2);

  return {
    outputs: [{ tipo: 'texto', conteudo: textoSaida }],
    metadata: { skill: 'prompt-image-generator', ...result.metadata },
  };
}

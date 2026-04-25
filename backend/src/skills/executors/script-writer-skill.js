// skills/executors/script-writer-skill.js
export async function runScriptWriter({ input, llm }) {
  const { topic, format = 'shorts', duration = 60, tone = 'educational', cta = '' } = input;

  const prompt = `Crie um roteiro completo de ${format.toUpperCase()} sobre: "${topic}"
Duração alvo: ${duration} segundos
Tom: ${tone}
${cta ? `CTA final: ${cta}` : ''}

Estrutura obrigatória:
- Hook (0-3s): frase que prende atenção imediatamente
- Problema/Contexto (3-15s): o porquê o assunto importa
- Conteúdo principal (15-${duration - 10}s): o valor real
- CTA (últimos 5-10s): próximo passo

Para cada trecho, indique:
- Tempo exato
- Fala narrada (palavra por palavra)
- Ação visual sugerida
- Emotion/energia esperada

Retorne JSON com:
{ "title": "", "hook": "", "total_words": 0, "script": [{ "time": "0-3s", "text": "", "visual": "", "energy": "" }], "caption": "", "thumbnail_idea": "" }`;

  const raw = await llm.complete(prompt, { model: 'strong', maxTokens: 2000 });
  let parsed;
  try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  return { success: true, output: parsed || { raw }, message: `Roteiro de ${format} criado com sucesso.` };
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

  const input = { topic: params.texto || params.topic || ctx.sessao?.ultimoTexto || '', format: params.format||'shorts', duration: parseInt(params.duration||60), tone: params.estilo||params.tone||'educational', cta: params.cta||'' };
  const context = ctx?.sessao?.ultimoTexto ? [{ role: 'user', content: ctx.sessao.ultimoTexto }] : [];

  const result = await runScriptWriter({ input, context, llm });

  // Normaliza saída para formato esperado pelo skill-manager
  const textoSaida = typeof result.output === 'string'
    ? result.output
    : JSON.stringify(result.output, null, 2);

  return {
    outputs: [{ tipo: 'texto', conteudo: textoSaida }],
    metadata: { skill: 'script-writer-skill', ...result.metadata },
  };
}

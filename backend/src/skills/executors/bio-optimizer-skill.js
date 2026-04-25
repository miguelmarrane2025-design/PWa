// skills/executors/bio-optimizer-skill.js
export async function runBioOptimizer({ input, llm }) {
  const { current_bio = '', platform = 'instagram', niche, goal = 'leads' } = input;

  const prompt = `Otimize a bio de ${platform.toUpperCase()} para maximizar ${goal}.
Nicho: ${niche}
Bio atual: "${current_bio || 'não fornecida'}"

Crie 3 versões de bio otimizada com:
- Hook na primeira linha (quem você ajuda + resultado)
- Prova social ou credencial
- CTA claro com link/ação
- Emojis estratégicos (não excessivos)
- Palavras-chave relevantes para busca
- Adaptada ao limite de caracteres da plataforma

Instagram: 150 chars | LinkedIn: 200 chars | YouTube: 1000 chars | Twitter: 160 chars

Retorne JSON:
{ "platform": "", "versions": [{ "label": "Autoridade", "bio": "", "chars": 0, "hook": "", "reasoning": "" }], "keywords": [], "tip": "" }`;

  const raw = await llm.complete(prompt, { model: 'strong', maxTokens: 1200 });
  let parsed;
  try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  return { success: true, output: parsed || { raw }, message: 'Bio otimizada com 3 variações.' };
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

  const input = { platform: params.platform||'instagram', niche: params.nicho||ctx.sessao?.nicho||'geral', current_bio: params.bio||params.texto||'', goal: params.goal||'leads' };
  const context = ctx?.sessao?.ultimoTexto ? [{ role: 'user', content: ctx.sessao.ultimoTexto }] : [];

  const result = await runBioOptimizer({ input, context, llm });

  // Normaliza saída para formato esperado pelo skill-manager
  const textoSaida = typeof result.output === 'string'
    ? result.output
    : JSON.stringify(result.output, null, 2);

  return {
    outputs: [{ tipo: 'texto', conteudo: textoSaida }],
    metadata: { skill: 'bio-optimizer-skill', ...result.metadata },
  };
}

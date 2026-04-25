// skills/executors/email-sequence-skill.js
export async function runEmailSequence({ input, llm }) {
  const { product, audience, sequence_type = 'launch', emails = 5, tone = 'conversational' } = input;

  const prompt = `Crie uma sequência de ${emails} emails de ${sequence_type} para:
Produto/Oferta: "${product}"
Público-alvo: "${audience}"
Tom: ${tone}

Para cada email:
1. Assunto principal + 2 alternativas para teste A/B
2. Preview text (pré-header)
3. Saudação personalizada
4. Corpo completo do email
5. CTA principal
6. PS (opcional mas recomendado)
7. Melhor horário para envio

Sequência deve ter progressão lógica: curiosidade → interesse → desejo → ação

Retorne JSON:
{ "sequence_name": "", "total_emails": ${emails}, "emails": [{ "number": 1, "subject": "", "subject_b": "", "preview": "", "body": "", "cta": "", "ps": "", "send_time": "" }] }`;

  const raw = await llm.complete(prompt, { model: 'strong', maxTokens: 3000 });
  let parsed;
  try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  return { success: true, output: parsed || { raw }, message: `Sequência de ${emails} emails criada.` };
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

  const input = { product: params.produto||params.product||params.texto||ctx.sessao?.ultimoTexto||'', audience: params.publico||params.audience||ctx.sessao?.nicho||'geral', sequence_type: params.sequence_type||'launch', emails: parseInt(params.emails||5), tone: params.tone||'conversational' };
  const context = ctx?.sessao?.ultimoTexto ? [{ role: 'user', content: ctx.sessao.ultimoTexto }] : [];

  const result = await runEmailSequence({ input, context, llm });

  // Normaliza saída para formato esperado pelo skill-manager
  const textoSaida = typeof result.output === 'string'
    ? result.output
    : JSON.stringify(result.output, null, 2);

  return {
    outputs: [{ tipo: 'texto', conteudo: textoSaida }],
    metadata: { skill: 'email-sequence-skill', ...result.metadata },
  };
}

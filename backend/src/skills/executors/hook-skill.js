// skills/executors/hook-skill.js
// Skill: HookSkill — Gera hooks virais e ganchos de alta retenção para conteúdo.
// Especializado em primeiros 3 segundos de vídeo, aberturas de copy e títulos.

import { log } from '../../core/logger.js';

export default async function hookSkill(ctx, params, tools) {
  const { openaiStrong, webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const tema = params.tema || ctx.sessao?.ultimoTema || nicho;
  const quantidade = params.quantidade || 10;
  const formato = params.formato || 'misto'; // video | copy | titulo | misto

  log('info', `[HookSkill] Nicho: ${nicho} | Tema: ${tema} | Formato: ${formato}`);

  // Busca hooks virais do nicho
  let referencia = '';
  try {
    const res = await webSearch.buscarTexto(`hooks virais ${nicho} ${tema} exemplos`, { limite: 3 });
    referencia = res.substring(0, 1000);
  } catch (_) {}

  const prompt = `Você é especialista em hooks virais para criadores de conteúdo brasileiros.
Crie ${quantidade} hooks irresistíveis para o nicho "${nicho}" sobre o tema "${tema}".

REFERÊNCIAS DO MERCADO:
${referencia || 'Sem referências externas — use seu conhecimento.'}

Retorne JSON:
{
  "tema": "${tema}",
  "nicho": "${nicho}",
  "hooks": [
    {
      "texto": "o hook em si (para os primeiros 3 segundos ou abertura)",
      "tipo": "pergunta|provocacao|dado|historia|contra-intuitivo|desafio|promessa",
      "formato": "video|copy|titulo",
      "gatilho": "nome do gatilho mental usado",
      "potencialViral": 1-10
    }
  ],
  "dicas": ["dica de entrega 1", "dica de entrega 2"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const resultado = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    if (userId) {
      await memoryMCP.salvar('hooks', 'ultimos_gerados', resultado, userId);
    }

    const hooksOrdenados = (resultado.hooks || [])
      .sort((a, b) => (b.potencialViral || 0) - (a.potencialViral || 0));

    const linhas = [
      `🪝 *HOOKS VIRAIS — ${tema.toUpperCase()}*\n`
    ];

    hooksOrdenados.forEach((h, i) => {
      const estrelas = '⭐'.repeat(Math.round((h.potencialViral || 7) / 2));
      linhas.push(`*${i + 1}. [${h.tipo?.toUpperCase()}]* ${estrelas}`);
      linhas.push(`"${h.texto}"`);
      linhas.push(`_Gatilho: ${h.gatilho}_\n`);
    });

    if (resultado.dicas?.length) {
      linhas.push(`💡 *Dicas de entrega:*`);
      resultado.dicas.forEach(d => linhas.push(`• ${d}`));
    }

    return {
      hooks: hooksOrdenados,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };

  } catch (err) {
    log('error', `[HookSkill] Erro: ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro ao gerar hooks: ${err.message}` }] };
  }
}

// skills/executors/angle-generator-skill.js
// Skill: AngleGenerator — Gera ângulos únicos de abordagem para conteúdo e copy.
// Usa psicologia, dados de mercado e padrões virais para criar ângulos frescos.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function angleGeneratorSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const tema = params.tema || ctx.sessao?.ultimoTexto || '';
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const persona = ctx.personaBuilt || params.persona || {};
  const quantidade = params.quantidade || 7;

  if (!tema && !nicho) {
    return { outputs: [{ tipo: 'texto', conteudo: '💡 Informe o tema ou nicho para gerar ângulos.' }] };
  }

  log('info', `[AngleGenerator] Tema: ${tema || nicho}`);

  let angulos_mercado = [];
  try {
    const r = await webSearch(`${tema || nicho} ângulo criativo abordagem diferente viral`, { maxResultados: 5 });
    angulos_mercado = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Você é um especialista em criar ângulos únicos para copy e conteúdo.
Um ângulo é a PERSPECTIVA específica de abordar um tema que o torna irresistível para a persona.

TEMA: "${tema || nicho}"
NICHO: "${nicho}"
PERSONA: ${JSON.stringify(persona).substring(0, 400)}
ÂNGULOS JÁ USADOS NO MERCADO: ${angulos_mercado.map(a => a.titulo).join(', ')}

Crie ${quantidade} ângulos únicos e diferentes entre si. Retorne JSON:
{
  "angulos": [
    {
      "numero": 1,
      "nome": "nome do ângulo",
      "tipo": "controvérsia|curiosidade|contra-intuitivo|autoridade|medo|desejo|prova|identificação|urgência|novidade",
      "angulo": "a perspectiva em 1 frase",
      "headline": "headline usando este ângulo",
      "hook_video": "abertura de vídeo usando este ângulo",
      "copy_abertura": "primeiro parágrafo de copy",
      "por_que_funciona": "psicologia por trás",
      "melhor_para": "copy de venda|conteúdo viral|email|anúncio",
      "nivel_agressividade": "suave|moderado|agressivo"
    }
  ],
  "angulos_virgens": ["ângulo que ninguém no nicho está usando", "ângulo 2"],
  "angulo_recomendado": 0,
  "combinacao_explosiva": "como combinar 2 ângulos para resultado máximo"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const resultado = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('angles', `ang_${nicho}_${Date.now()}`, resultado, userId);

    const icons = { controvérsia: '⚡', curiosidade: '🤔', 'contra-intuitivo': '🔄', autoridade: '👑', medo: '😰', desejo: '✨', prova: '📊', identificação: '🤝', urgência: '⏰', novidade: '🆕' };

    const linhas = [
      `💡 *${resultado.angulos?.length} Ângulos para "${tema || nicho}"*\n`,
      ...resultado.angulos.map(a => {
        const icon = icons[a.tipo] || '🎯';
        const star = a.numero - 1 === resultado.angulo_recomendado ? '⭐ ' : '';
        return `${star}${icon} *${a.numero}. ${a.nome}* [${a.tipo}]\n"${a.angulo}"\n📣 ${a.headline}\n🎬 ${a.hook_video}\n`;
      }),
      `🔮 *Ângulos Virgens (ninguém está usando):*`,
      ...(resultado.angulos_virgens || []).map(a => `• ${a}`),
      `\n💥 *Combinação Explosiva:* ${resultado.combinacao_explosiva}`
    ];

    return {
      angulos: resultado,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[AngleGenerator] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao gerar ângulos.' }] };
  }
}

// skills/executors/thumbnail-optimizer-skill.js
// Skill: ThumbnailOptimizer — Analisa e cria conceitos de thumbnails de alta CTR.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function thumbnailOptimizerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const titulo = params.titulo || ctx.sessao?.ultimoTexto || '';
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const plataforma = params.plataforma || 'youtube'; // youtube|instagram|tiktok

  if (!titulo) {
    return { outputs: [{ tipo: 'texto', conteudo: '🖼️ Informe o título do conteúdo para otimizar a thumbnail.' }] };
  }

  let referencias = [];
  try {
    const r = await webSearch(`thumbnails alta CTR ${nicho} ${plataforma} design melhores práticas 2025`, { maxResultados: 4 });
    referencias = r?.resultados?.slice(0, 3) || [];
  } catch {}

  const prompt = `Você é um especialista em design de thumbnails e CTR (Click-Through Rate).

TÍTULO/TEMA: "${titulo}"
NICHO: "${nicho}"
PLATAFORMA: ${plataforma}

REFERÊNCIAS DE MERCADO: ${referencias.map(r => r.titulo).join(', ')}

Crie conceitos otimizados de thumbnail. Retorne JSON:
{
  "analise_titulo": {
    "palavras_destaque": ["palavra 1", "palavra 2"],
    "emocao_central": "curiosidade|medo|desejo|surpresa|raiva",
    "ctr_estimado_base": "baixo|medio|alto"
  },
  "conceitos": [
    {
      "numero": 1,
      "nome": "nome do conceito",
      "composicao": "descrição do layout (o que aparece onde)",
      "texto_thumbnail": "texto que aparece na imagem (max 4 palavras)",
      "cor_dominante": "cor e por que (psicologia das cores)",
      "elemento_visual_principal": "rosto com expressão X / objeto Y / símbolo Z",
      "contraste": "como criar contraste para chamar atenção",
      "psicologia": "por que este conceito gera cliques",
      "prompt_ia_geracao": "prompt para gerar esta imagem no Midjourney/DALL-E"
    }
  ],
  "conceito_recomendado": 0,
  "erros_a_evitar": ["erro 1", "erro 2"],
  "teste_a_b": "como testar thumbnails para encontrar a melhor",
  "checklist_ctr": ["elemento que aumenta CTR 1", "elemento 2", "elemento 3"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const resultado = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const melhor = resultado.conceitos?.[resultado.conceito_recomendado || 0];
    const linhas = [
      `🖼️ *Thumbnails Otimizadas — ${plataforma}*`,
      `Emoção central: ${resultado.analise_titulo?.emocao_central}\n`,
      ...resultado.conceitos.map((c, i) => [
        `${i === resultado.conceito_recomendado ? '⭐ ' : ''}*Conceito ${c.numero}: ${c.nome}*`,
        `📐 Layout: ${c.composicao}`,
        `📝 Texto: "${c.texto_thumbnail}"`,
        `🎨 Cor: ${c.cor_dominante}`,
        `💡 Psicologia: ${c.psicologia}`,
        `🤖 Prompt IA: ${c.prompt_ia_geracao}`,
        ''
      ].join('\n')),
      `✅ *Checklist CTR:*`,
      ...(resultado.checklist_ctr || []).map(c => `• ${c}`),
      `\n❌ *Evitar:*`,
      ...(resultado.erros_a_evitar || []).map(e => `• ${e}`)
    ];

    return {
      thumbnailsOtimizadas: resultado,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[ThumbnailOptimizer] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao otimizar thumbnail.' }] };
  }
}

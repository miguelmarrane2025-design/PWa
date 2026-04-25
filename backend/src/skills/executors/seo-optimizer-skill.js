// skills/executors/seo-optimizer-skill.js
// Skill: SEOOptimizer — Otimiza conteúdo para busca orgânica no YouTube e Google.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function seoOptimizerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const conteudo = params.conteudo || ctx.sessao?.ultimoTexto || '';
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const plataforma = params.plataforma || 'youtube'; // youtube|google|instagram

  if (!conteudo) {
    return { outputs: [{ tipo: 'texto', conteudo: '🔍 Informe o tema/título do conteúdo para otimizar.' }] };
  }

  let kws = [];
  try {
    const r = await webSearch(`${conteudo} ${nicho} palavras chave busca volume 2025`, { maxResultados: 5 });
    kws = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Você é um especialista em SEO para ${plataforma}.

CONTEÚDO/TEMA: "${conteudo}"
NICHO: "${nicho}"
DADOS DE MERCADO: ${kws.map(k => k.titulo).join(', ')}

Retorne JSON:
{
  "titulo_otimizado": "título com palavra-chave principal (max 60 chars para YouTube)",
  "titulo_alternativas": ["opção 2", "opção 3"],
  "palavra_chave_principal": "kw de maior volume",
  "palavras_chave_secundarias": ["kw 2", "kw 3", "kw 4", "kw 5"],
  "tags_youtube": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "descricao_otimizada": "descrição com kw principal nos primeiros 150 chars",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "capitulos_sugeridos": [
    { "tempo": "0:00", "nome": "Introdução" },
    { "tempo": "1:30", "nome": "Tópico principal" }
  ],
  "dicas_algoritmo": ["dica específica do algoritmo ${plataforma} 2025"],
  "score_seo_atual": 0-10,
  "checklist_seo": ["elemento 1", "elemento 2", "elemento 3"],
  "link_building": "como conseguir links/menções para este conteúdo"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const seo = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `🔍 *SEO Otimizado — ${plataforma}*\n`,
      `📝 *Título:* "${seo.titulo_otimizado}"`,
      `Alternativas:\n${seo.titulo_alternativas?.map(t => `  • "${t}"`).join('\n')}\n`,
      `🔑 KW Principal: "${seo.palavra_chave_principal}"`,
      `KWs Sec.: ${seo.palavras_chave_secundarias?.join(', ')}\n`,
      `🏷️ Tags: ${seo.tags_youtube?.join(', ')}\n`,
      `💡 *Dicas do Algoritmo:*`,
      ...(seo.dicas_algoritmo || []).map(d => `• ${d}`),
      `\n✅ *Checklist SEO:*`,
      ...(seo.checklist_seo || []).map(c => `• ${c}`)
    ];

    return {
      seoOtimizado: seo,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[SEOOptimizer] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro na otimização SEO.' }] };
  }
}

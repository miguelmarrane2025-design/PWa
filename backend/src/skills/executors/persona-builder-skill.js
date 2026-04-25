// skills/executors/persona-builder-skill.js
// Skill: PersonaBuilder — Constrói avatar/persona ultra-detalhada com dados reais.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function personaBuilderSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const analiseNicho = ctx.analiseNicho || {};

  log('info', `[PersonaBuilder] Nicho: ${nicho}`);

  let dadosReais = [];
  try {
    const [r1, r2] = await Promise.allSettled([
      webSearch(`perfil consumidor ${nicho} brasil comportamento compra dados 2025`, { maxResultados: 5 }),
      webSearch(`${nicho} buyer persona psicografia dores desejos 2025`, { maxResultados: 4 })
    ]);
    if (r1.status === 'fulfilled') dadosReais.push(...(r1.value?.resultados || []));
    if (r2.status === 'fulfilled') dadosReais.push(...(r2.value?.resultados || []));
  } catch {}

  const prompt = `Construa uma persona ultra-detalhada para o nicho "${nicho}" com base em dados reais.

ANÁLISE DO NICHO: ${JSON.stringify(analiseNicho).substring(0, 600)}
DADOS DE MERCADO: ${dadosReais.slice(0, 6).map(r => `• ${r.titulo}: ${r.snippet?.substring(0, 100)}`).join('\n')}

Retorne JSON:
{
  "nome": "nome fictício representativo",
  "idade": 32,
  "genero": "feminino|masculino|neutro",
  "localizacao": "cidade/região típica",
  "renda": "R$ X - R$ Y por mês",
  "escolaridade": "...",
  "profissao": "...",
  "estado_civil": "...",
  "filhos": false,
  "rotina_diaria": "como é o dia dela/dele",
  "plataformas_uso": ["Instagram", "YouTube", "TikTok"],
  "como_consome_conteudo": "quando, onde, como",
  "influenciadores_seguidos": ["tipo de influenciador 1"],
  "dores_superficiais": ["dor que admite ter 1", "dor 2"],
  "dores_profundas": ["dor que não fala mas sente 1", "dor 2"],
  "desejos_conscientes": ["o que quer conscientemente"],
  "desejos_inconscientes": ["o que quer mas não verbaliza"],
  "medos_principais": ["medo 1", "medo 2"],
  "objecoes_compra": ["por que não compra 1", "objeção 2"],
  "gatilhos_de_compra": ["o que faz comprar impulsivamente"],
  "nivel_consciencia": "inconsciente|problema|solucao|produto|mais_consciente",
  "jornada_ate_compra": "como chega até a decisão de compra",
  "linguagem_usa": ["expressões que usa no dia a dia", "gírias"],
  "como_ela_descreve_o_problema": "em suas próprias palavras",
  "o_que_ja_tentou": ["soluções que já tentou e não funcionaram"],
  "headline_que_para_ela": "headline que a faz parar o scroll",
  "copy_que_converte": "abordagem de copy que funciona com ela",
  "resumo_em_1_frase": "quem é essa pessoa em 1 frase"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const persona = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('personas', `persona_${nicho}_${Date.now()}`, persona, userId);

    const linhas = [
      `👤 *Persona: ${persona.nome}*`,
      `${persona.idade} anos | ${persona.profissao} | ${persona.localizacao}\n`,
      `💭 *Dores Profundas:*`,
      ...(persona.dores_profundas || []).map(d => `• "${d}"`),
      `\n✨ *Desejos Inconscientes:*`,
      ...(persona.desejos_inconscientes || []).map(d => `• "${d}"`),
      `\n😰 *Medos:* ${persona.medos_principais?.join(' | ')}`,
      `\n🛑 *Objeções:*`,
      ...(persona.objecoes_compra || []).map(o => `• ${o}`),
      `\n✅ *Gatilhos de Compra:*`,
      ...(persona.gatilhos_de_compra || []).map(g => `• ${g}`),
      `\n🎯 *Headline que Para Ela:*\n"${persona.headline_que_para_ela}"`,
      `\n💬 *Como ela descreve o problema:*\n"${persona.como_ela_descreve_o_problema}"`
    ];

    return {
      personaBuilt: persona,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[PersonaBuilder] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar persona.' }] };
  }
}

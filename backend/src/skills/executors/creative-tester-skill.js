// skills/executors/creative-tester-skill.js
// Skill: CreativeTester — Avalia e pontua criativos ANTES de publicar.
// Usa critérios psicológicos + dados de mercado para prever performance.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function creativeTesterSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const criativo = params.criativo || ctx.sessao?.ultimoTexto || '';
  const tipo = params.tipo || 'hook'; // hook | headline | copy | caption | ad
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const plataforma = params.plataforma || 'instagram';

  if (!criativo) {
    return { outputs: [{ tipo: 'texto', conteudo: '📝 Envie o criativo que deseja avaliar.' }] };
  }

  // Busca benchmarks do nicho
  let benchmarks = [];
  try {
    const r = await webSearch(`melhores ${tipo} ${nicho} ${plataforma} alta performance 2025`, { maxResultados: 4 });
    benchmarks = r?.resultados?.slice(0, 3) || [];
  } catch {}

  // Busca padrões que funcionaram na memória
  let padroesSalvos = [];
  try {
    padroesSalvos = await memoryMCP.buscarRelevante(`${tipo} alta conversão ${nicho}`, ['copy_patterns', 'hooks_virais'], userId, 3);
  } catch {}

  const prompt = `Você é um especialista em copy e psicologia do consumidor.
Avalie este ${tipo} para ${plataforma} no nicho "${nicho}".

${tipo.toUpperCase()}: "${criativo}"

BENCHMARKS DE MERCADO:
${benchmarks.map(b => `• ${b.titulo}: ${b.snippet?.substring(0, 100)}`).join('\n')}

PADRÕES QUE FUNCIONARAM (memória):
${padroesSalvos.map(p => JSON.stringify(p.dados).substring(0, 120)).join('\n') || 'Nenhum'}

Avalie nos critérios abaixo (0-10 cada):
{
  "score_geral": 0-10,
  "criterios": {
    "clareza": { "nota": 0-10, "justificativa": "..." },
    "gancho_emocional": { "nota": 0-10, "justificativa": "..." },
    "especificidade": { "nota": 0-10, "justificativa": "..." },
    "urgencia_curiosidade": { "nota": 0-10, "justificativa": "..." },
    "adequacao_plataforma": { "nota": 0-10, "justificativa": "..." },
    "originalidade": { "nota": 0-10, "justificativa": "..." }
  },
  "previsao_performance": "alta|media|baixa",
  "pontos_fortes": ["ponto 1", "ponto 2"],
  "pontos_fracos": ["fraqueza 1"],
  "versao_melhorada": "versão reescrita e aprimorada",
  "variante_alternativa": "abordagem completamente diferente",
  "por_que_funciona_ou_nao": "análise psicológica em 2 frases"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const avaliacao = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const stars = '⭐'.repeat(Math.round(avaliacao.score_geral / 2));
    const perfIcon = { alta: '🔥', media: '👍', baixa: '⚠️' };

    const linhas = [
      `🎯 *Avaliação de ${tipo.toUpperCase()}*`,
      `Plataforma: ${plataforma} | Nicho: ${nicho}\n`,
      `${stars} Score: ${avaliacao.score_geral}/10`,
      `${perfIcon[avaliacao.previsao_performance] || '📊'} Previsão: *${avaliacao.previsao_performance}*\n`,
      `📊 *Critérios:*`,
      ...Object.entries(avaliacao.criterios || {}).map(([k, v]) =>
        `• ${k.replace(/_/g, ' ')}: ${v.nota}/10 — ${v.justificativa}`
      ),
      `\n✅ *Pontos Fortes:*`,
      ...(avaliacao.pontos_fortes || []).map(p => `• ${p}`),
      avaliacao.pontos_fracos?.length ? `\n⚠️ *Para Melhorar:*\n${avaliacao.pontos_fracos.map(p => `• ${p}`).join('\n')}` : '',
      `\n✍️ *Versão Melhorada:*\n"${avaliacao.versao_melhorada}"`,
      `\n🔄 *Alternativa:*\n"${avaliacao.variante_alternativa}"`,
      `\n💡 ${avaliacao.por_que_funciona_ou_nao}`
    ].filter(Boolean);

    return {
      creativoAvaliado: avaliacao,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[CreativeTester] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro na avaliação.' }] };
  }
}

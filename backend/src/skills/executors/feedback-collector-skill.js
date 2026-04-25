// skills/executors/feedback-collector-skill.js
// Skill: FeedbackCollector — Coleta, parseia e estrutura feedbacks de audiência.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function feedbackCollectorSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;
  const feedbackRaw = params.feedback || ctx.sessao?.ultimoTexto || '';

  log('info', `[FeedbackCollector] Processando feedback`);

  if (!feedbackRaw) {
    return {
      outputs: [{ tipo: 'texto', conteudo: '📝 Envie o feedback que deseja analisar (comentários, DMs, respostas de alunos).' }]
    };
  }

  const prompt = `Analise este feedback de audiência e extraia insights estruturados.

FEEDBACK: "${feedbackRaw}"
NICHO: ${ctx.sessao?.nicho || 'não definido'}

Retorne JSON:
{
  "sentimento": "positivo|negativo|neutro|misto",
  "score_sentimento": -1.0 a 1.0,
  "intencao": "reclamacao|elogio|sugestao|duvida|objecao|interesse",
  "dores_identificadas": ["dor 1", "dor 2"],
  "desejos_identificados": ["desejo 1"],
  "objecoes": ["objecao 1"],
  "palavras_chave": ["kw1", "kw2"],
  "acao_recomendada": "o que fazer com este feedback",
  "pode_virar_copy": true/false,
  "copy_potencial": "trecho que pode virar prova social ou gancho",
  "urgencia": "alta|media|baixa",
  "resumo": "síntese em 1 frase"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const analise = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    // Salva na memória
    await memoryMCP.salvar('feedbacks', `fb_${Date.now()}`, {
      raw: feedbackRaw.substring(0, 500),
      analise,
      nicho: ctx.sessao?.nicho,
      coletadoEm: new Date().toISOString()
    }, userId);

    // Se pode virar copy, salva em copy_patterns também
    if (analise.pode_virar_copy && analise.copy_potencial) {
      await memoryMCP.salvar('copy_patterns', `fb_copy_${Date.now()}`, {
        tipo: 'prova_social_audiencia',
        conteudo: analise.copy_potencial,
        nicho: ctx.sessao?.nicho,
        origem: 'feedback_coletado'
      }, userId);
    }

    const icon = { positivo: '😊', negativo: '😟', neutro: '😐', misto: '🤔' };
    const linhas = [
      `📥 *Feedback Analisado*`,
      `${icon[analise.sentimento] || '📊'} ${analise.sentimento?.toUpperCase()} | ${analise.intencao}`,
      `Score: ${analise.score_sentimento > 0 ? '+' : ''}${analise.score_sentimento?.toFixed(2)}\n`,
      analise.dores_identificadas?.length ? `😣 *Dores:*\n${analise.dores_identificadas.map(d => `• ${d}`).join('\n')}` : '',
      analise.objecoes?.length ? `\n🛑 *Objeções:*\n${analise.objecoes.map(o => `• ${o}`).join('\n')}` : '',
      analise.copy_potencial ? `\n✍️ *Copy Potencial:*\n"${analise.copy_potencial}"` : '',
      `\n🎯 *Ação:* ${analise.acao_recomendada}`
    ].filter(Boolean);

    return {
      feedbackAnalisado: analise,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[FeedbackCollector] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Não foi possível processar o feedback.' }] };
  }
}

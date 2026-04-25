// skills/executors/content-scheduler-skill.js
// Skill: ContentScheduler — Cria calendário editorial estratégico e otimizado.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function contentSchedulerSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const periodo = params.periodo || '30d'; // 7d | 14d | 30d
  const plataformas = params.plataformas || ['instagram'];
  const objetivo = params.objetivo || 'crescimento';
  const estrategia = ctx.estrategiaSocial || {};

  log('info', `[ContentScheduler] ${nicho} | ${periodo}`);

  const dias = periodo === '7d' ? 7 : periodo === '14d' ? 14 : 30;

  const prompt = `Crie um calendário editorial para ${dias} dias.

NICHO: "${nicho}"
PLATAFORMAS: ${plataformas.join(', ')}
OBJETIVO: ${objetivo}
PILARES: ${JSON.stringify(estrategia.pilares_conteudo || []).substring(0, 300)}

Retorne JSON:
{
  "periodo": "${periodo}",
  "tema_do_mes": "tema central que une todos os posts",
  "calendario": [
    {
      "dia": 1,
      "data_relativa": "Segunda-feira",
      "publicacoes": [
        {
          "plataforma": "instagram",
          "formato": "reels|carrossel|stories|feed",
          "pilar": "pilar de conteúdo",
          "titulo": "título/tema do conteúdo",
          "hook": "abertura sugerida",
          "objetivo": "engajamento|tráfego|vendas|conexão",
          "melhor_horario": "HH:MM"
        }
      ]
    }
  ],
  "semanas": [
    { "semana": 1, "tema": "tema da semana 1", "foco": "topo/meio/fundo de funil" }
  ],
  "dicas_producao": ["dica para produzir em lote", "dica 2"],
  "dias_de_producao": "Segunda e Quinta para gravar tudo da semana"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const calendario = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const primeiraSemana = calendario.calendario?.slice(0, 7) || [];
    const linhas = [
      `📅 *Calendário Editorial — ${nicho}*`,
      `_${periodo} | ${plataformas.join(', ')}_`,
      `🎯 Tema do mês: "${calendario.tema_do_mes}"\n`,
      `📋 *Próximos 7 dias:*`,
      ...primeiraSemana.map(d => {
        const pubs = d.publicacoes || [];
        return `*${d.data_relativa}:*\n${pubs.map(p => `  • [${p.formato}] ${p.titulo} (${p.melhor_horario})`).join('\n')}`;
      }),
      `\n💡 *Dicas de Produção:*`,
      ...(calendario.dicas_producao || []).map(d => `• ${d}`),
      `\n⏰ Dias para gravar: ${calendario.dias_de_producao}`
    ];

    return {
      calendarioEditorial: calendario,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[ContentScheduler] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar calendário.' }] };
  }
}

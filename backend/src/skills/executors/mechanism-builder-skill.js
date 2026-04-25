// skills/executors/mechanism-builder-skill.js
// Skill: MechanismBuilder — Cria o Mecanismo Único da oferta (o "porquê funciona").
// O mecanismo é o diferencial que justifica por que SÓ você resolve o problema.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function mechanismBuilderSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const produto = ctx.produto || params.produto || {};
  const dores = ctx.analiseNicho?.dores_principais || params.dores || [];

  log('info', `[MechanismBuilder] Nicho: ${nicho}`);

  let solucoesMercado = [];
  try {
    const r = await webSearch(`soluções existentes ${nicho} como funciona método sistema`, { maxResultados: 5 });
    solucoesMercado = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Você é especialista em criação de Mecanismos Únicos para infoprodutos (conceito de Eugene Schwartz + Frank Kern).

Um Mecanismo Único é o "sistema/método/processo" proprietário que explica POR QUE sua solução funciona quando as outras não funcionam.

NICHO: "${nicho}"
PRODUTO: ${JSON.stringify(produto).substring(0, 300)}
DORES DO PÚBLICO: ${dores.slice(0, 4).join(', ')}
SOLUÇÕES DO MERCADO (concorrência): ${solucoesMercado.map(s => s.titulo).join(', ')}

Crie 3 opções de Mecanismo Único. Retorne JSON:
{
  "mecanismos": [
    {
      "nome": "Nome Proprietário™ (ex: Método das 3 Fases, Sistema X, Protocolo Y)",
      "tagline": "em 1 linha o que é",
      "por_que_funciona": "a lógica simples que qualquer um entende",
      "por_que_outros_falham": "o que a concorrência faz de errado (sem citar nomes)",
      "componentes": ["componente 1", "componente 2", "componente 3"],
      "analogia": "analogia simples para o público entender",
      "prova_logica": "por que faz sentido científico/lógico",
      "como_apresentar": "como explicar em 30 segundos",
      "hook_abertura": "frase de abertura para apresentar o mecanismo"
    }
  ],
  "mecanismo_recomendado": 0,
  "dica_de_nomeacao": "como criar nomes proprietários que convertem"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const resultado = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const melhor = resultado.mecanismos?.[resultado.mecanismo_recomendado || 0];
    await memoryMCP.salvar('mechanisms', `mec_${nicho}_${Date.now()}`, resultado, userId);

    const linhas = [
      `⚙️ *Mecanismos Únicos Criados — ${nicho}*\n`,
      ...resultado.mecanismos.map((m, i) => [
        `${i === resultado.mecanismo_recomendado ? '⭐ ' : ''}*${i+1}. ${m.nome}*`,
        `_"${m.tagline}"_`,
        `💡 Lógica: ${m.por_que_funciona}`,
        `❌ Por que outros falham: ${m.por_que_outros_falham}`,
        `🔑 Componentes: ${m.componentes?.join(' → ')}`,
        `🪝 Hook: "${m.hook_abertura}"`,
        ''
      ].join('\n')),
      `💬 *Dica de Nomeação:* ${resultado.dica_de_nomeacao}`
    ];

    return {
      mecanismoUnico: resultado,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[MechanismBuilder] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar mecanismo.' }] };
  }
}

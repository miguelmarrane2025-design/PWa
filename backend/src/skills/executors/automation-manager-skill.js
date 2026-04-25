// skills/executors/automation-manager-skill.js
// Skill: AutomationManager — Mapeia e implementa automações no negócio digital.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function automationManagerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const acao = params.acao || 'mapear'; // mapear | criar_fluxo | diagnosticar
  const processo = params.processo || ctx.sessao?.ultimoTexto || '';

  log('info', `[AutomationManager] ${acao}`);

  if (acao === 'mapear') {
    const prompt = `Mapeie TODAS as automações possíveis para um infoprodutor no nicho "${nicho}".

Retorne JSON:
{
  "automacoes_criticas": [
    {
      "nome": "nome da automação",
      "trigger": "o que dispara",
      "acao": "o que acontece automaticamente",
      "ferramenta_sugerida": "ActiveCampaign|ManyChat|Zapier|Make|etc",
      "impacto": "tempo_economizado|receita|experiencia_cliente",
      "complexidade": "simples|media|complexa",
      "roi_estimado": "X horas/mês economizadas"
    }
  ],
  "automacoes_quick_win": ["automação mais simples de implementar 1", "2"],
  "sequencias_email_essenciais": [
    { "nome": "Boas-vindas lead", "objetivo": "...", "emails": 3 }
  ],
  "fluxos_whatsapp": ["fluxo 1 sugerido", "fluxo 2"],
  "stack_automacao": {
    "basico": ["ferramenta 1 grátis/barata"],
    "avancado": ["ferramenta para escala"]
  },
  "prioridade_implementacao": ["implementar primeiro", "depois", "por último"]
}`;

    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const automacoes = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('automations', `auto_${nicho}_${Date.now()}`, automacoes, userId);

    const linhas = [
      `🤖 *Mapa de Automações — ${nicho}*\n`,
      `⚡ *Quick Wins (começar aqui):*`,
      ...(automacoes.automacoes_quick_win || []).map(a => `• ${a}`),
      `\n🔑 *Automações Críticas (${automacoes.automacoes_criticas?.length}):*`,
      ...(automacoes.automacoes_criticas || []).slice(0, 5).map(a =>
        `• *${a.nome}*\n  Trigger: ${a.trigger} → ${a.acao}\n  🛠️ ${a.ferramenta_sugerida} | ⚡ ${a.complexidade}`
      ),
      `\n📧 *Sequências Email:*`,
      ...(automacoes.sequencias_email_essenciais || []).map(s => `• ${s.nome} (${s.emails} emails)`),
      `\n📋 *Prioridade:*`,
      ...(automacoes.prioridade_implementacao || []).map((p, i) => `${i+1}. ${p}`)
    ];

    return {
      mapaAutomacoes: automacoes,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  }

  // ação: criar_fluxo
  const prompt = `Crie um fluxo de automação detalhado para: "${processo}" no nicho "${nicho}".

Retorne JSON:
{
  "nome_fluxo": "...",
  "objetivo": "...",
  "trigger": "o que inicia o fluxo",
  "passos": [
    { "passo": 1, "tipo": "email|mensagem|tag|espera|condicao", "conteudo": "...", "delay": "0h|24h|3d" }
  ],
  "ferramentas": ["ferramenta necessária"],
  "como_configurar": "passo a passo de implementação",
  "metricas_acompanhar": ["o que medir"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const fluxo = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `⚙️ *Fluxo: ${fluxo.nome_fluxo}*`,
      `🎯 ${fluxo.objetivo}\n`,
      `▶️ Trigger: ${fluxo.trigger}\n`,
      `📋 *Passos (${fluxo.passos?.length}):*`,
      ...(fluxo.passos || []).map(p => `${p.passo}. [${p.tipo}] ${p.conteudo} ${p.delay ? `(+${p.delay})` : ''}`),
      `\n🛠️ Ferramentas: ${fluxo.ferramentas?.join(', ')}`
    ];

    return {
      fluxoAutomacao: fluxo,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[AutomationManager] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar fluxo.' }] };
  }
}

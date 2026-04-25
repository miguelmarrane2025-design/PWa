// skills/executors/audience-builder-skill.js
// Skill: AudienceBuilder — Cria estratégia de construção de audiência qualificada.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function audienceBuilderSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const tamanhoAtual = params.tamanho_atual || 0;
  const meta = params.meta || 10000;
  const prazo = params.prazo || '90 dias';
  const persona = ctx.personaBuilt || params.persona || {};

  log('info', `[AudienceBuilder] ${tamanhoAtual} → ${meta} em ${prazo}`);

  let taticas = [];
  try {
    const r = await webSearch(`crescer audiência ${nicho} ${meta} seguidores ${prazo} estratégia orgânica 2025`, { maxResultados: 5 });
    taticas = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Crie um plano de construção de audiência qualificada.

NICHO: "${nicho}"
AUDIÊNCIA ATUAL: ${tamanhoAtual}
META: ${meta} em ${prazo}
PERSONA: ${JSON.stringify(persona).substring(0, 300)}
REFERÊNCIAS: ${taticas.map(t => t.titulo).join(', ')}

Retorne JSON:
{
  "diagnostico_atual": "análise da situação",
  "estrategia_central": "abordagem principal para crescimento",
  "canais_prioritarios": ["canal 1", "canal 2"],
  "taticas_crescimento": [
    {
      "tatica": "nome da tática",
      "descricao": "como executar",
      "esforco": "baixo|medio|alto",
      "resultado_esperado": "X seguidores/semana",
      "frequencia": "diária|semanal|mensal"
    }
  ],
  "lead_magnet": {
    "tipo": "ebook|checklist|minicurso|template|ferramenta",
    "titulo": "nome do lead magnet",
    "promessa": "o que entrega",
    "como_criar": "passo a passo em 1 dia"
  },
  "comunidade": {
    "plataforma": "Telegram|WhatsApp|Discord",
    "nome": "nome do grupo/comunidade",
    "regras_basicas": ["regra 1", "regra 2"],
    "como_ativar": "como manter a comunidade viva"
  },
  "colabs_sugeridas": ["tipo de criador para fazer collab", "plataforma"],
  "meta_semanal": "${Math.round((meta - tamanhoAtual) / (parseInt(prazo) || 13))} novos por semana",
  "plano_semana_1": ["ação 1 (hoje)", "ação 2", "ação 3", "ação 4", "ação 5"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const plano = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `👥 *Plano de Audiência — ${nicho}*`,
      `_${tamanhoAtual} → ${meta} em ${prazo}_\n`,
      `🎯 Estratégia: ${plano.estrategia_central}\n`,
      `📱 *Canais: ${plano.canais_prioritarios?.join(' + ')}*\n`,
      `🎁 *Lead Magnet:* ${plano.lead_magnet?.titulo}`,
      `_${plano.lead_magnet?.promessa}_\n`,
      `💬 *Comunidade:* ${plano.comunidade?.nome} (${plano.comunidade?.plataforma})\n`,
      `⚡ *Semana 1:*`,
      ...(plano.plano_semana_1 || []).map((a, i) => `${i+1}. ${a}`),
      `\n📊 Meta semanal: ${plano.meta_semanal}`
    ];

    return {
      planoAudiencia: plano,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[AudienceBuilder] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar plano.' }] };
  }
}

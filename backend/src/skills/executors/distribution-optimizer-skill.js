// skills/executors/distribution-optimizer-skill.js
// Skill: DistributionOptimizer — Maximiza o alcance de cada conteúdo produzido.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function distributionOptimizerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const conteudo = params.conteudo || ctx.sessao?.ultimoTexto || '';
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const plataformaOrigem = params.plataforma_origem || 'instagram';

  if (!conteudo) {
    return { outputs: [{ tipo: 'texto', conteudo: '📤 Descreva o conteúdo que deseja distribuir.' }] };
  }

  let algoritmoDicas = [];
  try {
    const r = await webSearch(`algoritmo ${plataformaOrigem} 2025 distribuição orgânica como aumentar alcance`, { maxResultados: 4 });
    algoritmoDicas = r?.resultados?.slice(0, 3) || [];
  } catch {}

  const prompt = `Crie um plano de distribuição máxima para este conteúdo.

CONTEÚDO: "${conteudo.substring(0, 500)}"
PLATAFORMA ORIGEM: ${plataformaOrigem}
NICHO: "${nicho}"

DICAS ATUAIS DO ALGORITMO:
${algoritmoDicas.map(a => `• ${a.titulo}: ${a.snippet?.substring(0, 100)}`).join('\n')}

Retorne JSON:
{
  "canais_primarios": [
    {
      "canal": "nome do canal",
      "acao": "o que fazer especificamente",
      "timing": "quando publicar",
      "otimizacao_algoritmo": "dica específica do algoritmo deste canal",
      "engagement_bait_etico": "como estimular engajamento organicamente"
    }
  ],
  "canais_secundarios": [
    { "canal": "WhatsApp", "acao": "compartilhar no grupo X com contexto Y" }
  ],
  "seo_otimizacao": {
    "titulo_otimizado": "título com palavra-chave",
    "descricao": "descrição otimizada",
    "tags_principais": ["tag1", "tag2", "tag3"],
    "hashtags_instagram": ["#tag1", "#tag2"]
  },
  "sequencia_publicacao": [
    { "hora": "09:00", "canal": "...", "acao": "..." }
  ],
  "amplificacao_24h": "o que fazer nas primeiras 24h para maximizar alcance",
  "cross_promotion": "como usar um canal para alavancar o outro",
  "metricas_acompanhar": ["o que monitorar nas primeiras 48h"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const plano = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `📤 *Plano de Distribuição*\n`,
      `⚡ *Primeiras 24h:* ${plano.amplificacao_24h}\n`,
      `🎯 *Canais Primários:*`,
      ...(plano.canais_primarios || []).map(c =>
        `• *${c.canal}* — ${c.acao}\n  ⏰ ${c.timing} | 📈 ${c.otimizacao_algoritmo}`
      ),
      `\n📡 *Canais Secundários:*`,
      ...(plano.canais_secundarios || []).map(c => `• ${c.canal}: ${c.acao}`),
      `\n🔗 *Cross Promotion:* ${plano.cross_promotion}`,
      `\n#️⃣ *Hashtags:* ${plano.seo_otimizacao?.hashtags_instagram?.slice(0,5).join(' ')}`
    ];

    return {
      planoDistribuicao: plano,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[DistributionOptimizer] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar plano de distribuição.' }] };
  }
}

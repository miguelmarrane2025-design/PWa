// skills/executors/social-media-strategist-skill.js
// Skill: SocialMediaStrategist — Cria estratégia completa de redes sociais.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function socialMediaStrategistSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const plataformas = params.plataformas || ['instagram', 'youtube'];
  const objetivo = params.objetivo || 'crescimento'; // crescimento|vendas|autoridade|comunidade
  const analiseNicho = ctx.analiseNicho || {};

  log('info', `[SocialMediaStrategist] ${nicho} | ${plataformas.join(', ')}`);

  let tendencias = [];
  try {
    const r = await webSearch(`estratégia ${nicho} ${plataformas[0]} crescimento orgânico 2025`, { maxResultados: 5 });
    tendencias = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Crie uma estratégia de redes sociais completa e acionável.

NICHO: "${nicho}"
PLATAFORMAS: ${plataformas.join(', ')}
OBJETIVO: ${objetivo}
ANÁLISE DO NICHO: ${JSON.stringify(analiseNicho).substring(0, 600)}
TENDÊNCIAS: ${tendencias.map(t => t.titulo).join(', ')}

Retorne JSON:
{
  "estrategia_geral": "posicionamento e abordagem central",
  "pilares_conteudo": [
    { "nome": "pilar 1", "percentual": 40, "objetivo": "para que serve", "exemplos": ["tipo 1", "tipo 2"] }
  ],
  "frequencia_ideal": {
    "instagram_reels": "X por semana",
    "instagram_carrossel": "X por semana",
    "instagram_stories": "X por dia",
    "youtube": "X por semana",
    "youtube_shorts": "X por semana"
  },
  "melhor_horario": { "instagram": "HH:MM", "youtube": "HH:MM" },
  "formatos_prioritarios": ["formato 1 para crescimento rápido", "formato 2"],
  "estrategia_hashtag": { "quantidade": 10, "mix": "3 grandes + 4 médias + 3 pequenas", "exemplos": ["#tag1", "#tag2"] },
  "rotina_semanal": [
    { "dia": "Segunda", "tarefas": ["criar X", "publicar Y"] }
  ],
  "kpis_90_dias": { "seguidores_meta": 1000, "engajamento_meta": "5%", "leads_meta": 50 },
  "conteudo_semana_1": ["post 1 sugerido", "post 2", "post 3"],
  "erros_comuns": ["erro 1 a evitar"],
  "quick_win": "o que publicar hoje para crescer rápido"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const estrategia = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('social_strategies', `strat_${nicho}_${Date.now()}`, estrategia, userId);

    const linhas = [
      `📱 *Estratégia de Redes Sociais — ${nicho}*\n`,
      `🎯 ${estrategia.estrategia_geral}\n`,
      `🏛️ *Pilares de Conteúdo:*`,
      ...(estrategia.pilares_conteudo || []).map(p => `• ${p.nome} (${p.percentual}%) — ${p.objetivo}`),
      `\n📅 *Frequência Ideal:*`,
      ...Object.entries(estrategia.frequencia_ideal || {}).map(([k, v]) => `• ${k.replace(/_/g, ' ')}: ${v}`),
      `\n⚡ *Quick Win:* ${estrategia.quick_win}`,
      `\n📝 *Semana 1:*`,
      ...(estrategia.conteudo_semana_1 || []).map(c => `• ${c}`),
      `\n🎯 *Meta 90 dias:* ${estrategia.kpis_90_dias?.seguidores_meta} seguidores | ${estrategia.kpis_90_dias?.engajamento_meta} engajamento`
    ];

    return {
      estrategiaSocial: estrategia,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[SocialMediaStrategist] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar estratégia.' }] };
  }
}

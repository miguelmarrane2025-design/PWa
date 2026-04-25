// status-skill.js — Shows system status and capabilities

export default async function statusSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;

  let preferencias = {};
  try {
    preferencias = await memoryMCP.recuperar('user_profiles', `profile_${userId}`, userId) || {};
  } catch {}

  const texto = [
    `🤖 *BotSquad v6 — Sistema Ativo*\n`,
    `**O que posso fazer:**`,
    ``,
    `🎸 **Áudio & IR**`,
    `• Upload de arquivo WAV → processamento automático`,
    `• Geração de presets (worship, gospel, ambient, rock, lead)`,
    `• Blend de múltiplos IRs`,
    `• Análise e recomendação de IRs`,
    `• Otimização para pedaleiras (HX Stomp, Helix, Kemper...)`,
    ``,
    `📝 **Conteúdo & Marketing**`,
    `• Criação de infoprodutos completos`,
    `• Geração de copy, hooks virais, ângulos`,
    `• Funis de vendas e estratégia`,
    `• Calendário editorial e distribuição`,
    ``,
    `🔍 **Pesquisa & Estratégia**`,
    `• Análise de nicho e mercado`,
    `• Builder de persona e audiência`,
    `• Análise de perfis (Instagram, TikTok, YouTube)`,
    `• Predição de tendências`,
    ``,
    `📊 **Analytics**`,
    `• Log de performance`,
    `• Análise de experimentos A/B`,
    `• Otimização de retenção e SEO`,
    ``,
    preferencias.nicho_principal
      ? `📌 *Seu nicho salvo:* ${preferencias.nicho_principal}`
      : `💡 *Dica:* Me diga seu nicho e vou personalizar as respostas.`,
  ].join('\n');

  return { outputs: [{ tipo: 'texto', conteudo: texto }] };
}

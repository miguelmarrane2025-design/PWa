// skills/executors/visual-skill.js
// Skill: VisualSkill — Dirige criação visual: carrosséis, thumbs e criativos.
// Adapter que integra workers visuais ao sistema de skills.

import { log } from '../../core/logger.js';

export default async function visualSkill(ctx, params, tools) {
  const { openaiStrong, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const tipo = params.tipo || 'carrossel'; // carrossel | thumb | criativo
  const tema = params.tema || ctx.sessao?.ultimoTema || nicho;

  log('info', `[VisualSkill] Tipo: ${tipo} | Tema: ${tema}`);

  const prompts = {
    carrossel: `Crie um roteiro de carrossel viral para Instagram sobre "${tema}" no nicho "${nicho}".
Retorne JSON:
{
  "titulo": "título do carrossel",
  "slides": [
    { "numero": 1, "tipo": "capa|conteudo|cta", "headline": "texto principal", "subtext": "texto secundário", "visual": "descrição do visual/imagem" }
  ],
  "cta": "chamada para ação final",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`,

    thumb: `Crie um briefing de thumbnail de alta CTR para "${tema}" no nicho "${nicho}".
Retorne JSON:
{
  "titulo": "texto principal da thumb",
  "subtitulo": "texto secundário (se houver)",
  "cores": { "fundo": "cor hex", "texto": "cor hex", "destaque": "cor hex" },
  "estilo": "minimalista|dramático|colorido|profissional",
  "elementos": ["elemento visual 1", "elemento visual 2"],
  "expressaoFace": "descrição da expressão facial ideal",
  "curiosidade": "elemento de curiosidade ou tensão visual",
  "scoreCtr": 1-10
}`,

    criativo: `Crie um briefing de criativo para tráfego pago sobre "${tema}" no nicho "${nicho}".
Retorne JSON:
{
  "formato": "estático|vídeo|stories",
  "hook": "frase de impacto inicial",
  "headline": "headline principal",
  "corpo": "texto do criativo",
  "cta": "botão/chamada para ação",
  "visual": "descrição detalhada do visual",
  "cores": { "primaria": "hex", "secundaria": "hex" },
  "publico": "descrição do público-alvo"
}`
  };

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompts[tipo] || prompts.carrossel }]);
    const resultado = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    if (userId) {
      await memoryMCP.salvar('visual', `ultimo_${tipo}`, resultado, userId);
    }

    const emojiMap = { carrossel: '📱', thumb: '🖼️', criativo: '🎨' };
    const emoji = emojiMap[tipo] || '🎨';

    let texto = `${emoji} *BRIEFING VISUAL — ${tipo.toUpperCase()}*\n\n`;

    if (tipo === 'carrossel' && resultado.slides) {
      texto += `📌 *${resultado.titulo}*\n\n`;
      resultado.slides.forEach(s => {
        texto += `*Slide ${s.numero} [${s.tipo}]*\n`;
        texto += `"${s.headline}"\n`;
        if (s.subtext) texto += `_${s.subtext}_\n`;
        texto += `🖼 Visual: ${s.visual}\n\n`;
      });
      texto += `🎯 CTA: ${resultado.cta}\n`;
      if (resultado.hashtags) texto += `\n${resultado.hashtags.map(h => `#${h}`).join(' ')}`;
    } else {
      texto += Object.entries(resultado)
        .map(([k, v]) => `*${k}:* ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n');
    }

    return {
      visualBrief: resultado,
      outputs: [{ tipo: 'texto', conteudo: texto }]
    };

  } catch (err) {
    log('error', `[VisualSkill] Erro: ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro no briefing visual: ${err.message}` }] };
  }
}

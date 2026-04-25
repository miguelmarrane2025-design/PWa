// skills/executors/channel-remodeler-skill.js
// Skill: ChannelRemodeler — Reformula um canal/perfil para maximizar crescimento.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function channelRemodelerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const plataforma = params.plataforma || 'instagram';
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const situacaoAtual = params.situacao || ctx.sessao?.ultimoTexto || '';
  const analisePerfilExistente = ctx.hunterData?.[0]?.analise || {};

  log('info', `[ChannelRemodeler] ${plataforma} | ${nicho}`);

  let referencias = [];
  try {
    const r = await webSearch(`bio otimizada ${nicho} ${plataforma} posicionamento crescimento 2025`, { maxResultados: 4 });
    referencias = r?.resultados?.slice(0, 3) || [];
  } catch {}

  const prompt = `Reformule completamente este canal/perfil para maximizar crescimento e conversão.

PLATAFORMA: ${plataforma}
NICHO: "${nicho}"
SITUAÇÃO ATUAL: "${situacaoAtual}"
ANÁLISE DO PERFIL EXISTENTE: ${JSON.stringify(analisePerfilExistente).substring(0, 400)}

Retorne JSON:
{
  "diagnostico": "o que está impedindo o crescimento",
  "novo_posicionamento": "como se posicionar de forma única",
  "bio_otimizada": "nova bio completa otimizada para ${plataforma}",
  "nome_perfil_sugerido": "nome/username ideal",
  "foto_perfil_conceito": "descrição do conceito visual ideal",
  "link_bio_estrategia": "como usar o link na bio",
  "highlights_sugeridos": ["nome highlight 1", "highlight 2", "highlight 3"],
  "primeiros_9_posts": ["conceito do post 1", "post 2", "..."],
  "tom_de_voz": "como deve escrever as legendas",
  "palabras_chave_perfil": ["kw para usar no nome/bio"],
  "checklist_remodelagem": ["ação 1 (urgente)", "ação 2", "ação 3", "ação 4", "ação 5"],
  "tempo_para_resultados": "expectativa realista"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const remodelagem = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `🔄 *Remodelagem de Canal — ${plataforma}*\n`,
      `🔍 Diagnóstico: ${remodelagem.diagnostico}\n`,
      `🎯 Novo Posicionamento: ${remodelagem.novo_posicionamento}\n`,
      `📝 *Nova Bio:*\n"${remodelagem.bio_otimizada}"\n`,
      `🖼️ Foto: ${remodelagem.foto_perfil_conceito}`,
      `🔗 Link Bio: ${remodelagem.link_bio_estrategia}\n`,
      `✅ *Checklist de Remodelagem:*`,
      ...(remodelagem.checklist_remodelagem || []).map((a, i) => `${i+1}. ${a}`),
      `\n⏱️ Expectativa: ${remodelagem.tempo_para_resultados}`
    ];

    return {
      remodelagemCanal: remodelagem,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[ChannelRemodeler] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro na remodelagem.' }] };
  }
}

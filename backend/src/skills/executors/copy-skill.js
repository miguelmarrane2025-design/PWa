// skills/executors/copy-skill.js
// Skill: CopySkill — Adapter que integra o squad copy-generator ao sistema de skills.
// Gera copy persuasiva para produtos, anúncios e páginas de vendas.

import { log } from '../../core/logger.js';
import { generateCopyPDF } from '../../lib/pdf-generator.js';
import { config } from '../../config/index.js';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export default async function copySkill(ctx, params, tools) {
  const { openaiStrong, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const produto = ctx.produto || params.produto || {};
  const tipoCopy = params.tipo || 'produto'; // produto | carrossel | anuncio | email

  log('info', `[CopySkill] Tipo: ${tipoCopy} | Nicho: ${nicho}`);

  const prompt = `Você é um copywriter especialista em marketing digital brasileiro.
Crie uma copy ${tipoCopy === 'anuncio' ? 'para anúncio' : tipoCopy === 'email' ? 'de email marketing' : tipoCopy === 'carrossel' ? 'para carrossel de Instagram' : 'de vendas para produto'} persuasiva e de alta conversão.

NICHO: ${nicho}
PRODUTO: ${JSON.stringify(produto).substring(0, 600)}

Retorne JSON:
{
  "headline": "headline principal irresistível",
  "subheadline": "subtítulo que complementa",
  "lead": "parágrafo de abertura que prende atenção",
  "corpo": ["parágrafo 1 (dor)", "parágrafo 2 (solução)", "parágrafo 3 (prova)"],
  "cta": "chamada para ação direta",
  "objecoes": ["objeção 1 → resposta", "objeção 2 → resposta"],
  "ps": "P.S. que reforça urgência ou bônus",
  "versaoShort": "versão curta para anúncio (até 150 chars)"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const copy = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    // Persiste no contexto e memória
    if (userId) {
      await memoryMCP.salvar('copy', `ultimo_${tipoCopy}`, copy, userId);
    }

    // Generate PDF for copy page
    let pdfDownloadUrl = null;
    try {
      const filename = `copy_${uuidv4().slice(0,8)}.pdf`;
      const pdfPath  = path.join(config.storage.output, filename);
      await generateCopyPDF(copy, pdfPath, nicho);
      const backendBase = process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000';
      pdfDownloadUrl = `${backendBase}/storage/outputs/${filename}`;
    } catch (pdfErr) {
      log('warn', `[CopySkill] PDF falhou: ${pdfErr.message}`);
    }

    const texto = [
      `📝 **COPY ${tipoCopy.toUpperCase()} — ${nicho.toUpperCase()}**\n`,
      `**${copy.headline}**`,
      copy.subheadline,
      `\n${copy.lead}`,
      ...(copy.corpo || []),
      `\n🎯 ${copy.cta}`,
      copy.ps ? `\n_${copy.ps}_` : '',
      pdfDownloadUrl ? `\n📄 **[Baixar Copy em PDF](${pdfDownloadUrl})**` : '',
    ].filter(Boolean).join('\n');

    return {
      copy,
      pdfDownloadUrl,
      outputs: [{ tipo: 'texto', conteudo: texto }]
    };

  } catch (err) {
    log('error', `[CopySkill] Erro: ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro ao gerar copy: ${err.message}` }] };
  }
}

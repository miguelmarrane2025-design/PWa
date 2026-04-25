// skills/executors/infoproduct-builder-skill.js
// Skill: InfoproductBuilder — Cria a estrutura completa de um infoproduto do zero.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';
import { generateProductPDF } from '../../lib/pdf-generator.js';
import { config } from '../../config/index.js';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export default async function infoproductBuilderSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const formato = params.formato || 'curso'; // curso | ebook | mentoria | comunidade | template
  const analiseNicho = ctx.analiseNicho || {};

  log('info', `[InfoproductBuilder] ${formato} para ${nicho}`);

  let tendencias = [];
  try {
    const r = await webSearch(`infoprodutos mais vendidos ${nicho} ${formato} hotmart 2025 estrutura`, { maxResultados: 5 });
    tendencias = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Crie a estrutura completa de um ${formato} para o nicho "${nicho}".

ANÁLISE DO NICHO: ${JSON.stringify(analiseNicho).substring(0, 800)}
REFERÊNCIAS DE MERCADO: ${tendencias.map(r => `• ${r.titulo}`).join('\n')}

Retorne JSON:
{
  "nome": "nome do produto (memorável, orientado a resultado)",
  "tagline": "subtítulo de 1 linha",
  "transformacao": "DE onde para ONDE o aluno vai",
  "resultado_especifico": "resultado mensurável em X tempo",
  "formato": "${formato}",
  "nivel": "iniciante|intermediario|avancado",
  "duracao_estimada": "X horas/semanas",
  "modulos": [
    {
      "numero": 1,
      "titulo": "Módulo 1: Nome",
      "objetivo": "o que o aluno aprende",
      "aulas": ["Aula 1.1 — ...", "Aula 1.2 — ..."],
      "entregavel": "o que o aluno terá ao final"
    }
  ],
  "bonus_internos": ["bônus 1 que faz parte do produto", "bônus 2"],
  "ferramentas_necessarias": ["ferramenta 1", "ferramenta 2"],
  "prerequisitos": ["pré-requisito 1"] ,
  "diferenciais": ["diferencial 1 vs concorrência", "diferencial 2"],
  "plataformas_sugeridas": ["Hotmart", "Kiwify"],
  "modelo_entrega": "videoaulas|pdf|ao_vivo|hibrido",
  "precificacao_sugerida": { "basico": 97, "completo": 197, "premium": 497 },
  "cronograma_producao": [
    { "semana": 1, "tarefa": "o que fazer para criar" }
  ],
  "validacao_minima": "como validar antes de produzir tudo"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const produto = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('products', `prod_${nicho}_${Date.now()}`, produto, userId);

    // Generate PDF
    let pdfPath = null;
    let pdfDownloadUrl = null;
    try {
      const filename = `produto_${uuidv4().slice(0,8)}.pdf`;
      pdfPath = path.join(config.storage.output, filename);
      await generateProductPDF(produto, pdfPath);
      const backendBase = process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000';
      pdfDownloadUrl = `${backendBase}/storage/outputs/${filename}`;
      log('info', `[InfoproductBuilder] PDF gerado: ${filename}`);
    } catch (pdfErr) {
      log('warn', `[InfoproductBuilder] PDF falhou (pdfkit instalado?): ${pdfErr.message}`);
    }

    const linhas = [
      `📚 **${produto.nome}**`,
      `_"${produto.tagline}"_
`,
      `🎯 **Transformação:** ${produto.transformacao}`,
      `✅ **Resultado:** ${produto.resultado_especifico}
`,
      `📋 **Estrutura (${produto.modulos?.length} módulos):**`,
      ...(produto.modulos || []).map(m => `- **${m.titulo}** — ${m.objetivo}`),
      `
🎁 **Bônus:** ${produto.bonus_internos?.join(', ')}`,
      `💰 **Preços:** R$${produto.precificacao_sugerida?.basico} · R$${produto.precificacao_sugerida?.completo} · R$${produto.precificacao_sugerida?.premium}`,
      `
⚡ **Validação mínima:** ${produto.validacao_minima}`,
      pdfDownloadUrl ? `
📄 **[Baixar PDF completo](${pdfDownloadUrl})**` : '',
    ].filter(Boolean);

    return {
      produto,
      pdfPath,
      pdfDownloadUrl,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[InfoproductBuilder] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar estrutura do produto.' }] };
  }
}

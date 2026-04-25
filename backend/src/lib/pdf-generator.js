// lib/pdf-generator.js
// ─────────────────────────────────────────────────────────────────────────
// Professional PDF generation for infoproduct structures.
// Uses pdfkit. Produces clean, branded documents ready for distribution.
//
// Exports:
//   generateProductPDF(produto, outputPath)  → writes PDF to outputPath
//   generateCopyPDF(copy, outputPath)        → writes copy page PDF
// ─────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'fs';
import path               from 'path';
import { config }         from '../config/index.js';
import { logger }         from './logger.js';

// Lazy-load pdfkit to avoid crash if not installed yet
async function getPDFDoc(opts = {}) {
  try {
    const PDFDocument = (await import('pdfkit')).default;
    return new PDFDocument({ ...opts, autoFirstPage: false });
  } catch (err) {
    throw new Error(`pdfkit not available: ${err.message}. Run: npm install pdfkit`);
  }
}

// ── Color palette ─────────────────────────────────────────────────────────
const C = {
  brand:   '#6366F1',  // indigo
  dark:    '#111827',
  mid:     '#374151',
  light:   '#6B7280',
  bg:      '#F9FAFB',
  white:   '#FFFFFF',
  accent:  '#10B981',  // emerald
  warn:    '#F59E0B',
};

function _writePDF(doc, outputPath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => fs.writeFile(outputPath, Buffer.concat(chunks)).then(resolve).catch(reject));
    doc.on('error', reject);
    doc.end();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function header(doc, title, subtitle = '') {
  doc.rect(0, 0, doc.page.width, 80).fill(C.brand);
  doc.fillColor(C.white).fontSize(22).font('Helvetica-Bold')
     .text(title, 40, 25, { width: doc.page.width - 80 });
  if (subtitle) {
    doc.fontSize(11).font('Helvetica')
       .text(subtitle, 40, 52, { width: doc.page.width - 80 });
  }
  doc.fillColor(C.dark).moveDown(0);
}

function sectionTitle(doc, text) {
  doc.moveDown(0.8)
     .fillColor(C.brand).fontSize(13).font('Helvetica-Bold')
     .text(text)
     .fillColor(C.dark).fontSize(10).font('Helvetica');
}

function bullet(doc, text, indent = 20) {
  const y = doc.y;
  doc.fillColor(C.accent).fontSize(8).text('•', 40 + indent, y)
     .fillColor(C.mid).fontSize(10).text(text, 60 + indent, y, { width: doc.page.width - 100 - indent });
}

function twoCol(doc, label, value) {
  const y = doc.y;
  doc.fillColor(C.light).fontSize(9).font('Helvetica-Bold')
     .text(label.toUpperCase(), 40, y, { width: 130 })
     .fillColor(C.dark).fontSize(10).font('Helvetica')
     .text(String(value ?? '—'), 175, y, { width: doc.page.width - 215 });
  doc.moveDown(0.3);
}

// ── Main export: infoproduct structure PDF ────────────────────────────────
export async function generateProductPDF(produto, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const doc = await getPDFDoc({ size: 'A4', margins: { top: 95, bottom: 50, left: 40, right: 40 } });

  // ── Page 1: Cover ───────────────────────────────────────────────────────
  doc.addPage();
  // Brand strip
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.dark);
  doc.rect(0, 0, doc.page.width, 8).fill(C.brand);
  doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(C.brand);

  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;

  doc.fillColor(C.white).fontSize(32).font('Helvetica-Bold')
     .text(produto.nome || 'Infoproduto', 0, cy - 80, { align: 'center', width: doc.page.width });

  doc.fillColor(C.brand).fontSize(14).font('Helvetica')
     .text(produto.tagline || '', 0, cy - 30, { align: 'center', width: doc.page.width });

  doc.fillColor(C.accent).fontSize(11)
     .text(`Formato: ${(produto.formato || '').toUpperCase()} · Nível: ${produto.nivel || ''}`, 0, cy + 20, { align: 'center', width: doc.page.width });

  doc.fillColor('#4B5563').fontSize(9)
     .text(`Gerado por BotSquad · ${new Date().toLocaleDateString('pt-BR')}`, 0, doc.page.height - 40, { align: 'center', width: doc.page.width });

  // ── Page 2: Overview ────────────────────────────────────────────────────
  doc.addPage();
  header(doc, produto.nome, produto.tagline);

  doc.y = 100;
  sectionTitle(doc, '🎯 Transformação prometida');
  doc.fillColor(C.mid).fontSize(10).text(produto.transformacao || '', { indent: 20 });

  sectionTitle(doc, '✅ Resultado específico');
  doc.fillColor(C.mid).fontSize(10).text(produto.resultado_especifico || '', { indent: 20 });

  sectionTitle(doc, '📋 Visão geral');
  twoCol(doc, 'Duração estimada',  produto.duracao_estimada);
  twoCol(doc, 'Modelo de entrega', produto.modelo_entrega);
  twoCol(doc, 'Plataformas',       (produto.plataformas_sugeridas || []).join(', '));
  twoCol(doc, 'Validação mínima',  produto.validacao_minima);

  // Pricing box
  sectionTitle(doc, '💰 Precificação sugerida');
  const p = produto.precificacao_sugerida || {};
  const boxY = doc.y;
  ['basico', 'completo', 'premium'].forEach((tier, i) => {
    if (!p[tier]) return;
    const bx = 40 + i * 160;
    doc.rect(bx, boxY, 150, 50).fill(i === 1 ? C.brand : C.bg).stroke(C.brand);
    doc.fillColor(i === 1 ? C.white : C.brand).fontSize(9).font('Helvetica-Bold')
       .text(tier.toUpperCase(), bx + 10, boxY + 8, { width: 130, align: 'center' });
    doc.fillColor(i === 1 ? C.white : C.dark).fontSize(18).font('Helvetica-Bold')
       .text(`R$ ${p[tier]}`, bx + 10, boxY + 22, { width: 130, align: 'center' });
  });
  doc.y = boxY + 60;

  // Diferenciais
  if (produto.diferenciais?.length) {
    sectionTitle(doc, '⭐ Diferenciais');
    produto.diferenciais.forEach(d => bullet(doc, d));
  }

  // ── Page(s) 3+: Modules ─────────────────────────────────────────────────
  doc.addPage();
  header(doc, 'Estrutura de Módulos', produto.nome);
  doc.y = 100;

  for (const m of produto.modulos || []) {
    if (doc.y > doc.page.height - 120) { doc.addPage(); header(doc, 'Estrutura de Módulos (cont.)', produto.nome); doc.y = 100; }

    doc.fillColor(C.brand).fontSize(12).font('Helvetica-Bold')
       .text(`${m.titulo}`, 40, doc.y);
    doc.fillColor(C.light).fontSize(9).font('Helvetica')
       .text(`Objetivo: ${m.objetivo || ''}`, 40, doc.y, { indent: 10 });
    doc.moveDown(0.3);

    (m.aulas || []).forEach(a => bullet(doc, a, 10));

    if (m.entregavel) {
      doc.fillColor(C.accent).fontSize(9).font('Helvetica-Bold')
         .text(`  → Entregável: `, 40, doc.y, { continued: true })
         .font('Helvetica').fillColor(C.mid).text(m.entregavel);
    }
    doc.moveDown(0.5);
  }

  // ── Page: Bonuses + Timeline ─────────────────────────────────────────────
  doc.addPage();
  header(doc, 'Bônus & Cronograma', produto.nome);
  doc.y = 100;

  if (produto.bonus_internos?.length) {
    sectionTitle(doc, '🎁 Bônus internos');
    produto.bonus_internos.forEach(b => bullet(doc, b));
  }

  if (produto.ferramentas_necessarias?.length) {
    sectionTitle(doc, '🛠️ Ferramentas necessárias');
    produto.ferramentas_necessarias.forEach(f => bullet(doc, f));
  }

  if (produto.cronograma_producao?.length) {
    sectionTitle(doc, '📅 Cronograma de produção');
    produto.cronograma_producao.forEach(c => {
      doc.fillColor(C.brand).fontSize(9).font('Helvetica-Bold')
         .text(`Semana ${c.semana}: `, 40, doc.y, { continued: true })
         .font('Helvetica').fillColor(C.mid).text(c.tarefa || '');
    });
  }

  await _writePDF(doc, outputPath);
  logger.info(`[PDFGenerator] Product PDF: ${path.basename(outputPath)}`);
  return outputPath;
}

// ── Copy page PDF ─────────────────────────────────────────────────────────
export async function generateCopyPDF(copy, outputPath, nicho = '') {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const doc = await getPDFDoc({ size: 'A4', margins: { top: 95, bottom: 50, left: 40, right: 40 } });

  doc.addPage();
  header(doc, 'Copy de Vendas', nicho ? `Nicho: ${nicho}` : '');
  doc.y = 105;

  sectionTitle(doc, '📌 Headline');
  doc.fillColor(C.dark).fontSize(16).font('Helvetica-Bold')
     .text(copy.headline || '', { indent: 10 });
  doc.fillColor(C.mid).fontSize(12).font('Helvetica')
     .text(copy.subheadline || '', { indent: 10 });

  sectionTitle(doc, '📝 Lead');
  doc.fillColor(C.mid).fontSize(10).font('Helvetica')
     .text(copy.lead || '', { indent: 10 });

  sectionTitle(doc, '💬 Corpo');
  (copy.corpo || []).forEach((p, i) => {
    doc.moveDown(0.3).fillColor(C.mid).fontSize(10).text(p, { indent: 10 });
  });

  sectionTitle(doc, '🎯 CTA');
  doc.rect(40, doc.y, doc.page.width - 80, 40).fill(C.brand);
  doc.fillColor(C.white).fontSize(14).font('Helvetica-Bold')
     .text(copy.cta || '', 40, doc.y - 35, { width: doc.page.width - 80, align: 'center' });
  doc.y += 15;

  if (copy.objecoes?.length) {
    sectionTitle(doc, '❓ Objeções respondidas');
    copy.objecoes.forEach(o => bullet(doc, o));
  }

  if (copy.ps) {
    sectionTitle(doc, 'P.S.');
    doc.fillColor(C.mid).fontSize(10).font('Helvetica-Bold').text(copy.ps, { indent: 10 });
  }

  await _writePDF(doc, outputPath);
  logger.info(`[PDFGenerator] Copy PDF: ${path.basename(outputPath)}`);
  return outputPath;
}

// skills/executors/offer-builder-skill.js
// Skill: OfferBuilder — Constrói ofertas irresistíveis com stack de valor completo.
// Usa frameworks como Value Equation, Hormozi Stack e dados de mercado real.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function offerBuilderSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const produto = ctx.produto || params.produto || {};
  const analiseNicho = ctx.analiseNicho || {};

  log('info', `[OfferBuilder] Construindo oferta para: ${nicho}`);

  // Busca ofertas de referência no mercado
  let referencias = [];
  try {
    const r = await webSearch(`oferta irresistível infoproduto ${nicho} hotmart kiwify 2025 bônus`, { maxResultados: 5 });
    referencias = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Você é um especialista em construção de ofertas usando o método Hormozi (Value Equation).
Construa uma oferta irresistível para o nicho "${nicho}".

PRODUTO/SERVIÇO: ${JSON.stringify(produto)}
ANÁLISE DO NICHO: ${JSON.stringify(analiseNicho).substring(0, 800)}
REFERÊNCIAS DE MERCADO:
${referencias.map(r => `• ${r.titulo}: ${r.snippet?.substring(0, 100)}`).join('\n')}

Retorne JSON com a oferta completa:
{
  "nome_produto": "nome poderoso e memorável",
  "promessa_principal": "resultado específico em tempo definido sem X",
  "subpromessa": "promessa secundária de apoio",
  "mecanismo_unico": "o que torna esta oferta diferente de todas as outras",
  "stack_valor": [
    { "item": "produto principal", "valor_percebido": 497, "descricao": "o que é e entrega" },
    { "item": "bônus 1 relevante", "valor_percebido": 197, "descricao": "por que é valioso" },
    { "item": "bônus 2 urgente", "valor_percebido": 97, "descricao": "..." },
    { "item": "bônus 3 limitado", "valor_percebido": 147, "descricao": "..." }
  ],
  "valor_total_percebido": 938,
  "preco_oferta": 197,
  "preco_original": 497,
  "economia_percentual": 60,
  "garantia": { "tipo": "incondicional|condicional", "dias": 30, "texto": "..." },
  "escassez": { "tipo": "tempo|vagas|bônus", "descricao": "elemento de urgência real" },
  "para_quem": "descrição do avatar ideal",
  "nao_para_quem": "quem NÃO deve comprar (aumenta confiança)",
  "cta_principal": "botão/chamada de ação",
  "headline_oferta": "título da página de vendas",
  "subheadline_oferta": "subtítulo de suporte",
  "order_bump_sugerido": { "nome": "...", "preco": 27, "descricao": "..." },
  "upsell_sugerido": { "nome": "...", "preco": 397, "descricao": "..." }
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const oferta = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('offers', `offer_${nicho}_${Date.now()}`, oferta, userId);

    const valorTotal = oferta.stack_valor?.reduce((sum, i) => sum + (i.valor_percebido || 0), 0);
    const roi = ((valorTotal / oferta.preco_oferta) || 1).toFixed(1);

    const linhas = [
      `💰 *Oferta Construída: ${oferta.nome_produto}*\n`,
      `🎯 Promessa: _${oferta.promessa_principal}_\n`,
      `⚡ Mecanismo Único: ${oferta.mecanismo_unico}\n`,
      `📦 *Stack de Valor (${oferta.stack_valor?.length} itens):*`,
      ...(oferta.stack_valor || []).map(i => `• ${i.item} — R$ ${i.valor_percebido}`),
      `\n💎 Valor Total Percebido: R$ ${oferta.valor_total_percebido}`,
      `🏷️ Preço da Oferta: *R$ ${oferta.preco_oferta}* ~~R$ ${oferta.preco_original}~~`,
      `📈 ROI para o cliente: ${roi}x o investimento\n`,
      `🛡️ Garantia: ${oferta.garantia?.dias} dias — "${oferta.garantia?.texto}"`,
      `⏰ Escassez: ${oferta.escassez?.descricao}\n`,
      `🛒 Order Bump: ${oferta.order_bump_sugerido?.nome} — R$ ${oferta.order_bump_sugerido?.preco}`,
      `⬆️ Upsell: ${oferta.upsell_sugerido?.nome} — R$ ${oferta.upsell_sugerido?.preco}`
    ];

    return {
      oferta,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[OfferBuilder] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao construir oferta.' }] };
  }
}

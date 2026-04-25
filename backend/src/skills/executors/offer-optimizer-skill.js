// skills/executors/offer-optimizer-skill.js
// Skill: OfferOptimizer — Analisa e otimiza ofertas existentes que não estão convertendo.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function offerOptimizerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const ofertaAtual = params.oferta || ctx.oferta || {};
  const problema = params.problema || ctx.sessao?.ultimoTexto || 'não está convertendo';
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';

  log('info', `[OfferOptimizer] Otimizando oferta: ${problema}`);

  let benchmarks = [];
  try {
    const r = await webSearch(`oferta alta conversão ${nicho} taxa conversão otimização 2025`, { maxResultados: 5 });
    benchmarks = r?.resultados?.slice(0, 4) || [];
  } catch {}

  const prompt = `Você é um especialista em otimização de ofertas e CRO (Conversion Rate Optimization).

OFERTA ATUAL: ${JSON.stringify(ofertaAtual).substring(0, 600)}
PROBLEMA RELATADO: "${problema}"
NICHO: "${nicho}"

BENCHMARKS: ${benchmarks.map(b => `• ${b.titulo}: ${b.snippet?.substring(0, 100)}`).join('\n')}

Diagnostique e otimize esta oferta. Retorne JSON:
{
  "diagnostico": {
    "problema_raiz": "qual é o verdadeiro problema",
    "hipoteses": ["hipótese 1", "hipótese 2", "hipótese 3"],
    "score_oferta_atual": 0-10
  },
  "otimizacoes_prioritarias": [
    {
      "elemento": "headline|preco|garantia|bonus|cta|stack|escassez",
      "problema_atual": "o que está errado",
      "solucao": "como corrigir",
      "impacto_esperado": "alto|medio|baixo",
      "implementacao": "como implementar em menos de 1h"
    }
  ],
  "headline_otimizada": "nova versão da headline",
  "cta_otimizado": "novo CTA",
  "garantia_otimizada": "como reframing da garantia pode ajudar",
  "ajuste_preco": { "recomendacao": "manter|subir|descer|testar", "justificativa": "..." },
  "bonus_faltando": "qual bônus adicionaria mais valor percebido",
  "quick_fix": "a única mudança que pode dobrar conversão imediatamente",
  "teste_ab_sugerido": { "elemento": "...", "variante_a": "...", "variante_b": "..." }
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const otimizacao = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `🔧 *Otimização de Oferta*\n`,
      `🔍 Problema raiz: ${otimizacao.diagnostico?.problema_raiz}`,
      `📊 Score atual: ${otimizacao.diagnostico?.score_oferta_atual}/10\n`,
      `⚡ *Quick Fix (faça agora):*`,
      `"${otimizacao.quick_fix}"\n`,
      `🎯 *Otimizações Prioritárias:*`,
      ...(otimizacao.otimizacoes_prioritarias || []).slice(0, 4).map(o =>
        `• [${o.impacto_esperado?.toUpperCase()}] ${o.elemento}: ${o.solucao}`
      ),
      `\n✍️ *Headline Otimizada:*\n"${otimizacao.headline_otimizada}"`,
      `\n🛡️ *Garantia:* ${otimizacao.garantia_otimizada}`,
      `\n🎁 *Bônus Faltando:* ${otimizacao.bonus_faltando}`,
      `\n🧪 *Teste A/B Sugerido:* "${otimizacao.teste_ab_sugerido?.variante_b}" vs atual`
    ];

    return {
      ofertaOtimizada: otimizacao,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[OfferOptimizer] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao otimizar oferta.' }] };
  }
}

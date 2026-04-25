// skills/executors/funnel-architect-skill.js
// Skill: FunnelArchitect — Projeta funis de vendas completos e otimizados.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function funnelArchitectSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const tipo = params.tipo || 'lancamento'; // lancamento | perpétuo | webinar | desafio | consultoria
  const oferta = ctx.oferta || params.oferta || {};

  log('info', `[FunnelArchitect] Tipo: ${tipo} | Nicho: ${nicho}`);

  const prompt = `Projete um funil de vendas ${tipo} completo e otimizado para o nicho "${nicho}".

OFERTA: ${JSON.stringify(oferta).substring(0, 500)}

Retorne JSON com o funil completo:
{
  "tipo": "${tipo}",
  "nome_funil": "nome descritivo",
  "objetivo": "resultado esperado do funil",
  "etapas": [
    {
      "numero": 1,
      "nome": "nome da etapa",
      "tipo": "topo|meio|fundo",
      "canal": "onde acontece (instagram|youtube|email|telegram|whatsapp|página)",
      "conteudo": "o que criar/enviar",
      "objetivo_etapa": "o que precisa acontecer aqui",
      "kpi_principal": "o que medir",
      "tempo": "duração desta etapa",
      "copy_sugerida": "exemplo de mensagem ou CTA"
    }
  ],
  "sequencia_email": [
    { "dia": 0, "assunto": "...", "objetivo": "...", "tipo": "boas_vindas|valor|prova_social|venda|urgencia" }
  ],
  "metricas_saude": {
    "taxa_abertura_email_alvo": "40%",
    "taxa_clique_alvo": "5%",
    "taxa_conversao_alvo": "2%",
    "custo_aquisicao_maximo": "R$ valor"
  },
  "ferramentas_necessarias": ["ActiveCampaign", "Hotmart", "..."],
  "tempo_total_implementacao": "X semanas",
  "quick_wins": ["o que implementar primeiro para ter resultados rápidos"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const funil = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    await memoryMCP.salvar('funnels', `funil_${tipo}_${Date.now()}`, funil, userId);

    const linhas = [
      `🔧 *Funil: ${funil.nome_funil}*`,
      `_${funil.objetivo}_\n`,
      `📊 *Etapas (${funil.etapas?.length}):*`,
      ...(funil.etapas || []).map(e =>
        `${e.numero}. *${e.nome}* [${e.tipo}]\n   📍 ${e.canal} → ${e.objetivo_etapa}\n   📏 KPI: ${e.kpi_principal}`
      ),
      `\n📧 *Sequência de Email (${funil.sequencia_email?.length} emails):*`,
      ...(funil.sequencia_email || []).slice(0, 5).map(e => `D+${e.dia}: ${e.assunto} [${e.tipo}]`),
      `\n🎯 *Meta de Conversão:* ${funil.metricas_saude?.taxa_conversao_alvo}`,
      `⚡ *Quick Wins:*\n${funil.quick_wins?.slice(0,2).map(q => `• ${q}`).join('\n')}`
    ];

    return {
      funilCompleto: funil,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[FunnelArchitect] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao projetar funil.' }] };
  }
}

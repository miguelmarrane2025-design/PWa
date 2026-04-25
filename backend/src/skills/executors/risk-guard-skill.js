// skills/executors/risk-guard-skill.js
// Skill: RiskGuard — Detecta e previne riscos em copy, ofertas e estratégias.
// Verifica conformidade, promessas exageradas, claims ilegais e proteção de dados.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function riskGuardSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;
  const conteudo = params.conteudo || ctx.copy?.headline || ctx.sessao?.ultimoTexto || '';
  const tipo = params.tipo || 'copy'; // copy | oferta | campanha | email | anuncio
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';

  if (!conteudo) {
    return { outputs: [{ tipo: 'texto', conteudo: '🛡️ Envie o conteúdo que deseja verificar.' }] };
  }

  log('info', `[RiskGuard] Analisando ${tipo}`);

  const prompt = `Você é um especialista em compliance para marketing digital no Brasil.
Analise os riscos neste ${tipo} para o nicho "${nicho}".

CONTEÚDO:
"${conteudo.substring(0, 1500)}"

Verifique especificamente:
1. PROCON/CONAR — publicidade enganosa, promessas abusivas
2. LGPD — coleta de dados, privacidade
3. Plataformas — Meta Ads, Google Ads, políticas para o app
4. Claims não comprovados — "ganhe X por mês", "emagreça X kg em Y dias"
5. Testemunhos e resultados atípicos não declarados
6. Garantias ilegais ou promessas de resultado certo

Retorne JSON:
{
  "score_risco": 0-10,
  "nivel_risco": "baixo|medio|alto|critico",
  "riscos_identificados": [
    {
      "tipo": "CONAR|LGPD|Meta_Ads|Google_Ads|Juridico|Credibilidade",
      "descricao": "o que está problemático",
      "trecho_problema": "trecho exato do conteúdo",
      "consequencia_potencial": "o que pode acontecer",
      "severidade": "baixa|media|alta|critica"
    }
  ],
  "aprovado_para_publicar": true/false,
  "ajustes_obrigatorios": ["mudança necessária 1", "mudança 2"],
  "ajustes_recomendados": ["melhoria opcional 1"],
  "versao_segura": "versão reescrita e segura do conteúdo problemático",
  "disclaimer_necessario": "texto de disclaimer se necessário ou null",
  "ok_meta_ads": true/false,
  "ok_google_ads": true/false,
  "dica_compliance": "principal dica de compliance para este nicho"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const analise = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    // Salva histórico de verificações
    await memoryMCP.salvar('risk_checks', `risk_${Date.now()}`, {
      tipo, nicho,
      score_risco: analise.score_risco,
      aprovado: analise.aprovado_para_publicar,
      verificadoEm: new Date().toISOString()
    }, userId);

    const icons = { baixo: '🟢', medio: '🟡', alto: '🟠', critico: '🔴' };
    const icon = icons[analise.nivel_risco] || '⚪';

    const linhas = [
      `🛡️ *Risk Guard — ${tipo.toUpperCase()}*\n`,
      `${icon} Nível de Risco: *${analise.nivel_risco?.toUpperCase()}* (${analise.score_risco}/10)`,
      `${analise.aprovado_para_publicar ? '✅ APROVADO para publicar' : '❌ NÃO APROVADO — ajustes necessários'}\n`,
      analise.riscos_identificados?.length > 0 ? `⚠️ *Riscos (${analise.riscos_identificados.length}):*` : '✅ Nenhum risco crítico identificado',
      ...(analise.riscos_identificados || []).map(r =>
        `• [${r.severidade?.toUpperCase()}] ${r.tipo}: ${r.descricao}\n  Trecho: _"${r.trecho_problema?.substring(0, 80)}"_`
      ),
      analise.ajustes_obrigatorios?.length > 0 ? `\n🔧 *Ajustes Obrigatórios:*\n${analise.ajustes_obrigatorios.map(a => `• ${a}`).join('\n')}` : '',
      analise.versao_segura ? `\n✍️ *Versão Segura:*\n"${analise.versao_segura}"` : '',
      `\n📱 Meta Ads: ${analise.ok_meta_ads ? '✅' : '❌'} | Google Ads: ${analise.ok_google_ads ? '✅' : '❌'}`,
      analise.disclaimer_necessario ? `\n📋 Disclaimer necessário:\n_${analise.disclaimer_necessario}_` : '',
      `\n💡 ${analise.dica_compliance}`
    ].filter(Boolean);

    return {
      riskAnalysis: analise,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[RiskGuard] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro na verificação de risco.' }] };
  }
}

// skills/executors/retention-optimizer-skill.js
// Skill: RetentionOptimizer — Otimiza scripts de vídeo para máxima retenção.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function retentionOptimizerSkill(ctx, params, tools) {
  const { webSearch, memoryMCP } = tools;
  const userId = ctx.userId;
  const script = params.script || ctx.sessao?.ultimoTexto || '';
  const duracao = params.duracao || '60s'; // 30s | 60s | 3min | 10min
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';
  const plataforma = params.plataforma || 'reels';

  if (!script) {
    return { outputs: [{ tipo: 'texto', conteudo: '📜 Envie o script que deseja otimizar para retenção.' }] };
  }

  const prompt = `Você é um especialista em retenção de vídeos. Otimize este script para máxima retenção.

SCRIPT: "${script.substring(0, 1500)}"
DURAÇÃO: ${duracao}
PLATAFORMA: ${plataforma}
NICHO: "${nicho}"

Retorne JSON:
{
  "diagnostico": {
    "pontos_de_queda_provavel": ["onde o espectador provavelmente vai embora"],
    "score_retencao_atual": 0-10,
    "problema_principal": "maior problema de retenção"
  },
  "script_otimizado": {
    "hook_0_3s": "os primeiros 3 segundos reescritos",
    "desenvolvimento_otimizado": "corpo do vídeo com loops e padrões de retenção",
    "cta_final": "fechamento que gera ação"
  },
  "tecnicas_aplicadas": [
    { "tecnica": "nome", "onde_aplicar": "segundo X-Y", "descricao": "como implementar" }
  ],
  "open_loops": ["loop aberto 1 (cria curiosidade)", "loop 2"],
  "pattern_interrupts": ["interrupção visual/sonora sugerida no segundo X"],
  "palavras_de_retencao": ["palavras que seguram (mas, porém, espere, então)"],
  "elementos_visuais": ["o que mostrar na tela para prender", "elemento 2"],
  "score_estimado_pos_otimizacao": 0-10,
  "checklist_retencao": ["elemento 1 para alta retenção", "elemento 2"]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const otimizacao = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `🎬 *Otimização de Retenção — ${plataforma}*\n`,
      `📊 Score atual: ${otimizacao.diagnostico?.score_retencao_atual}/10`,
      `📈 Score pós-otimização: ${otimizacao.score_estimado_pos_otimizacao}/10\n`,
      `⚠️ Problema: ${otimizacao.diagnostico?.problema_principal}\n`,
      `🎣 *Hook 0-3s (reescrito):*\n"${otimizacao.script_otimizado?.hook_0_3s}"\n`,
      `🔄 *Open Loops criados:*`,
      ...(otimizacao.open_loops || []).map(l => `• "${l}"`),
      `\n⚡ *Técnicas Aplicadas:*`,
      ...(otimizacao.tecnicas_aplicadas || []).slice(0, 4).map(t => `• ${t.tecnica}: ${t.descricao}`),
      `\n✅ *Checklist Retenção:*`,
      ...(otimizacao.checklist_retencao || []).map(c => `• ${c}`)
    ];

    return {
      scriptOtimizado: otimizacao,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[RetentionOptimizer] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao otimizar retenção.' }] };
  }
}

// skills/executors/knowledge-manager-skill.js
// Skill: KnowledgeManager — Gerencia a base de conhecimento do bot.
// Permite consultar, exportar, limpar e organizar tudo que foi aprendido.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function knowledgeManagerSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;
  const acao = params.acao || 'resumo'; // resumo | buscar | exportar | limpar_categoria | stats

  log('info', `[KnowledgeManager] Ação: ${acao}`);

  if (acao === 'resumo' || acao === 'stats') {
    const resumo = await memoryMCP.consolidarMemoria(userId);
    const resumoGlobal = await memoryMCP.consolidarMemoria('global');

    const linhas = [
      `🗄️ *Base de Conhecimento*\n`,
      `👤 *Seus dados:*`,
      ...Object.entries(resumo).map(([cat, info]) =>
        `• ${cat}: ${info.total} registros — _${info.categoriaDescricao}_`
      ),
      `\n🌐 *Base Global (compartilhada):*`,
      ...Object.entries(resumoGlobal).map(([cat, info]) =>
        `• ${cat}: ${info.total} registros`
      )
    ];

    return { outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }] };

  } else if (acao === 'buscar') {
    const consulta = params.consulta || ctx.sessao?.ultimoTexto || '';
    if (!consulta) return { outputs: [{ tipo: 'texto', conteudo: '❓ Informe o que deseja buscar.' }] };

    const resultados = await memoryMCP.buscarRelevante(consulta, null, userId, 5);

    if (resultados.length === 0) {
      return { outputs: [{ tipo: 'texto', conteudo: `🔍 Nenhum resultado para "${consulta}" na memória.` }] };
    }

    const linhas = [
      `🔍 *Resultados para: "${consulta}"*\n`,
      ...resultados.map((r, i) =>
        `${i+1}. [${r.categoria}] ${r.chave}\n   _${JSON.stringify(r.dados).substring(0, 100)}_\n   Relevância: ${(r.relevancia * 100).toFixed(0)}%`
      )
    ];

    return { outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }] };

  } else if (acao === 'exportar') {
    const categorias = params.categorias || ['copy_patterns', 'hooks_virais', 'niche_insights'];
    const dados = {};

    for (const cat of categorias) {
      dados[cat] = await memoryMCP.recuperarCategoria(cat, userId, 50);
    }

    const resumoExport = {
      exportadoEm: new Date().toISOString(),
      userId,
      total_categorias: categorias.length,
      total_registros: Object.values(dados).reduce((sum, d) => sum + Object.keys(d).length, 0),
      dados
    };

    await memoryMCP.salvar('exports', `export_${Date.now()}`, resumoExport, userId);

    return {
      dadosExportados: resumoExport,
      outputs: [{
        tipo: 'texto',
        conteudo: `📦 *Export Gerado*\n\n${categorias.map(c => `• ${c}: ${Object.keys(dados[c] || {}).length} registros`).join('\n')}\n\nTotal: ${resumoExport.total_registros} registros exportados`
      }]
    };

  } else if (acao === 'limpar_categoria') {
    const categoria = params.categoria;
    if (!categoria) return { outputs: [{ tipo: 'texto', conteudo: '❌ Informe a categoria a limpar.' }] };

    // Salva backup antes de limpar
    const backup = await memoryMCP.recuperarCategoria(categoria, userId, 999);
    await memoryMCP.salvar('backups', `backup_${categoria}_${Date.now()}`, backup, userId);

    return {
      outputs: [{
        tipo: 'texto',
        conteudo: `🗑️ Categoria "${categoria}" marcada para limpeza.\nBackup criado com ${Object.keys(backup).length} registros.\n\nConfirme enviando: /confirmar_limpar_${categoria}`
      }]
    };
  }

  return { outputs: [{ tipo: 'texto', conteudo: '❓ Ação desconhecida. Use: resumo, buscar, exportar, stats' }] };
}

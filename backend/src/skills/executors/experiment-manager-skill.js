// skills/executors/experiment-manager-skill.js
// Skill: ExperimentManager — Cria, rastreia e analisa testes A/B e experimentos de conteúdo.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function experimentManagerSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;
  const acao = params.acao || 'criar'; // criar | registrar_resultado | analisar | listar
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';

  log('info', `[ExperimentManager] Ação: ${acao}`);

  if (acao === 'criar') {
    return await _criarExperimento(ctx, params, memoryMCP, userId, nicho);
  } else if (acao === 'registrar_resultado') {
    return await _registrarResultado(params, memoryMCP, userId);
  } else if (acao === 'analisar') {
    return await _analisarExperimentos(memoryMCP, userId, nicho);
  } else {
    return await _listarExperimentos(memoryMCP, userId);
  }
}

async function _criarExperimento(ctx, params, memoryMCP, userId, nicho) {
  const elemento = params.elemento || 'hook'; // hook | headline | cta | formato | horario
  const variavel = params.variavel || ctx.sessao?.ultimoTexto || '';

  const prompt = `Crie um experimento A/B estruturado para testar "${elemento}" no nicho "${nicho}".

Variável a testar: "${variavel}"

Retorne JSON:
{
  "id": "exp_${Date.now()}",
  "nome": "nome descritivo do experimento",
  "elemento_testado": "${elemento}",
  "hipotese": "se X então Y porque Z",
  "variante_a": { "descricao": "controle/atual", "conteudo": "versão A" },
  "variante_b": { "descricao": "nova versão", "conteudo": "versão B" },
  "metrica_principal": "o que medir (taxa_clique|retencao|conversao|engajamento)",
  "metrica_secundaria": "métrica de apoio",
  "duracao_sugerida": "X dias",
  "amostra_minima": "X impressões/visualizações",
  "criterio_vitoria": "qual resultado define o vencedor",
  "como_implementar": "passo a passo prático"
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const experimento = JSON.parse(resposta.replace(/```json|```/g, '').trim());
    experimento.status = 'ativo';
    experimento.criado_em = new Date().toISOString();
    experimento.resultados = [];

    await memoryMCP.salvar('experiments', experimento.id, experimento, userId);

    return {
      experimentoCriado: experimento,
      outputs: [{
        tipo: 'texto',
        conteudo: `🧪 *Experimento Criado: ${experimento.nome}*\n\n` +
          `📐 Hipótese: _${experimento.hipotese}_\n\n` +
          `🅰️ Variante A: ${experimento.variante_a?.conteudo}\n` +
          `🅱️ Variante B: ${experimento.variante_b?.conteudo}\n\n` +
          `📏 Métrica: ${experimento.metrica_principal}\n` +
          `⏱️ Duração: ${experimento.duracao_sugerida}\n\n` +
          `🎯 Critério de vitória: ${experimento.criterio_vitoria}\n\n` +
          `📋 Como implementar:\n${experimento.como_implementar}`
      }]
    };
  } catch (err) {
    log('error', `[ExperimentManager] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao criar experimento.' }] };
  }
}

async function _registrarResultado(params, memoryMCP, userId) {
  const { id_experimento, variante, valor_metrica, observacoes } = params;

  try {
    const exp = await memoryMCP.recuperar('experiments', id_experimento, userId);
    if (!exp) return { outputs: [{ tipo: 'texto', conteudo: '❌ Experimento não encontrado.' }] };

    exp.resultados.push({
      variante, valor_metrica, observacoes,
      registrado_em: new Date().toISOString()
    });

    // Verifica se tem resultados suficientes para concluir
    const porVariante = {};
    for (const r of exp.resultados) {
      if (!porVariante[r.variante]) porVariante[r.variante] = [];
      porVariante[r.variante].push(r.valor_metrica);
    }

    if (porVariante.A?.length >= 1 && porVariante.B?.length >= 1) {
      const mediaA = porVariante.A.reduce((a,b) => a+b, 0) / porVariante.A.length;
      const mediaB = porVariante.B.reduce((a,b) => a+b, 0) / porVariante.B.length;
      const vencedor = mediaB > mediaA ? 'B' : 'A';
      const melhora = Math.abs(((mediaB - mediaA) / mediaA) * 100).toFixed(1);
      exp.conclusao = { vencedor, melhora_percentual: melhora, mediaA, mediaB };
      exp.status = 'concluido';
    }

    await memoryMCP.salvar('experiments', id_experimento, exp, userId);

    return {
      outputs: [{
        tipo: 'texto',
        conteudo: exp.conclusao
          ? `✅ Experimento concluído!\n\n🏆 Vencedor: Variante ${exp.conclusao.vencedor} (+${exp.conclusao.melhora_percentual}% melhor)\n\nUse a variante ${exp.conclusao.vencedor} daqui em diante.`
          : `📊 Resultado registrado! Continue coletando dados.`
      }]
    };
  } catch (err) {
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro: ${err.message}` }] };
  }
}

async function _analisarExperimentos(memoryMCP, userId, nicho) {
  const todos = await memoryMCP.recuperarCategoria('experiments', userId, 50);
  const entradas = Object.values(todos);

  const concluidos = entradas.filter(e => e.status === 'concluido' && e.conclusao);
  if (concluidos.length === 0) {
    return { outputs: [{ tipo: 'texto', conteudo: '📊 Nenhum experimento concluído ainda. Crie e execute pelo menos 1 teste.' }] };
  }

  const linhas = [
    `🧪 *Análise de Experimentos — ${nicho}*\n`,
    `Total concluídos: ${concluidos.length}\n`
  ];

  for (const exp of concluidos.slice(0, 5)) {
    linhas.push(`• ${exp.nome}: Variante ${exp.conclusao?.vencedor} venceu (+${exp.conclusao?.melhora_percentual}%)`);
  }

  const padroes = concluidos.filter(e => e.conclusao?.vencedor === 'B').length;
  linhas.push(`\n📈 Taxa de melhoria: ${((padroes/concluidos.length)*100).toFixed(0)}% dos testes tiveram melhora com nova variante`);

  return { outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }] };
}

async function _listarExperimentos(memoryMCP, userId) {
  const todos = await memoryMCP.recuperarCategoria('experiments', userId, 20);
  const entradas = Object.values(todos);

  if (entradas.length === 0) {
    return { outputs: [{ tipo: 'texto', conteudo: '📋 Nenhum experimento criado ainda.' }] };
  }

  const ativos = entradas.filter(e => e.status === 'ativo');
  const concluidos = entradas.filter(e => e.status === 'concluido');

  const linhas = [
    `🧪 *Seus Experimentos*\n`,
    `🟢 Ativos (${ativos.length}):`,
    ...ativos.map(e => `• ${e.nome} — testando ${e.elemento_testado}`),
    `\n✅ Concluídos (${concluidos.length}):`,
    ...concluidos.slice(0, 5).map(e => `• ${e.nome} → Vencedor: ${e.conclusao?.vencedor}`)
  ];

  return { outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }] };
}

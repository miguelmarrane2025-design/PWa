// skills/executors/data-logger-skill.js
// Skill: DataLogger
// Registra, estrutura e organiza dados de performance de forma automática.
// Captura métricas de conteúdo, conversões e engajamento para análise futura.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function dataLoggerSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;
  const tipo = params.tipo || 'general'; // content | conversion | engagement | general
  const dados = params.dados || ctx.dadosPerformance || {};

  log('info', `[DataLogger] Registrando: ${tipo}`);

  // ── 1. Estrutura os dados recebidos ────────────────────────────────────
  const registro = await _estruturarDados(tipo, dados, ctx);

  // ── 2. Detecta anomalias ou padrões notáveis ───────────────────────────
  const insights = await _detectarInsights(registro, tipo, memoryMCP, userId);

  // ── 3. Persiste o registro ─────────────────────────────────────────────
  const chave = `${tipo}_${Date.now()}`;
  await memoryMCP.salvar('performance_logs', chave, {
    ...registro,
    insights,
    registradoEm: new Date().toISOString()
  }, userId);

  // ── 4. Atualiza agregados globais ──────────────────────────────────────
  await _atualizarAgregados(tipo, registro, memoryMCP, userId);

  return {
    logRegistrado: { chave, tipo, registro, insights },
    outputs: insights.length > 0 ? [{
      tipo: 'texto',
      conteudo: `📊 *Log registrado*\n${insights.map(i => `• ${i}`).join('\n')}`
    }] : []
  };
}

async function _estruturarDados(tipo, dados, ctx) {
  const base = {
    tipo,
    nicho: ctx.sessao?.nicho || dados.nicho || null,
    plataforma: dados.plataforma || null,
    timestamp: Date.now(),
    data_iso: new Date().toISOString()
  };

  const mapas = {
    content: { titulo: dados.titulo, formato: dados.formato, hook: dados.hook, visualizacoes: dados.visualizacoes, retencao: dados.retencao, shares: dados.shares },
    conversion: { funil: dados.funil, taxa_abertura: dados.taxa_abertura, taxa_clique: dados.taxa_clique, taxa_conversao: dados.taxa_conversao, receita: dados.receita },
    engagement: { likes: dados.likes, comentarios: dados.comentarios, saves: dados.saves, alcance: dados.alcance, impressoes: dados.impressoes },
    general: dados
  };

  return { ...base, ...(mapas[tipo] || mapas.general) };
}

async function _detectarInsights(registro, tipo, memoryMCP, userId) {
  const insights = [];

  try {
    const historico = await memoryMCP.recuperarCategoria('performance_logs', userId, 20);
    const entradas = Object.values(historico).filter(e => e.tipo === tipo);

    if (entradas.length < 3) return ['Poucos dados para insights (mínimo 3 registros)'];

    const prompt = `Analise este novo registro de performance vs histórico e identifique insights.

NOVO REGISTRO: ${JSON.stringify(registro)}
HISTÓRICO (${entradas.length} registros): ${JSON.stringify(entradas.slice(0, 5), null, 2).substring(0, 1500)}

Liste de 1 a 3 insights objetivos (anomalias, tendências, destaques).
Formato: array JSON simples de strings. Ex: ["insight 1", "insight 2"]`;

    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const parsed = JSON.parse(resposta.replace(/```json|```/g, '').trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return insights;
  }
}

async function _atualizarAgregados(tipo, registro, memoryMCP, userId) {
  try {
    const agregadoAtual = await memoryMCP.recuperar('performance_aggregates', tipo, userId) || { total: 0, soma: {}, media: {} };
    agregadoAtual.total += 1;
    agregadoAtual.ultimo = registro;
    agregadoAtual.ultimaAtualizacao = new Date().toISOString();
    await memoryMCP.salvar('performance_aggregates', tipo, agregadoAtual, userId);
  } catch {}
}

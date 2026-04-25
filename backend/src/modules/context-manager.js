// modules/context-manager.js
// Módulo crítico: Gerencia contexto de sessão de forma inteligente.
// Enriquece, consolida e persiste o estado do usuário entre interações.
// Resolve ambiguidades e mantém coerência entre skills encadeadas.

import { openaiStrong } from '../integrations/openai-advanced.js';
import { memoryMCP } from '../mcps/memory-mcp.js';
import { log } from '../core/logger.js';

class ContextManager {
  constructor() {
    this._cache = new Map(); // userId → contexto enriquecido
  }

  // ─── Enriquece o contexto da sessão com dados persistidos ─────────────────
  async enriquecer(userId, sessao) {
    try {
      // Recupera perfil do usuário da memória
      const perfilSalvo = await memoryMCP.recuperar('user_profiles', `profile_${userId}`, userId);
      const historico = await memoryMCP.recuperarCategoria('session_history', userId, 10);

      const ctx = {
        userId,
        sessao,
        perfil: perfilSalvo || {},
        historico: Object.values(historico).slice(0, 5),
        nicho: sessao?.nicho || perfilSalvo?.nicho_principal || null,
        estilo: sessao?.estilo || perfilSalvo?.estilo_preferido || null,
        outputs: [],
        _enriquecidoEm: new Date().toISOString()
      };

      this._cache.set(userId, ctx);
      return ctx;
    } catch (err) {
      log('warn', `[ContextManager] Enriquecimento falhou: ${err.message}`);
      return { userId, sessao, outputs: [] };
    }
  }

  // ─── Resolve ambiguidades usando IA ───────────────────────────────────────
  async resolverAmbiguidade(ctx, campo, opcoes) {
    if (opcoes.length === 0) return null;
    if (opcoes.length === 1) return opcoes[0];

    try {
      const prompt = `Dado o contexto do usuário, qual opção é mais adequada para "${campo}"?

Contexto:
- Nicho: ${ctx.nicho || 'não definido'}
- Estilo: ${ctx.estilo || 'não definido'}
- Último texto: ${ctx.sessao?.ultimoTexto?.substring(0, 100) || 'nenhum'}

Opções: ${JSON.stringify(opcoes)}

Responda APENAS com a opção escolhida, sem explicação.`;

      const resposta = await openaiStrong([{ role: 'user', content: prompt }], { userId });
      const escolha = resposta.trim().replace(/['"]/g, '');
      return opcoes.find(o => o === escolha) || opcoes[0];
    } catch {
      return opcoes[0];
    }
  }

  // ─── Persiste dados importantes da sessão ─────────────────────────────────
  async persistir(userId, dados) {
    try {
      // Atualiza perfil do usuário
      const perfilAtual = await memoryMCP.recuperar('user_profiles', `profile_${userId}`, userId) || {};

      const perfilAtualizado = {
        ...perfilAtual,
        userId,
        nicho_principal: dados.nicho || perfilAtual.nicho_principal,
        estilo_preferido: dados.estilo || perfilAtual.estilo_preferido,
        pedaleira: dados.pedaleira || perfilAtual.pedaleira,
        guitarra: dados.guitarra || perfilAtual.guitarra,
        ultima_sessao: new Date().toISOString(),
        total_interacoes: (perfilAtual.total_interacoes || 0) + 1
      };

      await memoryMCP.salvar('user_profiles', `profile_${userId}`, perfilAtualizado, userId);

      // Salva histórico da sessão
      const chaveHistorico = `sess_${Date.now()}`;
      await memoryMCP.salvar('session_history', chaveHistorico, {
        nicho: dados.nicho,
        task: dados.task,
        domain: dados.domain,
        timestamp: new Date().toISOString()
      }, userId);

      log('info', `[ContextManager] Contexto persistido para ${userId}`);
    } catch (err) {
      log('warn', `[ContextManager] Persistência falhou: ${err.message}`);
    }
  }

  // ─── Extrai preferências do histórico ─────────────────────────────────────
  async extrairPreferencias(userId) {
    try {
      const historico = await memoryMCP.recuperarCategoria('session_history', userId, 50);
      const entradas = Object.values(historico);

      if (entradas.length === 0) return {};

      // Conta nichos mais usados
      const nichos = {};
      const tasks = {};
      for (const entrada of entradas) {
        if (entrada.nicho) nichos[entrada.nicho] = (nichos[entrada.nicho] || 0) + 1;
        if (entrada.task) tasks[entrada.task] = (tasks[entrada.task] || 0) + 1;
      }

      return {
        nicho_favorito: Object.entries(nichos).sort(([,a],[,b]) => b-a)[0]?.[0] || null,
        task_favorita: Object.entries(tasks).sort(([,a],[,b]) => b-a)[0]?.[0] || null,
        total_interacoes: entradas.length
      };
    } catch {
      return {};
    }
  }

  // ─── Mescla contextos de múltiplas skills ─────────────────────────────────
  mesclar(ctxBase, resultadoSkill) {
    if (!resultadoSkill || typeof resultadoSkill !== 'object') return ctxBase;

    const merged = { ...ctxBase, ...resultadoSkill };

    // Preserva outputs acumulados
    merged.outputs = [
      ...(ctxBase.outputs || []),
      ...(resultadoSkill.outputs || [])
    ];

    // Remove duplicatas de outputs por conteúdo
    const vistos = new Set();
    merged.outputs = merged.outputs.filter(o => {
      const chave = o.conteudo?.substring(0, 50);
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

    return merged;
  }

  // ─── Valida se o contexto tem dados suficientes para uma skill ────────────
  validar(ctx, camposObrigatorios) {
    const faltando = camposObrigatorios.filter(campo => {
      const valor = campo.split('.').reduce((obj, k) => obj?.[k], ctx);
      return !valor;
    });

    return {
      valido: faltando.length === 0,
      faltando
    };
  }

  limparCache(userId) {
    this._cache.delete(userId);
  }
}

export const contextManager = new ContextManager();

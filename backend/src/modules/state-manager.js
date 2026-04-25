// modules/state-manager.js
// Módulo crítico: Gerencia estado efêmero e persistente do sistema.
// Separa estado de sessão (volátil) de estado de negócio (persistente).
// Fornece locks distribuídos para evitar race conditions em workflows.

import { memoryMCP } from '../mcps/memory-mcp.js';
import { log } from '../core/logger.js';

class StateManager {
  constructor() {
    // Estado efêmero (apenas na memória do processo)
    this._estado = new Map();   // userId → { campo: valor }
    this._locks = new Map();    // lockId → Promise
    this._timers = new Map();   // userId → timeout de expiração
  }

  // ─── Estado efêmero (in-memory, não persiste) ─────────────────────────────
  definir(userId, campo, valor) {
    if (!this._estado.has(userId)) {
      this._estado.set(userId, {});
    }
    this._estado.get(userId)[campo] = valor;

    // Auto-expiração de 30 min por inatividade
    this._resetarTimer(userId);
  }

  obter(userId, campo) {
    return this._estado.get(userId)?.[campo] ?? null;
  }

  remover(userId, campo) {
    const estado = this._estado.get(userId);
    if (estado) delete estado[campo];
  }

  obterTudo(userId) {
    return { ...(this._estado.get(userId) || {}) };
  }

  limpar(userId) {
    this._estado.delete(userId);
    this._cancelarTimer(userId);
  }

  // ─── Estado persistente (salvo no memoryMCP) ──────────────────────────────
  async salvarPersistente(userId, namespace, chave, valor) {
    try {
      await memoryMCP.salvar(namespace, chave, {
        valor,
        userId,
        timestamp: Date.now()
      }, userId);
    } catch (err) {
      log('warn', `[StateManager] Falha ao salvar estado persistente: ${err.message}`);
    }
  }

  async obterPersistente(userId, namespace, chave) {
    try {
      const dados = await memoryMCP.recuperar(namespace, chave, userId);
      return dados?.valor ?? null;
    } catch {
      return null;
    }
  }

  // ─── Contador persistente (para métricas e sequências) ───────────────────
  async incrementarContador(userId, nome) {
    try {
      const atual = await this.obterPersistente(userId, 'contadores', nome) || 0;
      const novo = atual + 1;
      await this.salvarPersistente(userId, 'contadores', nome, novo);
      return novo;
    } catch {
      return 0;
    }
  }

  // ─── Locks para evitar execução simultânea ────────────────────────────────
  async adquirirLock(lockId, timeoutMs = 30000) {
    if (this._locks.has(lockId)) {
      // Aguarda o lock existente ser liberado
      try {
        await Promise.race([
          this._locks.get(lockId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), timeoutMs))
        ]);
      } catch {
        // Lock expirou, força liberação
        this._locks.delete(lockId);
      }
    }

    let liberarLock;
    const promessa = new Promise(resolve => { liberarLock = resolve; });
    this._locks.set(lockId, promessa);

    return () => {
      liberarLock();
      this._locks.delete(lockId);
    };
  }

  // ─── Fila de processamento por usuário ───────────────────────────────────
  async enfileirar(userId, fn) {
    const lockId = `queue_${userId}`;
    const liberarLock = await this.adquirirLock(lockId);

    try {
      return await fn();
    } finally {
      liberarLock();
    }
  }

  // ─── Snapshot do estado para debug ───────────────────────────────────────
  snapshot(userId) {
    return {
      efemero: this.obterTudo(userId),
      locks_ativos: [...this._locks.keys()].filter(k => k.includes(userId)),
      tem_timer: this._timers.has(userId)
    };
  }

  // ─── Helpers internos ─────────────────────────────────────────────────────
  _resetarTimer(userId) {
    this._cancelarTimer(userId);
    const timer = setTimeout(() => {
      log('info', `[StateManager] Estado expirado para ${userId}`);
      this._estado.delete(userId);
      this._timers.delete(userId);
    }, 30 * 60 * 1000); // 30 min
    this._timers.set(userId, timer);
  }

  _cancelarTimer(userId) {
    const timer = this._timers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this._timers.delete(userId);
    }
  }

  // Stats para monitoramento
  stats() {
    return {
      usuarios_ativos: this._estado.size,
      locks_ativos: this._locks.size,
      timers_ativos: this._timers.size
    };
  }
}

export const stateManager = new StateManager();

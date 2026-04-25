// mcps/memory-mcp.js
// MCP de memória persistente baseado em arquivos JSON.
// Salva e recupera dados estruturados por namespace/categoria para skills e módulos.

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_BASE = process.env.STORAGE_PATH
  ? path.join(process.env.STORAGE_PATH, 'memory')
  : path.join(__dirname, '..', 'storage', 'memory');

class MemoryMCP {
  constructor() {
    this._cache = new Map(); // namespace → dados em memória
    this._inicializado = false;
  }

  async _init() {
    if (this._inicializado) return;
    await fs.ensureDir(STORAGE_BASE);
    this._inicializado = true;
  }

  _caminho(namespace) {
    return path.join(STORAGE_BASE, `${namespace}.json`);
  }

  async _carregar(namespace) {
    if (this._cache.has(namespace)) return this._cache.get(namespace);
    await this._init();
    try {
      const dados = await fs.readJson(this._caminho(namespace));
      this._cache.set(namespace, dados);
      return dados;
    } catch {
      const vazio = {};
      this._cache.set(namespace, vazio);
      return vazio;
    }
  }

  async _salvarArquivo(namespace, dados) {
    await this._init();
    this._cache.set(namespace, dados);
    try {
      await fs.writeJson(this._caminho(namespace), dados, { spaces: 2 });
    } catch (err) {
      log('warn', `[MemoryMCP] Falha ao persistir ${namespace}: ${err.message}`);
    }
  }

  // ─── Salva um valor por chave dentro de um namespace ──────────────────────
  async salvar(namespace, chave, valor, userId = 'global') {
    const ns = userId !== 'global' ? `${userId}_${namespace}` : namespace;
    const dadosNs = await this._carregar(ns);

    dadosNs[chave] = {
      valor,
      timestamp: Date.now(),
      userId
    };

    await this._salvarArquivo(ns, dadosNs);
    log('info', `[MemoryMCP] Salvo: ${ns}/${chave}`);
    return true;
  }

  // ─── Recupera um valor por chave ──────────────────────────────────────────
  async recuperar(namespace, chave, userId = 'global') {
    const ns = userId !== 'global' ? `${userId}_${namespace}` : namespace;
    const dados = await this._carregar(ns);
    return dados[chave]?.valor ?? null;
  }

  // ─── Recupera múltiplos registros de uma categoria ────────────────────────
  async recuperarCategoria(namespace, userId = 'global', limite = 10) {
    const ns = userId !== 'global' ? `${userId}_${namespace}` : namespace;
    const dados = await this._carregar(ns);

    // Ordena por timestamp decrescente e aplica limite
    const entradas = Object.entries(dados)
      .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limite);

    return Object.fromEntries(entradas.map(([k, v]) => [k, v.valor]));
  }

  // ─── Remove um registro ───────────────────────────────────────────────────
  async remover(namespace, chave, userId = 'global') {
    const ns = userId !== 'global' ? `${userId}_${namespace}` : namespace;
    const dados = await this._carregar(ns);
    delete dados[chave];
    await this._salvarArquivo(ns, dados);
    return true;
  }

  // ─── Lista todas as chaves de um namespace ─────────────────────────────────
  async listar(namespace, userId = 'global') {
    const ns = userId !== 'global' ? `${userId}_${namespace}` : namespace;
    const dados = await this._carregar(ns);
    return Object.keys(dados);
  }

  // ─── Limpa todo um namespace ──────────────────────────────────────────────
  async limpar(namespace, userId = 'global') {
    const ns = userId !== 'global' ? `${userId}_${namespace}` : namespace;
    this._cache.delete(ns);
    try {
      await fs.remove(this._caminho(ns));
    } catch {}
    return true;
  }
}

export const memoryMCP = new MemoryMCP();

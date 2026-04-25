// mcps/web-search.js
// MCP de busca na web via DuckDuckGo HTML scraping.
// Usado pelas skills para buscar tendências, hooks, copies e dados de mercado em tempo real.

import axios from 'axios';
import * as cheerio from 'cheerio';
import { log } from '../core/logger.js';

class WebSearch {
  constructor() {
    this.baseUrl = 'https://html.duckduckgo.com/html/';
    this.userAgents = [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    ];
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
    };
    this.maxRetries = parseInt(process.env.SEARCH_MAX_RETRIES || '3');
    this.timeoutMs = parseInt(process.env.SEARCH_TIMEOUT_MS || '12000');
    this.retryDelayMs = parseInt(process.env.SEARCH_RETRY_DELAY_MS || '1500');
  }

  // ─── Busca e retorna lista de resultados (com retry e timeout) ─────────────
  async buscar(query, opcoes = {}) {
    const { limite = 5, idioma = 'br-pt' } = opcoes;
    log('info', `[WebSearch] Buscando: "${query}"`);

    for (let tentativa = 1; tentativa <= this.maxRetries; tentativa++) {
      try {
        const ua = this.userAgents[(tentativa - 1) % this.userAgents.length];
        const response = await axios.post(
          this.baseUrl,
          new URLSearchParams({ q: query, kl: idioma }),
          { headers: { ...this.headers, 'User-Agent': ua }, timeout: this.timeoutMs }
        );

        const $ = cheerio.load(response.data);
        const resultados = [];

        $('.result').each((i, el) => {
          if (i >= limite) return false;
          const titulo = $(el).find('.result__title').text().trim();
          const snippet = $(el).find('.result__snippet').text().trim();
          const url = $(el).find('.result__url').text().trim();

          if (titulo && snippet) {
            resultados.push({ titulo, snippet, url, posicao: i + 1 });
          }
        });

        log('info', `[WebSearch] ${resultados.length} resultados para "${query}" (tentativa ${tentativa})`);
        return resultados;

      } catch (err) {
        const isTimeout = err.code === 'ECONNABORTED' || err.message.includes('timeout');
        log('warn', `[WebSearch] ${isTimeout ? 'Timeout' : 'Erro'} tentativa ${tentativa}/${this.maxRetries}: ${err.message}`);

        if (tentativa < this.maxRetries) {
          const delay = this.retryDelayMs * tentativa;
          log('info', `[WebSearch] Aguardando ${delay}ms antes do retry...`);
          await sleep(delay);
        } else {
          log('error', `[WebSearch] Todas as tentativas falharam para: "${query}"`);
          return [];
        }
      }
    }

    return [];
  }

  // ─── Busca e retorna só os snippets como texto concatenado ─────────────────
  async buscarTexto(query, opcoes = {}) {
    const resultados = await this.buscar(query, opcoes);
    if (resultados.length === 0) return '';
    return resultados.map(r => `${r.titulo}: ${r.snippet}`).join('\n\n');
  }

  // ─── Busca múltiplas queries em paralelo ────────────────────────────────────
  async buscarMultiplo(queries, opcoes = {}) {
    const resultados = await Promise.allSettled(
      queries.map(q => this.buscar(q, opcoes))
    );
    return resultados
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}

export const webSearch = new WebSearch();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

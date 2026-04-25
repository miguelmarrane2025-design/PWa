// mcps/web-scraper.js
// MCP de scraping de páginas web para extração de conteúdo rico.
// Usado pelas skills para coletar dados de perfis, produtos e tendências.

import axios from 'axios';
import * as cheerio from 'cheerio';
import { log } from '../core/logger.js';

class WebScraper {
  constructor() {
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
    };
    this.timeout = 15000;
  }

  // ─── Faz scraping de uma URL e retorna texto limpo ─────────────────────────
  async raspar(url, opcoes = {}) {
    const { seletor = null, maxChars = 3000 } = opcoes;
    log('info', `[WebScraper] Raspando: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.timeout,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);

      // Remove elementos desnecessários
      $('script, style, nav, footer, header, iframe, noscript, [aria-hidden="true"]').remove();

      let texto = '';
      if (seletor) {
        texto = $(seletor).text();
      } else {
        // Tenta encontrar conteúdo principal
        const main = $('main, article, [role="main"], .content, #content, .post-content');
        texto = main.length > 0 ? main.text() : $('body').text();
      }

      // Limpa whitespace excessivo
      texto = texto.replace(/\s+/g, ' ').trim();
      if (maxChars > 0 && texto.length > maxChars) {
        texto = texto.substring(0, maxChars) + '...';
      }

      log('info', `[WebScraper] ${texto.length} chars extraídos de ${url}`);
      return { url, conteudo: texto, sucesso: true };

    } catch (err) {
      log('error', `[WebScraper] Erro em ${url}: ${err.message}`);
      return { url, conteudo: '', sucesso: false, erro: err.message };
    }
  }

  // ─── Extrai metadados (título, descrição, og:tags) ─────────────────────────
  async extrairMeta(url) {
    try {
      const response = await axios.get(url, { headers: this.headers, timeout: this.timeout });
      const $ = cheerio.load(response.data);

      return {
        titulo: $('title').first().text().trim() || $('og:title').attr('content') || '',
        descricao: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
        imagem: $('meta[property="og:image"]').attr('content') || '',
        url
      };
    } catch (err) {
      log('error', `[WebScraper] Meta erro: ${err.message}`);
      return { titulo: '', descricao: '', imagem: '', url };
    }
  }

  // ─── Raspa múltiplas URLs em paralelo ─────────────────────────────────────
  async rasparMultiplo(urls, opcoes = {}) {
    const resultados = await Promise.allSettled(
      urls.map(url => this.raspar(url, opcoes))
    );
    return resultados
      .filter(r => r.status === 'fulfilled' && r.value.sucesso)
      .map(r => r.value);
  }
}

export const webScraper = new WebScraper();

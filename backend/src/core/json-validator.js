// core/json-validator.js
// Utilitário crítico: garante parsing seguro de respostas JSON da IA.
// Evita crashes por JSON malformado, markdown escapado ou texto extra.

import { log } from './logger.js';

/**
 * Tenta parsear JSON de uma string que pode conter markdown, texto extra, etc.
 * Múltiplas estratégias de extração em ordem de confiança.
 */
export function parseJsonSafe(texto, fallback = null) {
  if (!texto || typeof texto !== 'string') return fallback;

  // Estratégia 1: parse direto (mais rápido, funciona quando resposta é JSON limpo)
  try {
    return JSON.parse(texto.trim());
  } catch {}

  // Estratégia 2: remove blocos de código markdown (```json ... ```)
  try {
    const semMarkdown = texto
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    return JSON.parse(semMarkdown);
  } catch {}

  // Estratégia 3: extrai primeiro bloco JSON por chaves balanceadas
  try {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio !== -1 && fim > inicio) {
      return JSON.parse(texto.substring(inicio, fim + 1));
    }
  } catch {}

  // Estratégia 4: extrai primeiro array JSON
  try {
    const inicio = texto.indexOf('[');
    const fim = texto.lastIndexOf(']');
    if (inicio !== -1 && fim > inicio) {
      return JSON.parse(texto.substring(inicio, fim + 1));
    }
  } catch {}

  // Estratégia 5: remove caracteres de controle e tenta novamente
  try {
    const limpo = texto
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/,\s*([}\]])/g, '$1') // trailing commas
      .trim();
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio !== -1 && fim > inicio) {
      return JSON.parse(limpo.substring(inicio, fim + 1));
    }
  } catch {}

  log('warn', '[JsonValidator] Falha em todas as estratégias de parse');
  return fallback;
}

/**
 * Valida se um objeto possui todos os campos obrigatórios.
 * Retorna { valido, erros }.
 */
export function validarEsquema(obj, camposObrigatorios = []) {
  if (!obj || typeof obj !== 'object') {
    return { valido: false, erros: ['Objeto inválido ou nulo'] };
  }

  const erros = [];
  for (const campo of camposObrigatorios) {
    if (obj[campo] === undefined || obj[campo] === null) {
      erros.push(`Campo obrigatório ausente: ${campo}`);
    }
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Parse com validação de esquema. Lança erro descritivo se inválido.
 */
export function parseJsonComEsquema(texto, camposObrigatorios = [], fallback = null) {
  const obj = parseJsonSafe(texto, fallback);
  if (!obj) return fallback;

  const { valido, erros } = validarEsquema(obj, camposObrigatorios);
  if (!valido) {
    log('warn', `[JsonValidator] Esquema inválido: ${erros.join(', ')}`);
    return fallback;
  }

  return obj;
}

/**
 * Wrapper para chamadas OpenAI com retry automático e validação de JSON.
 * Tenta até maxTentativas vezes antes de retornar fallback.
 */
export async function callIAComRetry(fn, opcoes = {}) {
  const {
    maxTentativas = 3,
    camposObrigatorios = [],
    fallback = null,
    delayMs = 1000
  } = opcoes;

  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const resposta = await fn();
      const obj = parseJsonSafe(resposta, null);

      if (!obj) {
        log('warn', `[JsonValidator] Tentativa ${tentativa}/${maxTentativas}: JSON inválido`);
        ultimoErro = new Error('JSON inválido');
        if (tentativa < maxTentativas) await sleep(delayMs * tentativa);
        continue;
      }

      if (camposObrigatorios.length > 0) {
        const { valido, erros } = validarEsquema(obj, camposObrigatorios);
        if (!valido) {
          log('warn', `[JsonValidator] Tentativa ${tentativa}/${maxTentativas}: ${erros.join(', ')}`);
          ultimoErro = new Error(erros.join(', '));
          if (tentativa < maxTentativas) await sleep(delayMs * tentativa);
          continue;
        }
      }

      return obj;
    } catch (err) {
      ultimoErro = err;
      log('error', `[JsonValidator] Tentativa ${tentativa}/${maxTentativas}: ${err.message}`);
      if (tentativa < maxTentativas) await sleep(delayMs * tentativa);
    }
  }

  log('error', `[JsonValidator] Todas as tentativas falharam: ${ultimoErro?.message}`);
  return fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// lib/llm.js — v17: thin shim that re-exports from provider-manager.
// All callers (agents, skills, routes) keep their existing import path.
// DO NOT add logic here — it all lives in provider-manager.js.

export {
  chat,
  chatFast,
  embed,
  transcribe,
  generateImage,
  getClientForUser,
  invalidateClientCache,
  openaiStrong,
  openaiFast,
} from './provider-manager.js';

export { default } from './provider-manager.js';

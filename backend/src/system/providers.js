function boolFromEnv(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function maskKey(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length <= 8) return 'configured';
  if (normalized.startsWith('sk-')) return `sk-...${normalized.slice(-4)}`;
  return `${normalized.slice(0, 3)}-...${normalized.slice(-4)}`;
}

function firstDefined(...values) {
  return values.find(value => value != null && String(value).trim() !== '');
}

function readOpenAIKey() {
  return firstDefined(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_1,
    process.env.OPENAI_API_KEY_2,
  ) || null;
}

function readOllamaBaseUrl() {
  return firstDefined(process.env.OLLAMA_BASE_URL, process.env.OLLAMA_HOST);
}

export function getSystemProviderStatus() {
  const responsibleProvider = firstDefined(
    process.env.RESPONSIBLE_PROVIDER,
    process.env.DEFAULT_PROVIDER,
    'openai',
  );
  const defaultProvider = firstDefined(
    process.env.DEFAULT_PROVIDER,
    process.env.RESPONSIBLE_PROVIDER,
    'openai',
  );

  const openaiKey = readOpenAIKey();
  const anthropicKey = firstDefined(process.env.ANTHROPIC_API_KEY);
  const geminiKey = firstDefined(process.env.GEMINI_API_KEY);
  const gemmaKey = firstDefined(process.env.GEMMA_API_KEY);
  const llamaKey = firstDefined(process.env.LLAMA_API_KEY);
  const openrouterKey = firstDefined(process.env.OPENROUTER_API_KEY);
  const groqKey = firstDefined(process.env.GROQ_API_KEY);
  const xaiKey = firstDefined(process.env.XAI_API_KEY);
  const deepseekKey = firstDefined(process.env.DEEPSEEK_API_KEY);
  const ollamaBaseUrl = readOllamaBaseUrl();

  const strongModel = firstDefined(
    process.env.DEFAULT_MODEL_STRONG,
    process.env.OPENAI_MODEL,
    'gpt-5',
  );
  const miniModel = firstDefined(
    process.env.DEFAULT_MODEL_MINI,
    process.env.OPENAI_MODEL_FAST,
    'gpt-4.1-mini',
  );

  const providers = [
    {
      id: 'openai',
      label: 'OpenAI',
      enabled: boolFromEnv(process.env.OPENAI_ENABLED, !!openaiKey || defaultProvider === 'openai' || responsibleProvider === 'openai'),
      configured: !!openaiKey,
      status: openaiKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(openaiKey),
      models: { mini: miniModel, strong: strongModel },
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      enabled: boolFromEnv(process.env.ANTHROPIC_ENABLED, false),
      configured: !!anthropicKey,
      status: anthropicKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(anthropicKey),
      models: {
        mini: firstDefined(process.env.ANTHROPIC_MODEL_FAST, 'claude-haiku-4-5-20251001'),
        strong: firstDefined(process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-6'),
      },
    },
    {
      id: 'gemini',
      label: 'Gemini',
      enabled: boolFromEnv(process.env.GEMINI_ENABLED, false),
      configured: !!geminiKey,
      status: geminiKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(geminiKey),
      models: {
        mini: firstDefined(process.env.GEMINI_MODEL_FAST, 'gemma-3-27b-it'),
        strong: firstDefined(process.env.GEMINI_MODEL, 'gemini-2.5-pro'),
      },
    },
    {
      id: 'gemma',
      label: 'Gemma/Gemma4',
      enabled: boolFromEnv(process.env.GEMMA_ENABLED, false) || !!ollamaBaseUrl,
      configured: !!gemmaKey || !!ollamaBaseUrl,
      status: gemmaKey || ollamaBaseUrl ? 'configured' : 'not_configured',
      maskedKey: maskKey(gemmaKey) || maskKey(ollamaBaseUrl),
      models: {
        mini: firstDefined(process.env.GEMMA_MODEL_FAST, process.env.OLLAMA_MODEL_FAST, 'gemma3:12b'),
        strong: firstDefined(process.env.GEMMA_MODEL, process.env.OLLAMA_MODEL, 'gemma3:27b'),
      },
    },
    {
      id: 'llama',
      label: 'Llama',
      enabled: boolFromEnv(process.env.LLAMA_ENABLED, false),
      configured: !!llamaKey,
      status: llamaKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(llamaKey),
      models: {
        mini: firstDefined(process.env.LLAMA_MODEL_FAST, 'llama-3.1-8b-instant'),
        strong: firstDefined(process.env.LLAMA_MODEL, 'llama-3.3-70b-versatile'),
      },
    },
    {
      id: 'ollama',
      label: 'Llama/Ollama',
      enabled: boolFromEnv(process.env.OLLAMA_ENABLED, !!ollamaBaseUrl),
      configured: !!ollamaBaseUrl,
      status: ollamaBaseUrl ? 'configured' : 'not_configured',
      maskedKey: maskKey(ollamaBaseUrl),
      models: {
        mini: firstDefined(process.env.OLLAMA_MODEL_FAST, 'gemma3:12b'),
        strong: firstDefined(process.env.OLLAMA_MODEL, 'gemma3:27b'),
      },
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      enabled: boolFromEnv(process.env.OPENROUTER_ENABLED, false),
      configured: !!openrouterKey,
      status: openrouterKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(openrouterKey),
      models: {
        mini: firstDefined(process.env.OPENROUTER_MODEL_FAST, 'openai/gpt-4o-mini'),
        strong: firstDefined(process.env.OPENROUTER_MODEL, 'openai/gpt-4o'),
      },
    },
    {
      id: 'groq',
      label: 'Groq',
      enabled: boolFromEnv(process.env.GROQ_ENABLED, false),
      configured: !!groqKey,
      status: groqKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(groqKey),
      models: {
        mini: firstDefined(process.env.GROQ_MODEL_FAST, 'llama-3.1-8b-instant'),
        strong: firstDefined(process.env.GROQ_MODEL, 'llama-3.3-70b-versatile'),
      },
    },
    {
      id: 'xai',
      label: 'xAI / Grok',
      enabled: boolFromEnv(process.env.XAI_ENABLED, false),
      configured: !!xaiKey,
      status: xaiKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(xaiKey),
      models: {
        mini: firstDefined(process.env.XAI_MODEL_FAST, 'grok-3-mini'),
        strong: firstDefined(process.env.XAI_MODEL, 'grok-3'),
      },
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      enabled: boolFromEnv(process.env.DEEPSEEK_ENABLED, false),
      configured: !!deepseekKey,
      status: deepseekKey ? 'configured' : 'not_configured',
      maskedKey: maskKey(deepseekKey),
      models: {
        mini: firstDefined(process.env.DEEPSEEK_MODEL_FAST, 'deepseek-chat'),
        strong: firstDefined(process.env.DEEPSEEK_MODEL, 'deepseek-chat'),
      },
    },
  ];

  return {
    ok: true,
    responsibleProvider,
    defaultProvider,
    providers,
  };
}

export default {
  maskKey,
  getSystemProviderStatus,
};

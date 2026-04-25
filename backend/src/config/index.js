import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPaths = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key, fallback = "") => process.env[key] ?? fallback;
const secureFallback = (key) => {
  if (process.env[key]) return process.env[key];
  const fallback = crypto.randomBytes(32).toString("hex");
  process.env[key] = fallback;
  return fallback;
};

const isProd = (process.env.NODE_ENV || 'development') === 'production';
const storageRoot = optional("STORAGE_DIR", optional("STORAGE_PATH", "/app/storage"));

export const config = {
  env: optional("NODE_ENV", "development"),
  port: toInt(optional("PORT", optional("BACKEND_PORT", "3000")), 3000),

  db: {
    connectionString: optional("DATABASE_URL", ""),
    host: optional("DB_HOST", "localhost"),
    port: toInt(optional("DB_PORT", "5432"), 5432),
    user: optional("DB_USER", "botsquad"),
    password: optional("DB_PASSWORD", "botsquad"),
    database: optional("DB_NAME", "botsquad"),
  },

  openai: {
    apiKey: optional("OPENAI_API_KEY", ""),
    model: optional("OPENAI_MODEL", "gpt-4o"),
    embeddingModel: optional("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  },

  // ── FIX #2: JWT secret obrigatório em produção ────────────────────────
  jwt: {
    secret: isProd ? required("JWT_SECRET") : secureFallback("JWT_SECRET"),
    expiresIn: "7d",
  },
  session: {
    secret: isProd
      ? required("SESSION_SECRET")
      : optional("SESSION_SECRET", "dev_session_secret"),
  },

  // ── FIX #3: Chave de criptografia para API keys ──────────────────────
  encryption: {
    key: isProd
      ? required("ENCRYPTION_KEY")
      : optional("ENCRYPTION_KEY", "dev_enc_key_32chars_not_for_prod!"),
  },

  storage: {
    upload:  optional("UPLOAD_DIR",  path.join(storageRoot, "uploads")),
    output:  optional("OUTPUT_DIR",  path.join(storageRoot, "outputs")),
    ir:      optional("IR_DIR",      path.join(storageRoot, "irs")),
    temp:    optional("TEMP_DIR",    path.join(storageRoot, "temp")),
    preview: optional("PREVIEW_DIR", path.join(storageRoot, "previews")),
    logs:    optional("LOG_DIR",     path.join(storageRoot, "logs")),
    video:   optional("VIDEO_DIR",   path.join(storageRoot, "videos")),
  },

  camilla: {
    bin: optional("CAMILLA_BIN", "/usr/local/bin/camilladsp"),
    configDir: optional("CAMILLA_CONFIG_DIR", "/app/camilla-configs"),
    defaultConfig: optional("CAMILLA_CONFIG_DIR", "/app/camilla-configs") + "/default.yml",
  },

  google: {
    clientId:     optional("GOOGLE_CLIENT_ID"),
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    redirectUri:  optional("GOOGLE_REDIRECT_URI", "http://localhost:4000/drive/callback"),
  },

  // ── Multi-provider optional env keys ────────────────────────────────────
  providers: {
    openrouter: optional("OPENROUTER_API_KEY"),
    anthropic:  optional("ANTHROPIC_API_KEY"),
    groq:       optional("GROQ_API_KEY"),
    gemini:     optional("GEMINI_API_KEY"),
    xai:        optional("XAI_API_KEY"),
    deepseek:   optional("DEEPSEEK_API_KEY"),
  },

  // ── Ollama / Gemma local ───────────────────────────────────────────────
  ollama: {
    host:      optional("OLLAMA_HOST",       "http://localhost:11434"),
    model:     optional("OLLAMA_MODEL",      "gemma3:27b"),
    modelFast: optional("OLLAMA_MODEL_FAST", "gemma3:12b"),
  },

  // ── Backend public URL (for remote access) ───────────────────────────────
  publicUrl: optional("BACKEND_PUBLIC_URL", `http://localhost:${toInt(process.env.PORT || process.env.BACKEND_PORT || "3000", 3000)}`),
};

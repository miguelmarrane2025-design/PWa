import { classifyDatabaseError, pool } from './index.js';
import { logger } from '../lib/logger.js';

const migrations = [
  `DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN NULL;
  END $$`,

  `CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT DEFAULT 'New conversation',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content         TEXT NOT NULL,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
      CREATE TABLE IF NOT EXISTS memory (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        content    TEXT NOT NULL,
        embedding  VECTOR(1536),
        tags       TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    ELSE
      CREATE TABLE IF NOT EXISTS memory (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        content    TEXT NOT NULL,
        embedding  TEXT,
        tags       TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    END IF;
  EXCEPTION WHEN duplicate_table THEN NULL;
  END $$`,

  `CREATE TABLE IF NOT EXISTS audio_jobs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','done','error')),
    input_path  TEXT,
    output_path TEXT,
    config_name TEXT DEFAULT 'default',
    error       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE audio_jobs ADD COLUMN IF NOT EXISTS display_name TEXT`,
  `ALTER TABLE audio_jobs ADD COLUMN IF NOT EXISTS file_name TEXT`,
  `ALTER TABLE audio_jobs ADD COLUMN IF NOT EXISTS download_name TEXT`,
  `ALTER TABLE audio_jobs ADD COLUMN IF NOT EXISTS output_file_name TEXT`,
  `ALTER TABLE audio_jobs ADD COLUMN IF NOT EXISTS config_json JSONB DEFAULT '{}'`,

  // ── API keys table — one row per provider per user ──────────────────────
  `CREATE TABLE IF NOT EXISTS user_api_keys (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    provider   TEXT NOT NULL DEFAULT 'openai',
    api_key    TEXT NOT NULL,
    model      TEXT,
    verified   BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, provider)
  )`,

  // ── v18: Video jobs table ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS video_jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','done','error')),
    stage        TEXT DEFAULT 'queued',
    input_path   TEXT,
    output_path  TEXT,
    captions_path TEXT,
    message      TEXT,
    error        TEXT,
    stats        JSONB DEFAULT '{}',
    input_paths  JSONB DEFAULT '[]',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  )`,
  // v21: add input_paths if column didn't exist in earlier installs
  `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS input_paths JSONB DEFAULT '[]'`,
  `CREATE INDEX IF NOT EXISTS idx_video_jobs_user ON video_jobs(user_id, created_at DESC)`,

  // ── v17: Multi-key support — key_slot allows multiple keys per provider ──
  `ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS key_slot INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_user_id_provider_key`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'user_api_keys_user_provider_slot'
     ) THEN
       ALTER TABLE user_api_keys
         ADD CONSTRAINT user_api_keys_user_provider_slot
         UNIQUE (user_id, provider, key_slot);
     END IF;
   END$$`,

  // ── v17: Provider catalog — tracks which providers user has enabled ────
  `CREATE TABLE IF NOT EXISTS user_providers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,
    active      BOOLEAN DEFAULT TRUE,
    priority    INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, provider)
  )`,

  // ── v21: Token usage log ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS usage_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    provider   TEXT NOT NULL DEFAULT 'openai',
    model      TEXT,
    tokens     INTEGER NOT NULL,
    logged_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_usage_log_user ON usage_log(user_id, logged_at DESC)`,

  // ── v26: Skill execution tracking ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS skill_executions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    skill_id    TEXT NOT NULL,
    agent       TEXT,
    domain      TEXT,
    status      TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','fallback')),
    latency_ms  INTEGER,
    tokens_used INTEGER DEFAULT 0,
    error_msg   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_skill_exec_user  ON skill_executions(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_skill_exec_skill ON skill_executions(skill_id, created_at DESC)`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_messages_conv     ON messages(conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_user        ON memory(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audio_jobs_user    ON audio_jobs(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_api_keys      ON user_api_keys(user_id, provider)`,
];

export async function runMigrations({ safeMode = true } = {}) {
  let client;
  try {
    logger.info(`[DB] Running ${migrations.length} migration step(s)`);
    client = await pool.connect();
    await client.query('BEGIN');
    for (const sql of migrations) {
      await client.query(sql);
    }
    await client.query('COMMIT');
    logger.info('[DB] Database migrations complete');
    return true;
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.warn(`[DB] Migration rollback failed: ${rollbackErr.message}`);
      }
    }

    const details = classifyDatabaseError(err);
    logger.error(
      `[DB] Migration failed (${details.kind}${details.code ? `/${details.code}` : ''}): ${details.message}`,
    );

    if (safeMode) {
      logger.warn('[DB] Continuing startup without blocking HTTP boot because safe mode is enabled');
      return false;
    }

    throw err;
  } finally {
    client?.release();
  }
}

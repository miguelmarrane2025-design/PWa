import pg from "pg";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";

const { Pool } = pg;

const INITIAL_CONNECT_RETRIES = Math.max(
  1,
  Number.parseInt(process.env.DB_CONNECT_RETRIES || "5", 10) || 5,
);
const INITIAL_CONNECT_DELAY_MS = Math.max(
  250,
  Number.parseInt(process.env.DB_CONNECT_DELAY_MS || "2000", 10) || 2000,
);

const safeDecode = (value) => {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

function getSafeDbDetails(values) {
  return {
    host: values.host || "localhost",
    port: values.port || 5432,
    user: values.user || "",
    database: values.database || "",
    passwordSet: Boolean(values.password),
  };
}

function formatDbTarget(details) {
  return `${details.user || "?"}@${details.host}:${details.port}/${details.database || "?"} (password=${details.passwordSet ? "set" : "empty"})`;
}

function classifyDatabaseError(error) {
  const nested = error instanceof AggregateError && Array.isArray(error.errors) && error.errors.length
    ? error.errors.find((entry) => entry?.code) || error.errors[0]
    : null;
  const root = nested || error;
  const code = root?.code || error?.code || null;
  const message = root?.message || error?.message || "Unknown database error";

  let kind = "unknown";
  if (code === "ECONNREFUSED") {
    kind = "connection_refused";
  } else if (code === "28P01" || /password authentication failed/i.test(message)) {
    kind = "auth";
  } else if (code === "3D000" || /database .+ does not exist/i.test(message)) {
    kind = "database_missing";
  } else if (code === "ENOTFOUND" || /getaddrinfo/i.test(message)) {
    kind = "host_not_found";
  } else if (code === "ETIMEDOUT" || /timeout/i.test(message)) {
    kind = "timeout";
  } else if (/invalid url|unsupported database protocol/i.test(message)) {
    kind = "config";
  }

  return { kind, code, message };
}

function resolvePoolConfig() {
  const fallbackConfig = {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  };

  const connectionString = config.db.connectionString.trim();
  if (!connectionString) {
    return {
      poolConfig: fallbackConfig,
      details: getSafeDbDetails(fallbackConfig),
      strategy: "DB_FIELDS",
      configError: null,
    };
  }

  try {
    const parsed = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error(`Unsupported database protocol: ${parsed.protocol}`);
    }

    const parsedDetails = {
      host: parsed.hostname || fallbackConfig.host,
      port: parsed.port ? Number.parseInt(parsed.port, 10) || fallbackConfig.port : fallbackConfig.port,
      user: safeDecode(parsed.username) || fallbackConfig.user,
      password: safeDecode(parsed.password) || fallbackConfig.password,
      database: safeDecode(parsed.pathname.replace(/^\/+/, "")) || fallbackConfig.database,
    };

    return {
      poolConfig: { connectionString },
      details: getSafeDbDetails(parsedDetails),
      strategy: "DATABASE_URL",
      configError: null,
    };
  } catch (error) {
    return {
      poolConfig: fallbackConfig,
      details: getSafeDbDetails(fallbackConfig),
      strategy: "DB_FIELDS_FALLBACK",
      configError: error,
    };
  }
}

function updateDbStatus(partial) {
  Object.assign(dbStatus, partial, { lastCheckedAt: new Date().toISOString() });
}

const resolvedDbConfig = resolvePoolConfig();
const dbStatus = {
  connected: false,
  strategy: resolvedDbConfig.strategy,
  details: resolvedDbConfig.details,
  lastError: resolvedDbConfig.configError
    ? classifyDatabaseError(resolvedDbConfig.configError)
    : null,
  lastCheckedAt: null,
};
let connectionContextLogged = false;

export const pool = new Pool({
  ...resolvedDbConfig.poolConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  const details = classifyDatabaseError(err);
  updateDbStatus({ connected: false, lastError: details });
  logger.error(
    `[DB] Unexpected pool error (${details.kind}${details.code ? `/${details.code}` : ""}): ${details.message}`,
  );
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectWithRetry({
  retries = INITIAL_CONNECT_RETRIES,
  delayMs = INITIAL_CONNECT_DELAY_MS,
} = {}) {
  if (!connectionContextLogged) {
    if (resolvedDbConfig.configError) {
      logger.error(
        `[DB] Invalid DATABASE_URL (${resolvedDbConfig.configError.message}). Falling back to DB_HOST/DB_PORT/DB_USER/DB_NAME.`,
      );
    }
    logger.info(`[DB] Connection config source: ${resolvedDbConfig.strategy}`);
    logger.info(`[DB] Target: ${formatDbTarget(resolvedDbConfig.details)}`);
    connectionContextLogged = true;
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    logger.info(
      `[DB] Connection attempt ${attempt}/${retries}: ${formatDbTarget(dbStatus.details)}`,
    );

    let client;
    try {
      client = await pool.connect();
      await client.query("SELECT 1");
      updateDbStatus({ connected: true, lastError: null });
      logger.info(`[DB] Connection established: ${formatDbTarget(dbStatus.details)}`);
      return true;
    } catch (err) {
      const details = classifyDatabaseError(err);
      updateDbStatus({ connected: false, lastError: details });
      logger.error(
        `[DB] Connection failed (${details.kind}${details.code ? `/${details.code}` : ""}): ${details.message}`,
      );

      if (attempt < retries) {
        logger.warn(`[DB] Retrying database connection in ${delayMs}ms`);
        await sleep(delayMs);
      }
    } finally {
      client?.release();
    }
  }

  logger.warn("[DB] Startup retries exhausted; continuing in safe mode without database");
  return false;
}

export function getDatabaseStatus() {
  return {
    connected: dbStatus.connected,
    strategy: dbStatus.strategy,
    details: { ...dbStatus.details },
    lastError: dbStatus.lastError ? { ...dbStatus.lastError } : null,
    lastCheckedAt: dbStatus.lastCheckedAt,
  };
}

export const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    updateDbStatus({ connected: true, lastError: null });
    return result;
  } catch (err) {
    updateDbStatus({ connected: false, lastError: classifyDatabaseError(err) });
    throw err;
  }
};

export { classifyDatabaseError };

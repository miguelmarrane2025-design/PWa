import 'express-async-errors';
import express   from 'express';
import cors      from 'cors';
import helmet    from 'helmet';
import morgan    from 'morgan';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'fs';

import { config }        from './config/index.js';
import { connectWithRetry, getDatabaseStatus } from './db/index.js';
import { logger }        from './lib/logger.js';
import { runMigrations } from './db/migrate.js';

import authRoutes     from './routes/auth.js';
import agentsRoutes   from './routes/agents.js';
import orchestratorRoutes from './routes/orchestrator.js';
import researchRoutes from './routes/research.js';
import { flowMiddleware } from './lib/flow-logger.js';
import chatRoutes     from './routes/chat.js';
import audioRoutes    from './routes/audio.js';
import memoryRoutes   from './routes/memory.js';
import driveRoutes    from './routes/drive.js';
import skillsRoutes   from './routes/skills.js';
import settingsRoutes from './routes/settings.js';
import socialRoutes   from './routes/social.js';
import videoRoutes    from './routes/video.js';
import carouselRoutes from './routes/carousel.js';
import apiRoutes      from './routes/api.js';
import systemRoutes   from './routes/system.js';
import trainingRoutes from './routes/training.js';
import privateAccessRouter from './routes/privateAccess.js';
import { privateAccessGuard } from './auth/privateAccessGuard.js';
import { jobQueue }    from './lib/job-queue.js';
import { scheduleCleanup } from './lib/storage-cleanup.js';
import { processVideoJob } from './routes/video.js';

const app = express();

// ── FIX #1: CORS — origens explícitas, nunca wildcard com credentials ─────
const DEFAULT_ALLOWED_ORIGINS = [
  'http://161.97.78.124',
  'http://161.97.78.124:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    const err = new Error(`CORS: origin ${origin} not allowed`);
    err.status = 403;
    cb(err);
  },
  credentials: true,
}));

app.use(morgan('combined', { stream: { write: m => logger.info(m.trim()) } }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ── FIX #5: Rate limiter global — mais restritivo ──────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Serve storage outputs statically (PDFs, audio exports, etc.)
// Videos are served via /video/download with ownership check
app.use('/storage/outputs', express.static(config.storage.output));
app.use(privateAccessGuard);

app.get('/health', (req, res) => {
  const database = getDatabaseStatus();
  res.json({
    status: database.connected ? 'ok' : 'degraded',
    service: 'botsquad-backend',
    version: '22.0.0',
    time: new Date().toISOString(),
    database,
  });
});

app.use('/auth',     privateAccessRouter);
app.use('/api/auth', privateAccessRouter);
app.use('/auth',     flowMiddleware('auth'),     authRoutes);
app.use('/api/auth', flowMiddleware('auth'),     authRoutes);
app.use('/agents',   flowMiddleware('agents'),   agentsRoutes);
app.use('/orchestrator', flowMiddleware('orchestrator'), orchestratorRoutes);
app.use('/research', flowMiddleware('research'), researchRoutes);
app.use('/chat',     flowMiddleware('chat'),     chatRoutes);
app.use('/audio',    flowMiddleware('audio'),    audioRoutes);
app.use('/memory',   memoryRoutes);
app.use('/drive',    driveRoutes);
app.use('/skills',   flowMiddleware('skill'),    skillsRoutes);
app.use('/video',    flowMiddleware('video'),    videoRoutes);
app.use('/api/video', flowMiddleware('video'),    videoRoutes);
app.use('/api/carousel', flowMiddleware('carousel'), carouselRoutes);
app.use('/system',   flowMiddleware('api'),      systemRoutes);
app.use('/api/system', flowMiddleware('api'),    systemRoutes);
app.use('/training', flowMiddleware('training'), trainingRoutes);
app.use('/api',      flowMiddleware('api'),      apiRoutes);

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const _path    = _require('path');
app.use('/images', express.static(config.storage.output));
app.use('/carousels', express.static(_path.join(config.storage.output, 'carousels')));
app.use('/settings', settingsRoutes);
app.use('/social',   socialRoutes);


app.get("/", (req, res) => {
  res.type("html").send(`
    <html>
      <head><title>BotSquad</title></head>
      <body style="background:#07080b;color:#c6f135;font-family:Arial;padding:40px">
        <h1>BotSquad backend rodando</h1>
        <p>API ativa na porta 3000.</p>
        <p>Health: <a style="color:#4f8eff" href="/health">/health</a></p>
      </body>
    </html>
  `);
});

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── Error handler — structured logging, no internal leak ─────────────────
app.use((err, req, res, next) => {
  const status        = err.status ?? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  const isClientError = status >= 400 && status < 500;
  const clientMessage = err.code === 'LIMIT_FILE_SIZE'
    ? 'Arquivo maior que o limite permitido para esta rota. Use upload em partes quando disponivel.'
    : err.message;

  // Structured error log (captured by Winston JSON in prod)
  logger.error({
    message: `[Error] ${req.method} ${req.path} → ${status}`,
    err:     err.message,
    stack:   status >= 500 ? err.stack : undefined,
    userId:  req.user?.id,
  });

  res.status(status).json({
    error: isClientError ? clientMessage : 'Internal server error',
  });
});

async function start() {
  try {
    await Promise.all(Object.values(config.storage).map(d => fs.mkdir(d, { recursive: true })));

    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(config.port, '0.0.0.0', () => {
        logger.info(`BotSquad v22 backend on port ${config.port}`);
        resolve(instance);
      });
      instance.once('error', reject);
    });

    // Allow long-running jobs (video processing can take 10+ minutes)
    server.headersTimeout = 20 * 60 * 1000;  // 20 min
    server.requestTimeout = 20 * 60 * 1000;

    const databaseConnected = await connectWithRetry();
    if (databaseConnected) {
      const migrationsApplied = await runMigrations({ safeMode: true });
      if (!migrationsApplied) {
        logger.warn('[DB] HTTP server is online, but migrations did not complete');
      }
    } else {
      logger.warn('[DB] HTTP server remains online, but database is unavailable');
    }
  } catch (err) {
    logger.error('Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown — drain active video jobs before exit
async function shutdown(signal) {
  logger.info(`[Shutdown] ${signal} received — draining jobs...`);
  await jobQueue.drain(30_000);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();

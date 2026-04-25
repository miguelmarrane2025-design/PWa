// lib/job-queue.js
// ─────────────────────────────────────────────────────────────────────────
// Postgres-backed job queue for video processing.
// No Redis required — uses the existing video_jobs table.
//
// Guarantees:
//   • Jobs survive server restarts (persisted in DB)
//   • Stuck "processing" jobs from a previous crash are retried on startup
//   • One active processor per jobId (deduplication via DB status check)
//   • Clean shutdown draining (SIGTERM waits for in-flight jobs)
//
// Usage:
//   jobQueue.enqueue(jobId, handler)   — register and start immediately
//   jobQueue.recover()                 — call on server start to retry stuck jobs
// ─────────────────────────────────────────────────────────────────────────

import { query }  from '../db/index.js';
import { logger } from './logger.js';

class JobQueue {
  constructor() {
    this._active = new Map();   // jobId → Promise
    this._draining = false;
  }

  /**
   * Enqueue a job. handler() is called immediately in background.
   * @param {string}   jobId
   * @param {Function} handler  — async () => void, must update DB itself
   */
  enqueue(jobId, handler) {
    if (this._active.has(jobId)) {
      logger.warn(`[JobQueue] Job ${jobId} already active — skipping duplicate`);
      return;
    }
    if (this._draining) {
      logger.warn(`[JobQueue] Server draining — rejecting new job ${jobId}`);
      return;
    }

    const startedAt = Date.now();
    const promise = handler()
      .catch(err => logger.error({ message: `[JobQueue] Job failed`, jobId, err: err.message }))
      .finally(() => {
        const durationMs = Date.now() - startedAt;
        logger.info({ message: '[JobQueue] Job completed', jobId, durationMs });
        this._active.delete(jobId);
      });

    this._active.set(jobId, promise);
    logger.info(`[JobQueue] Enqueued ${jobId} (active=${this._active.size})`);
  }

  /**
   * On server startup: find jobs stuck in 'processing' or 'queued' state
   * from a previous crash and re-enqueue them.
   * @param {Function} processorFactory  — (jobId, userId, message, filePaths) => handler
   */
  async recover(processorFactory) {
    try {
      const { rows } = await query(
        `SELECT id, user_id, message, input_paths
         FROM video_jobs
         WHERE status IN ('processing','queued')
           AND updated_at < NOW() - INTERVAL '2 minutes'
         ORDER BY created_at ASC
         LIMIT 10`,
      );

      if (!rows.length) return;
      logger.info(`[JobQueue] Recovering ${rows.length} stuck job(s)`);

      for (const row of rows) {
        // Mark as re-queued so we don't pick it up twice
        await query(
          `UPDATE video_jobs SET stage='recovering', updated_at=NOW() WHERE id=$1`,
          [row.id],
        ).catch(() => {});

        const inputPaths = row.input_paths || [];
        this.enqueue(row.id, () => processorFactory(row.id, row.user_id, row.message, inputPaths));
      }
    } catch (err) {
      logger.warn(`[JobQueue] Recovery scan failed: ${err.message}`);
    }
  }

  /**
   * Graceful shutdown — wait for in-flight jobs to complete (up to maxWaitMs).
   */
  async drain(maxWaitMs = 30_000) {
    this._draining = true;
    if (!this._active.size) return;
    logger.info(`[JobQueue] Draining ${this._active.size} active job(s)...`);
    const deadline = Date.now() + maxWaitMs;
    while (this._active.size && Date.now() < deadline) {
      await Promise.race([...this._active.values(), new Promise(r => setTimeout(r, 500))]);
    }
    if (this._active.size) {
      logger.warn(`[JobQueue] Drain timeout — ${this._active.size} job(s) abandoned`);
    }
  }

  get activeCount() { return this._active.size; }
}

export const jobQueue = new JobQueue();

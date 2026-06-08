import { pool } from "@workspace/db";
import { logger } from "./logger";

export interface JobRecord {
  id: number;
  projectId: number;
  userId: number | null;
  status: string;
  provider: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  scheduledAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export interface EnqueueParams {
  projectId: number;
  userId?: number | null;
  provider?: string | null;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: row.id as number,
    projectId: row.project_id as number,
    userId: row.user_id as number | null,
    status: row.status as string,
    provider: row.provider as string | null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    errorMessage: row.error_message as string | null,
    lockedAt: row.locked_at ? new Date(row.locked_at as string) : null,
    lockedBy: row.locked_by as string | null,
    scheduledAt: new Date(row.scheduled_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Postgres-based job queue for generation crash recovery.
 * Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent dequeue.
 */
export class JobQueue {
  /**
   * Enqueue a new generation job.
   */
  async enqueue(params: EnqueueParams): Promise<JobRecord> {
    const { projectId, userId, provider, payload, maxAttempts = 3 } = params;
    const result = await pool.query(
      `INSERT INTO generation_jobs (project_id, user_id, provider, payload, max_attempts, status, scheduled_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
       RETURNING *`,
      [projectId, userId ?? null, provider ?? null, JSON.stringify(payload), maxAttempts],
    );
    return rowToJob(result.rows[0]);
  }

  /**
   * Dequeue up to batchSize jobs using SELECT FOR UPDATE SKIP LOCKED.
   * Atomically locks retrieved jobs by setting status to 'processing'.
   */
  async dequeue(workerId: string, batchSize = 1): Promise<JobRecord[]> {
    const result = await pool.query(
      `UPDATE generation_jobs
       SET status = 'processing', locked_at = NOW(), locked_by = $1, attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM generation_jobs
         WHERE status = 'pending' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [workerId, batchSize],
    );
    return result.rows.map(rowToJob);
  }

  /**
   * Mark a job as completed.
   */
  async complete(jobId: number): Promise<void> {
    await pool.query(
      `UPDATE generation_jobs SET status = 'completed', completed_at = NOW(), locked_at = NULL, locked_by = NULL WHERE id = $1`,
      [jobId],
    );
  }

  /**
   * Mark a job as failed. If attempts < maxAttempts, re-queue it as pending.
   * Otherwise mark it as 'dead' (dead-letter).
   */
  async fail(jobId: number, error: string): Promise<void> {
    const result = await pool.query(
      `SELECT attempts, max_attempts FROM generation_jobs WHERE id = $1`,
      [jobId],
    );
    if (result.rows.length === 0) return;

    const { attempts, max_attempts } = result.rows[0];
    if (attempts >= max_attempts) {
      await pool.query(
        `UPDATE generation_jobs SET status = 'dead', error_message = $2, locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [jobId, error],
      );
    } else {
      await pool.query(
        `UPDATE generation_jobs SET status = 'pending', error_message = $2, locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [jobId, error],
      );
    }
  }

  /**
   * Extend the lock on a job (heartbeat) to prevent it from being reaped.
   */
  async heartbeat(jobId: number): Promise<void> {
    await pool.query(
      `UPDATE generation_jobs SET locked_at = NOW() WHERE id = $1 AND status = 'processing'`,
      [jobId],
    );
  }

  /**
   * Reap stale jobs that have been locked longer than timeoutMs without a heartbeat.
   * Re-queues them as 'pending' if under max_attempts, otherwise marks 'dead'.
   */
  async reapStaleJobs(timeoutMs = 300000): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs);

    // First mark dead any that exceeded max_attempts
    await pool.query(
      `UPDATE generation_jobs
       SET status = 'dead', error_message = 'Reaped: exceeded lock timeout', locked_at = NULL, locked_by = NULL
       WHERE status = 'processing' AND locked_at < $1 AND attempts >= max_attempts`,
      [cutoff.toISOString()],
    );

    // Then re-queue the rest
    const result = await pool.query(
      `UPDATE generation_jobs
       SET status = 'pending', locked_at = NULL, locked_by = NULL
       WHERE status = 'processing' AND locked_at < $1
       RETURNING id`,
      [cutoff.toISOString()],
    );

    const reaped = result.rowCount ?? 0;
    if (reaped > 0) {
      logger.info({ reaped, timeoutMs }, "Reaped stale generation jobs");
    }
    return reaped;
  }

  /**
   * Get queue metrics (counts by status).
   */
  async getMetrics(): Promise<{ pending: number; processing: number; completed: number; failed: number; dead: number }> {
    const result = await pool.query(
      `SELECT status, COUNT(*)::int as count FROM generation_jobs GROUP BY status`,
    );
    const metrics = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
    for (const row of result.rows) {
      const s = row.status as keyof typeof metrics;
      if (s in metrics) {
        metrics[s] = row.count;
      }
    }
    return metrics;
  }
}

/** Singleton job queue instance. */
export const jobQueue = new JobQueue();

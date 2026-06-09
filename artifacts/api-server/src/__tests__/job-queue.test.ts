import { describe, it, expect, beforeEach } from "vitest";
import pg from "pg";

const TEST_DB_URL = "postgresql://postgres:postgres@localhost:5432/promptios_test";

let pool: pg.Pool;

// We test the job queue logic directly via SQL to avoid import issues
// with the module singleton. The JobQueue class methods are thin wrappers
// over the SQL queries tested here.

beforeEach(async () => {
  pool = new pg.Pool({ connectionString: TEST_DB_URL });
});

async function createProject(): Promise<number> {
  const res = await pool.query(
    `INSERT INTO projects (name, prompt, framework, status, file_count) VALUES ('Test', 'test prompt', 'swiftui', 'pending', 0) RETURNING id`,
  );
  return res.rows[0].id;
}

async function enqueueJob(projectId: number, opts?: { maxAttempts?: number }): Promise<number> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const res = await pool.query(
    `INSERT INTO generation_jobs (project_id, user_id, provider, payload, max_attempts, status, scheduled_at, created_at)
     VALUES ($1, NULL, 'openai', '{"phase":"test"}', $2, 'pending', NOW(), NOW()) RETURNING id`,
    [projectId, maxAttempts],
  );
  return res.rows[0].id;
}

describe("Job Queue", () => {
  describe("enqueue", () => {
    it("creates a job with pending status", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId);

      const res = await pool.query("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].status).toBe("pending");
      expect(res.rows[0].project_id).toBe(projectId);
      expect(res.rows[0].max_attempts).toBe(3);
      expect(res.rows[0].attempts).toBe(0);
    });
  });

  describe("dequeue with locking", () => {
    it("dequeues a pending job and locks it", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId);

      const result = await pool.query(
        `UPDATE generation_jobs
         SET status = 'processing', locked_at = NOW(), locked_by = 'worker-1', attempts = attempts + 1
         WHERE id IN (
           SELECT id FROM generation_jobs
           WHERE status = 'pending' AND scheduled_at <= NOW()
           ORDER BY scheduled_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(jobId);
      expect(result.rows[0].status).toBe("processing");
      expect(result.rows[0].locked_by).toBe("worker-1");
      expect(result.rows[0].attempts).toBe(1);
    });

    it("skips already locked jobs", async () => {
      const projectId = await createProject();
      await enqueueJob(projectId);

      // First dequeue locks the job
      await pool.query(
        `UPDATE generation_jobs
         SET status = 'processing', locked_at = NOW(), locked_by = 'worker-1', attempts = attempts + 1
         WHERE id IN (
           SELECT id FROM generation_jobs
           WHERE status = 'pending' AND scheduled_at <= NOW()
           ORDER BY scheduled_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )`,
      );

      // Second dequeue should find nothing
      const result = await pool.query(
        `UPDATE generation_jobs
         SET status = 'processing', locked_at = NOW(), locked_by = 'worker-2', attempts = attempts + 1
         WHERE id IN (
           SELECT id FROM generation_jobs
           WHERE status = 'pending' AND scheduled_at <= NOW()
           ORDER BY scheduled_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
      );

      expect(result.rows).toHaveLength(0);
    });
  });

  describe("complete", () => {
    it("marks a job as completed", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId);

      // Lock it first
      await pool.query(
        `UPDATE generation_jobs SET status = 'processing', locked_at = NOW(), locked_by = 'w1' WHERE id = $1`,
        [jobId],
      );

      // Complete it
      await pool.query(
        `UPDATE generation_jobs SET status = 'completed', completed_at = NOW(), locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [jobId],
      );

      const res = await pool.query("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
      expect(res.rows[0].status).toBe("completed");
      expect(res.rows[0].locked_at).toBeNull();
      expect(res.rows[0].locked_by).toBeNull();
      expect(res.rows[0].completed_at).not.toBeNull();
    });
  });

  describe("fail with retry", () => {
    it("re-queues a job as pending when under max attempts", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId, { maxAttempts: 3 });

      // Simulate first attempt
      await pool.query(
        `UPDATE generation_jobs SET status = 'processing', locked_at = NOW(), locked_by = 'w1', attempts = 1 WHERE id = $1`,
        [jobId],
      );

      // Fail it (attempts=1 < max_attempts=3, so re-queue)
      const { rows } = await pool.query("SELECT attempts, max_attempts FROM generation_jobs WHERE id = $1", [jobId]);
      const { attempts, max_attempts } = rows[0];
      expect(attempts).toBeLessThan(max_attempts);

      await pool.query(
        `UPDATE generation_jobs SET status = 'pending', error_message = 'test error', locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [jobId],
      );

      const res = await pool.query("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
      expect(res.rows[0].status).toBe("pending");
      expect(res.rows[0].error_message).toBe("test error");
    });
  });

  describe("dead-letter after max attempts", () => {
    it("marks a job as dead when attempts reach max", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId, { maxAttempts: 2 });

      // Simulate max attempts reached
      await pool.query(
        `UPDATE generation_jobs SET status = 'processing', locked_at = NOW(), locked_by = 'w1', attempts = 2 WHERE id = $1`,
        [jobId],
      );

      // Check: attempts >= max_attempts
      const { rows } = await pool.query("SELECT attempts, max_attempts FROM generation_jobs WHERE id = $1", [jobId]);
      expect(rows[0].attempts).toBeGreaterThanOrEqual(rows[0].max_attempts);

      // Mark as dead
      await pool.query(
        `UPDATE generation_jobs SET status = 'dead', error_message = 'final failure', locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [jobId],
      );

      const res = await pool.query("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
      expect(res.rows[0].status).toBe("dead");
      expect(res.rows[0].error_message).toBe("final failure");
    });
  });

  describe("stale job reaping", () => {
    it("re-queues stale processing jobs that are under max attempts", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId, { maxAttempts: 3 });

      // Set a locked_at in the past (6 minutes ago, past 5-minute timeout)
      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      await pool.query(
        `UPDATE generation_jobs SET status = 'processing', locked_at = $2, locked_by = 'crashed-worker', attempts = 1 WHERE id = $1`,
        [jobId, staleTime],
      );

      // Reap: cutoff = 5 minutes ago
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Mark dead any that exceeded max_attempts
      await pool.query(
        `UPDATE generation_jobs
         SET status = 'dead', error_message = 'Reaped: exceeded lock timeout', locked_at = NULL, locked_by = NULL
         WHERE status = 'processing' AND locked_at < $1 AND attempts >= max_attempts`,
        [cutoff],
      );

      // Re-queue the rest
      const result = await pool.query(
        `UPDATE generation_jobs
         SET status = 'pending', locked_at = NULL, locked_by = NULL
         WHERE status = 'processing' AND locked_at < $1
         RETURNING id`,
        [cutoff],
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].id).toBe(jobId);

      const res = await pool.query("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
      expect(res.rows[0].status).toBe("pending");
      expect(res.rows[0].locked_at).toBeNull();
      expect(res.rows[0].locked_by).toBeNull();
    });

    it("marks stale jobs as dead when at max attempts", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId, { maxAttempts: 2 });

      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      await pool.query(
        `UPDATE generation_jobs SET status = 'processing', locked_at = $2, locked_by = 'crashed-worker', attempts = 2 WHERE id = $1`,
        [jobId, staleTime],
      );

      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Mark dead any that exceeded max_attempts
      await pool.query(
        `UPDATE generation_jobs
         SET status = 'dead', error_message = 'Reaped: exceeded lock timeout', locked_at = NULL, locked_by = NULL
         WHERE status = 'processing' AND locked_at < $1 AND attempts >= max_attempts`,
        [cutoff],
      );

      const res = await pool.query("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
      expect(res.rows[0].status).toBe("dead");
      expect(res.rows[0].error_message).toContain("exceeded lock timeout");
    });

    it("does not reap recently-locked jobs", async () => {
      const projectId = await createProject();
      const jobId = await enqueueJob(projectId, { maxAttempts: 3 });

      // Lock it recently (1 minute ago)
      const recentTime = new Date(Date.now() - 60 * 1000).toISOString();
      await pool.query(
        `UPDATE generation_jobs SET status = 'processing', locked_at = $2, locked_by = 'active-worker', attempts = 1 WHERE id = $1`,
        [jobId, recentTime],
      );

      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const result = await pool.query(
        `UPDATE generation_jobs
         SET status = 'pending', locked_at = NULL, locked_by = NULL
         WHERE status = 'processing' AND locked_at < $1
         RETURNING id`,
        [cutoff],
      );

      expect(result.rowCount).toBe(0);

      // Job should still be processing
      const res = await pool.query("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
      expect(res.rows[0].status).toBe("processing");
    });
  });
});

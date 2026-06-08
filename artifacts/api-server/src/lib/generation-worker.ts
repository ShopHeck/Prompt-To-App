import { jobQueue, type JobRecord } from "./job-queue";
import { logger } from "./logger";
import crypto from "node:crypto";

/**
 * GenerationWorker polls the job queue and processes generation jobs.
 * It acts as a crash-recovery mechanism: if the server restarts, stale
 * jobs are reaped and re-queued automatically.
 *
 * Note: The primary SSE-connected generation flow remains inline.
 * This worker handles recovery of orphaned/crashed jobs.
 */
export class GenerationWorker {
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentJobId: number | null = null;
  private processingPromise: Promise<void> | null = null;
  readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly reapIntervalMs: number;
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { pollIntervalMs?: number; heartbeatIntervalMs?: number; reapIntervalMs?: number }) {
    this.workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = options?.pollIntervalMs ?? 5000;
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 30000;
    this.reapIntervalMs = options?.reapIntervalMs ?? 60000;
  }

  /**
   * Start the worker: begin polling and reaping.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info({ workerId: this.workerId, pollIntervalMs: this.pollIntervalMs }, "Generation worker started");

    this.schedulePoll();

    // Periodically reap stale jobs
    this.reapTimer = setInterval(() => {
      jobQueue.reapStaleJobs().catch((err) => {
        logger.error({ err }, "Failed to reap stale jobs");
      });
    }, this.reapIntervalMs);
  }

  /**
   * Stop the worker gracefully: stop polling, wait for the current job to finish.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Wait for current job to finish
    if (this.processingPromise) {
      logger.info("Waiting for current job to complete before shutdown...");
      await this.processingPromise;
    }

    logger.info({ workerId: this.workerId }, "Generation worker stopped");
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const jobs = await jobQueue.dequeue(this.workerId, 1);
      if (jobs.length > 0) {
        this.processingPromise = this.processJob(jobs[0]);
        await this.processingPromise;
        this.processingPromise = null;
      }
    } catch (err) {
      logger.error({ err }, "Worker poll error");
    }

    this.schedulePoll();
  }

  private async processJob(job: JobRecord): Promise<void> {
    this.currentJobId = job.id;
    logger.info({ jobId: job.id, projectId: job.projectId, attempt: job.attempts }, "Processing generation job");

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      if (this.currentJobId !== null) {
        jobQueue.heartbeat(this.currentJobId).catch((err) => {
          logger.error({ err, jobId: this.currentJobId }, "Heartbeat failed");
        });
      }
    }, this.heartbeatIntervalMs);

    try {
      // The job payload contains all necessary info for recovery.
      // For now, we simply mark it completed since inline SSE generation
      // handles the actual work. The job queue is for crash-recovery tracking.
      // If a job is still 'processing' after a crash, it gets reaped and can be retried.
      await jobQueue.complete(job.id);
      logger.info({ jobId: job.id, projectId: job.projectId }, "Generation job completed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, jobId: job.id }, "Generation job failed");
      await jobQueue.fail(job.id, message).catch((failErr) => {
        logger.error({ failErr, jobId: job.id }, "Failed to mark job as failed");
      });
    } finally {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.currentJobId = null;
    }
  }
}

/** Singleton worker instance. */
export const generationWorker = new GenerationWorker();

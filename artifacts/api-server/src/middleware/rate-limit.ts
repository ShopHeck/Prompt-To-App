import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0]!.split(",")[0]!.trim();
  return req.ip ?? "unknown";
}

/**
 * Delete expired rate limit hit rows. Called on a recurring interval
 * and exported for manual/scheduled invocation.
 */
export async function cleanupExpiredHits(): Promise<void> {
  await pool.query("DELETE FROM rate_limit_hits WHERE hit_at < NOW() - INTERVAL '1 hour'");
}

// Module-level singleton cleanup timer (shared across all limiter instances)
let cleanupTimerStarted = false;

function ensureCleanupTimer(): void {
  if (cleanupTimerStarted || process.env.NODE_ENV === "test") return;
  cleanupTimerStarted = true;
  setInterval(() => {
    cleanupExpiredHits().catch(() => { /* best-effort cleanup */ });
  }, 5 * 60 * 1000).unref();
}

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, message } = config;

  // Bypass rate limiting in test environment
  if (process.env.NODE_ENV === "test") {
    return (_req: Request, _res: Response, next: NextFunction): void => { next(); };
  }

  // Start the shared cleanup timer (no-op if already started)
  ensureCleanupTimer();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${ip}:${req.path}`;
    const windowSeconds = windowMs / 1000;

    // Count recent hits within the sliding window and insert the current hit
    const countQuery = `
      SELECT COUNT(*)::int AS hit_count
      FROM rate_limit_hits
      WHERE key = $1 AND hit_at > NOW() - ($2 || ' seconds')::interval
    `;

    pool.query(countQuery, [key, String(windowSeconds)])
      .then((result) => {
        const hitCount: number = result.rows[0]?.hit_count ?? 0;

        if (hitCount >= maxRequests) {
          const retryAfter = Math.ceil(windowMs / 1000);
          res.setHeader("Retry-After", String(retryAfter));
          res.status(429).json({
            error: message ?? "Too many requests. Please try again later.",
            retryAfter,
          });
          return;
        }

        // Record the hit
        return pool.query(
          "INSERT INTO rate_limit_hits (key, hit_at) VALUES ($1, NOW())",
          [key],
        ).then(() => {
          const remaining = maxRequests - hitCount - 1;
          const resetEpochSeconds = Math.ceil((Date.now() + windowMs) / 1000);

          res.setHeader("X-RateLimit-Limit", String(maxRequests));
          res.setHeader("X-RateLimit-Remaining", String(remaining));
          res.setHeader("X-RateLimit-Reset", String(resetEpochSeconds));

          next();
        });
      })
      .catch((err: unknown) => {
        // If the DB is unreachable, allow the request through (fail-open)
        console.error("[rate-limit] Postgres error, failing open:", err);
        next();
      });
  };
}

// Pre-configured limiters
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  maxRequests: 60,
  message: "Too many API requests. Please slow down.",
});

export const generationLimiter = rateLimit({
  windowMs: 60_000,
  maxRequests: 5,
  message: "Too many generation requests. Please wait a minute before trying again.",
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  maxRequests: 10,
  message: "Too many authentication attempts. Please try again in 15 minutes.",
});

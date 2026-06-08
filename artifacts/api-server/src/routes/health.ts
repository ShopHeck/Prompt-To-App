import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, sql } from "@workspace/db";
import { isEnabled as isSentryEnabled } from "../lib/sentry";
import { metricsSnapshot, generationMetricsSnapshot } from "../middleware/metrics";
import { requireAuth } from "../middleware/auth";
import { jobQueue } from "../lib/job-queue";

const router: IRouter = Router();
const startedAt = Date.now();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  const status = allOk ? 200 : 503;

  res.status(status).json({
    status: allOk ? "ready" : "degraded",
    checks,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    version: process.env.RELEASE_SHA ?? "dev",
    environment: process.env.NODE_ENV ?? "development",
    sentry: isSentryEnabled(),
    metrics: metricsSnapshot(),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

/**
 * Admin guard: requires either a valid ADMIN_API_KEY header or the user's ID
 * to be in the ADMIN_USER_IDS comma-separated list.
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (adminApiKey) {
    const providedKey = req.headers["x-admin-api-key"];
    if (providedKey === adminApiKey) {
      next();
      return;
    }
  }

  const adminUserIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (req.user && adminUserIds.includes(String(req.user.id))) {
    next();
    return;
  }

  res.status(403).json({ error: "Admin access required" });
}

router.get("/admin/metrics", requireAuth, requireAdmin, (_req, res) => {
  res.json({
    http: metricsSnapshot(),
    generation: generationMetricsSnapshot(),
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  });
});

router.get("/admin/jobs", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const metrics = await jobQueue.getMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: "Failed to get job queue metrics" });
  }
});

export default router;

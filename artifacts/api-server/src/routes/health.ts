import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, sql } from "@workspace/db";
import { isEnabled as isSentryEnabled } from "../lib/sentry";
import { metricsSnapshot } from "../middleware/metrics";

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

export default router;

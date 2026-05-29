import type { Request, Response, NextFunction } from "express";

interface Metrics {
  totalRequests: number;
  totalErrors: number;
  statusCodes: Record<string, number>;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
}

let totalRequests = 0;
let totalErrors = 0;
const statusCodes: Record<string, number> = {};
const responseTimes: number[] = [];
const MAX_SAMPLES = 1000;

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    totalRequests++;
    if (res.statusCode >= 500) totalErrors++;

    const bucket = `${Math.floor(res.statusCode / 100)}xx`;
    statusCodes[bucket] = (statusCodes[bucket] ?? 0) + 1;

    responseTimes.push(durationMs);
    if (responseTimes.length > MAX_SAMPLES) responseTimes.shift();
  });

  next();
}

export function metricsSnapshot(): Metrics {
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const avg = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
  const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] ?? 0 : 0;

  return {
    totalRequests,
    totalErrors,
    statusCodes: { ...statusCodes },
    avgResponseTimeMs: Math.round(avg * 100) / 100,
    p95ResponseTimeMs: Math.round(p95 * 100) / 100,
  };
}

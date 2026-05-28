import type { Request, Response, NextFunction } from "express";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

const ipHits = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0]!.split(",")[0]!.trim();
  return req.ip ?? "unknown";
}

function pruneStale(): void {
  const now = Date.now();
  for (const [ip, hits] of ipHits) {
    const recent = hits.filter((t) => now - t < 120_000);
    if (recent.length === 0) {
      ipHits.delete(ip);
    } else {
      ipHits.set(ip, recent);
    }
  }
}

// Prune every 5 minutes to prevent memory growth
setInterval(pruneStale, 5 * 60 * 1000).unref();

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, message } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const now = Date.now();
    const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);

    if (hits.length >= maxRequests) {
      ipHits.set(ip, hits);
      const retryAfter = Math.ceil(windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: message ?? "Too many requests. Please try again later.",
        retryAfter,
      });
      return;
    }

    hits.push(now);
    ipHits.set(ip, hits);

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(maxRequests - hits.length));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));

    next();
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

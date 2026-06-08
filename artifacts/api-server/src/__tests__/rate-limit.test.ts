import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock @workspace/db before importing the module under test
vi.mock("@workspace/db", () => {
  const mockPool = {
    query: vi.fn(),
  };
  return {
    pool: mockPool,
    db: {},
    usersTable: {},
    eq: vi.fn(),
  };
});

import { pool } from "@workspace/db";

// We need to test the actual rateLimit function behavior.
// The module reads NODE_ENV at import time, so we control it via env.
describe("rate-limit middleware", () => {
  const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockReq(path = "/api/test", ip = "127.0.0.1"): Request {
    return {
      headers: {},
      path,
      ip,
    } as unknown as Request;
  }

  function createMockRes(): Response & { _headers: Record<string, string>; _status: number | null; _body: unknown } {
    const res = {
      _headers: {} as Record<string, string>,
      _status: null as number | null,
      _body: null as unknown,
      setHeader(name: string, value: string) {
        res._headers[name] = value;
        return res;
      },
      status(code: number) {
        res._status = code;
        return res;
      },
      json(body: unknown) {
        res._body = body;
        return res;
      },
    };
    return res as unknown as Response & { _headers: Record<string, string>; _status: number | null; _body: unknown };
  }

  describe("test environment bypass", () => {
    it("calls next() immediately when NODE_ENV is test", async () => {
      // The rateLimit function checks NODE_ENV at creation time.
      // Since our test env is 'test', imported limiters will bypass.
      const { rateLimit } = await import("../middleware/rate-limit");
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 5 });

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting behavior (non-test env)", () => {
    let rateLimitFn: (config: { windowMs: number; maxRequests: number; message?: string }) => (req: Request, res: Response, next: NextFunction) => void;

    beforeEach(async () => {
      // Use dynamic import with env override to get non-test behavior
      vi.stubEnv("NODE_ENV", "production");
      // Reset module registry to re-evaluate with new NODE_ENV
      vi.resetModules();
      // Re-mock after reset
      vi.doMock("@workspace/db", () => ({
        pool: mockPool,
        db: {},
        usersTable: {},
        eq: vi.fn(),
      }));
      const mod = await import("../middleware/rate-limit");
      rateLimitFn = mod.rateLimit;
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("allows requests under the limit and sets correct headers", async () => {
      const middleware = rateLimitFn({ windowMs: 60000, maxRequests: 10 });

      // Mock: 3 hits in current window
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ hit_count: 3 }] }) // count query
        .mockResolvedValueOnce({ rows: [] }); // insert query

      const req = createMockReq();
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        const wrappedNext = vi.fn(() => { resolve(); }) as unknown as NextFunction;
        middleware(req, res as unknown as Response, wrappedNext);
      });

      expect(res._headers["X-RateLimit-Limit"]).toBe("10");
      expect(res._headers["X-RateLimit-Remaining"]).toBe("6"); // 10 - 3 - 1
      expect(res._headers["X-RateLimit-Reset"]).toBeDefined();
    });

    it("returns 429 when limit is exceeded", async () => {
      const middleware = rateLimitFn({ windowMs: 60000, maxRequests: 5 });

      // Mock: 5 hits already (at limit)
      mockPool.query.mockResolvedValueOnce({ rows: [{ hit_count: 5 }] });

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = ((body: unknown) => {
          origJson(body);
          resolve();
          return res;
        }) as typeof res.json;
        middleware(req, res as unknown as Response, next as unknown as NextFunction);
      });

      expect(res._status).toBe(429);
      expect(res._body).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("Too many requests"),
          retryAfter: 60,
        }),
      );
      expect(res._headers["Retry-After"]).toBe("60");
    });

    it("returns 429 with custom message when limit exceeded", async () => {
      const middleware = rateLimitFn({
        windowMs: 60000,
        maxRequests: 2,
        message: "Custom rate limit message",
      });

      mockPool.query.mockResolvedValueOnce({ rows: [{ hit_count: 2 }] });

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        res.json = ((body: unknown) => {
          origJson(body);
          resolve();
          return res;
        }) as typeof res.json;
        middleware(req, res as unknown as Response, next as unknown as NextFunction);
      });

      expect(res._status).toBe(429);
      expect((res._body as { error: string }).error).toBe("Custom rate limit message");
    });

    it("sets correct remaining count", async () => {
      const middleware = rateLimitFn({ windowMs: 60000, maxRequests: 10 });

      // 0 hits so far
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ hit_count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = createMockReq();
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        const wrappedNext = vi.fn(() => { resolve(); }) as unknown as NextFunction;
        middleware(req, res as unknown as Response, wrappedNext);
      });

      // remaining = maxRequests - hitCount - 1 = 10 - 0 - 1 = 9
      expect(res._headers["X-RateLimit-Remaining"]).toBe("9");
    });

    it("fails open when DB is unreachable", async () => {
      const middleware = rateLimitFn({ windowMs: 60000, maxRequests: 5 });

      // Mock DB error
      mockPool.query.mockRejectedValueOnce(new Error("connection refused"));

      const req = createMockReq();
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        const wrappedNext = vi.fn(() => { resolve(); }) as unknown as NextFunction;
        middleware(req, res as unknown as Response, wrappedNext);
      });

      // Should call next() despite DB error (fail-open)
      expect(res._status).toBeNull();
    });

    it("extracts client IP from x-forwarded-for header", async () => {
      const middleware = rateLimitFn({ windowMs: 60000, maxRequests: 10 });

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ hit_count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = {
        headers: { "x-forwarded-for": "10.0.0.1, 192.168.1.1" },
        path: "/api/test",
        ip: "127.0.0.1",
      } as unknown as Request;
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        const wrappedNext = vi.fn(() => { resolve(); }) as unknown as NextFunction;
        middleware(req, res as unknown as Response, wrappedNext);
      });

      // The key should use the first IP from x-forwarded-for
      const countCall = mockPool.query.mock.calls[0];
      expect(countCall![1]![0]).toBe("10.0.0.1:/api/test");
    });
  });

  describe("cleanupExpiredHits", () => {
    it("deletes expired rows from rate_limit_hits", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const { cleanupExpiredHits } = await import("../middleware/rate-limit");
      await cleanupExpiredHits();

      expect(mockPool.query).toHaveBeenCalledWith(
        "DELETE FROM rate_limit_hits WHERE hit_at < NOW() - INTERVAL '1 hour'",
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock @workspace/db before importing the module under test
vi.mock("@workspace/db", () => {
  const mockPool = {
    query: vi.fn(),
  };
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    pool: mockPool,
    usersTable: {
      id: "id",
      plan: "plan",
      monthlyGenerations: "monthly_generations",
      monthlyGenerationsResetAt: "monthly_generations_reset_at",
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  };
});

import { db, pool, eq as _eq } from "@workspace/db";
import { getQuota, incrementUsage, enforceQuota } from "../middleware/quota";

// Helper to create mock select chain
function setupSelectChain(result: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
  (db as unknown as { select: ReturnType<typeof vi.fn> }).select.mockReturnValue(chain);
  return chain;
}

// Helper to create mock update chain
function setupUpdateChain() {
  const chain = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  (db as unknown as { update: ReturnType<typeof vi.fn> }).update.mockReturnValue(chain);
  return chain;
}

function createMockReqResNext() {
  const req = { user: { id: 1 } } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quota middleware", () => {
  describe("getQuota - month reset logic", () => {
    it("resets counter when month changes", async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const selectChain = setupSelectChain([
        { monthlyGenerations: 3, resetAt: lastMonth },
      ]);
      setupUpdateChain();

      // Second call for getQuota's own select (after resetIfNewMonth)
      selectChain.where
        .mockResolvedValueOnce([{ monthlyGenerations: 3, resetAt: lastMonth }])
        .mockResolvedValueOnce([{ plan: "free", monthlyGenerations: 0 }]);

      const quota = await getQuota(1);

      // Update should have been called to reset the counter
      expect((db as unknown as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalled();
      expect(quota.used).toBe(0);
    });

    it("does NOT reset counter within same month", async () => {
      const thisMonth = new Date();

      const selectChain = setupSelectChain([
        { monthlyGenerations: 3, resetAt: thisMonth },
      ]);

      selectChain.where
        .mockResolvedValueOnce([{ monthlyGenerations: 3, resetAt: thisMonth }])
        .mockResolvedValueOnce([{ plan: "free", monthlyGenerations: 3 }]);

      const quota = await getQuota(1);

      // Update should NOT have been called
      expect((db as unknown as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
      expect(quota.used).toBe(3);
    });
  });

  describe("getQuota - plan limits", () => {
    it("returns limit of 5 for free plan", async () => {
      const now = new Date();
      setupSelectChain([{ monthlyGenerations: 2, resetAt: now }]).where
        .mockResolvedValueOnce([{ monthlyGenerations: 2, resetAt: now }])
        .mockResolvedValueOnce([{ plan: "free", monthlyGenerations: 2 }]);

      const quota = await getQuota(1);
      expect(quota.plan).toBe("free");
      expect(quota.limit).toBe(5);
      expect(quota.allowed).toBe(true);
    });

    it("returns limit of 50 for pro plan", async () => {
      const now = new Date();
      setupSelectChain([{ monthlyGenerations: 10, resetAt: now }]).where
        .mockResolvedValueOnce([{ monthlyGenerations: 10, resetAt: now }])
        .mockResolvedValueOnce([{ plan: "pro", monthlyGenerations: 10 }]);

      const quota = await getQuota(1);
      expect(quota.plan).toBe("pro");
      expect(quota.limit).toBe(50);
      expect(quota.allowed).toBe(true);
    });

    it("returns Infinity limit for studio plan", async () => {
      const now = new Date();
      setupSelectChain([{ monthlyGenerations: 100, resetAt: now }]).where
        .mockResolvedValueOnce([{ monthlyGenerations: 100, resetAt: now }])
        .mockResolvedValueOnce([{ plan: "studio", monthlyGenerations: 100 }]);

      const quota = await getQuota(1);
      expect(quota.plan).toBe("studio");
      expect(quota.limit).toBe(Infinity);
      expect(quota.allowed).toBe(true);
    });

    it("returns default free plan for unknown user", async () => {
      setupSelectChain([]).where
        .mockResolvedValueOnce([]) // resetIfNewMonth - no user
        .mockResolvedValueOnce([]); // getQuota select - no user

      const quota = await getQuota(999);
      expect(quota.plan).toBe("free");
      expect(quota.limit).toBe(5);
      expect(quota.used).toBe(0);
      expect(quota.allowed).toBe(true);
    });
  });

  describe("enforceQuota", () => {
    it("allows request when under limit", async () => {
      const now = new Date();
      setupSelectChain([{ monthlyGenerations: 2, resetAt: now }]).where
        .mockResolvedValueOnce([{ monthlyGenerations: 2, resetAt: now }])
        .mockResolvedValueOnce([{ plan: "free", monthlyGenerations: 2 }]);

      const { req, res } = createMockReqResNext();

      await new Promise<void>((resolve) => {
        const wrappedNext = vi.fn(() => { resolve(); }) as unknown as NextFunction;
        enforceQuota(req, res, wrappedNext);
      });

      expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("returns 403 when at limit", async () => {
      const now = new Date();
      setupSelectChain([{ monthlyGenerations: 5, resetAt: now }]).where
        .mockResolvedValueOnce([{ monthlyGenerations: 5, resetAt: now }])
        .mockResolvedValueOnce([{ plan: "free", monthlyGenerations: 5 }]);

      const { req, res, next } = createMockReqResNext();

      await new Promise<void>((resolve) => {
        (res.json as ReturnType<typeof vi.fn>).mockImplementation(() => {
          resolve();
          return res;
        });
        enforceQuota(req, res, next);
      });

      expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
      expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Monthly generation limit reached"),
        }),
      );
    });

    it("allows request for unauthenticated users (no req.user)", async () => {
      const req = {} as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      enforceQuota(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("allows request on quota check failure (fail-open)", async () => {
      setupSelectChain([]).where.mockRejectedValueOnce(new Error("DB connection failed"));

      const { req, res } = createMockReqResNext();

      await new Promise<void>((resolve) => {
        const wrappedNext = vi.fn(() => { resolve(); }) as unknown as NextFunction;
        enforceQuota(req, res, wrappedNext);
      });

      expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });
  });

  describe("incrementUsage", () => {
    it("atomically increments the counter via SQL", async () => {
      (pool as unknown as { query: ReturnType<typeof vi.fn> }).query.mockResolvedValueOnce({ rows: [] });

      await incrementUsage(42);

      expect((pool as unknown as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledWith(
        "UPDATE users SET monthly_generations = monthly_generations + 1 WHERE id = $1",
        [42],
      );
    });
  });
});

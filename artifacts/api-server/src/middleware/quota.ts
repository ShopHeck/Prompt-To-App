import type { Request, Response, NextFunction } from "express";
import { db, usersTable, eq } from "@workspace/db";

const PLAN_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  studio: Infinity,
};

export interface QuotaInfo {
  plan: string;
  used: number;
  limit: number;
  allowed: boolean;
}

async function resetIfNewMonth(userId: number): Promise<void> {
  const [user] = await db
    .select({ monthlyGenerations: usersTable.monthlyGenerations, resetAt: usersTable.monthlyGenerationsResetAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return;

  const now = new Date();
  const resetAt = new Date(user.resetAt);
  if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
    await db
      .update(usersTable)
      .set({ monthlyGenerations: 0, monthlyGenerationsResetAt: now })
      .where(eq(usersTable.id, userId));
  }
}

export async function getQuota(userId: number): Promise<QuotaInfo> {
  await resetIfNewMonth(userId);

  const [user] = await db
    .select({
      plan: usersTable.plan,
      monthlyGenerations: usersTable.monthlyGenerations,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    return { plan: "free", used: 0, limit: PLAN_LIMITS.free!, allowed: true };
  }

  const limit = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free!;
  return {
    plan: user.plan,
    used: user.monthlyGenerations,
    limit,
    allowed: user.monthlyGenerations < limit,
  };
}

export async function incrementUsage(userId: number): Promise<void> {
  // Use raw SQL for atomic increment
  const { pool } = await import("@workspace/db");
  await pool.query(
    "UPDATE users SET monthly_generations = monthly_generations + 1 WHERE id = $1",
    [userId],
  );
}

export function enforceQuota(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    // Unauthenticated users get rate-limited by IP only (handled by rate-limit middleware)
    next();
    return;
  }

  getQuota(req.user.id)
    .then((quota) => {
      if (!quota.allowed) {
        res.status(403).json({
          error: `Monthly generation limit reached (${quota.used}/${quota.limit}). Upgrade your plan for more.`,
          quota,
        });
        return;
      }
      next();
    })
    .catch(() => {
      // Quota check failure is non-fatal — allow the request
      next();
    });
}

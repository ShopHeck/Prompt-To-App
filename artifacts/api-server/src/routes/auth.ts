import { Router, type IRouter } from "express";
import type { Request } from "express";
import { db, usersTable, eq } from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
} from "../middleware/auth";
import { authLimiter } from "../middleware/rate-limit";
import { getQuota } from "../middleware/quota";
import { validateBody } from "../middleware/validate";
import { registerSchema, loginSchema, changePasswordSchema } from "../lib/request-schemas";
import { auditLog } from "../lib/audit-log";

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0]!.split(",")[0]!.trim();
  return req.ip ?? "unknown";
}

const router: IRouter = Router();

router.post("/auth/register", authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { email, password, displayName } = req.body as {
      email: string;
      password: string;
      displayName?: string;
    };

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: hashPassword(password),
        displayName: displayName || null,
      })
      .returning({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName, plan: usersTable.plan });

    if (!user) {
      res.status(500).json({ error: "Failed to create account" });
      return;
    }

    await createSession(user.id, res);

    auditLog({ userId: user.id, action: "register", ipAddress: getClientIp(req), metadata: { email } });

    res.status(201).json({
      user: { id: user.id, email: user.email, displayName: user.displayName, plan: user.plan },
    });
  } catch (err) {
    req.log.error({ err }, "Registration failed");
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (!user || !verifyPassword(password, user.passwordHash)) {
      auditLog({ userId: null, action: "login_failed", ipAddress: getClientIp(req), metadata: { email } });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await createSession(user.id, res);

    auditLog({ userId: user.id, action: "login_success", ipAddress: getClientIp(req), metadata: { email } });

    res.json({
      user: { id: user.id, email: user.email, displayName: user.displayName, plan: user.plan },
    });
  } catch (err) {
    req.log.error({ err }, "Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    const userId = req.user?.id ?? null;
    await destroySession(req, res);
    auditLog({ userId, action: "session_destroy", ipAddress: getClientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Logout failed");
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/auth/me", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const quota = await getQuota(req.user.id);
    res.json({
      user: req.user,
      quota,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get user info");
    res.json({ user: req.user });
  }
});

router.put("/auth/password", requireAuth, validateBody(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const [user] = await db
      .select({ passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    await db
      .update(usersTable)
      .set({ passwordHash: hashPassword(newPassword) })
      .where(eq(usersTable.id, req.user!.id));

    auditLog({ userId: req.user!.id, action: "password_change", ipAddress: getClientIp(req) });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Password change failed");
    res.status(500).json({ error: "Password change failed" });
  }
});

export default router;

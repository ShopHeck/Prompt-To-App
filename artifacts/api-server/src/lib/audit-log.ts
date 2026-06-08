import { db, auditEventsTable, eq, desc, and } from "@workspace/db";

export type AuditAction =
  | "login_success"
  | "login_failed"
  | "register"
  | "password_change"
  | "session_destroy"
  | "billing_subscription_change"
  | "project_delete";

export interface AuditLogEntry {
  userId?: number | null;
  action: AuditAction;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogQueryOptions {
  limit?: number;
  offset?: number;
  action?: AuditAction;
}

/**
 * Record a security-sensitive event to the audit log.
 * Fire-and-forget safe -- errors are swallowed to avoid disrupting the request.
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await db.insert(auditEventsTable).values({
      userId: entry.userId ?? null,
      action: entry.action,
      ipAddress: entry.ipAddress ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch {
    // Non-fatal: audit logging should never break the request
  }
}

/**
 * Retrieve audit log entries for a given user.
 */
export async function getAuditLog(
  userId: number,
  options: AuditLogQueryOptions = {},
): Promise<Array<typeof auditEventsTable.$inferSelect>> {
  const { limit = 50, offset = 0, action } = options;

  const conditions = [eq(auditEventsTable.userId, userId)];
  if (action) {
    conditions.push(eq(auditEventsTable.action, action));
  }

  return db
    .select()
    .from(auditEventsTable)
    .where(and(...conditions))
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(limit)
    .offset(offset);
}

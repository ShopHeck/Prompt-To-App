import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const auditEventsTable = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: text("action").notNull(),
  ipAddress: text("ip_address"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_audit_events_user_id").on(table.userId),
  index("idx_audit_events_action").on(table.action),
  index("idx_audit_events_created_at").on(table.createdAt),
]);

export type AuditEvent = typeof auditEventsTable.$inferSelect;

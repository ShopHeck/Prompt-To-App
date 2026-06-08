import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const projectRevisionsTable = pgTable("project_revisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id"),
  revisionType: text("revision_type").notNull(),
  payload: jsonb("payload").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRevision = typeof projectRevisionsTable.$inferSelect;

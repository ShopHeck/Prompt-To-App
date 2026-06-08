import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const generationRunsTable = pgTable("generation_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id"),
  status: text("status").notNull().default("pending"),
  provider: text("provider"),
  model: text("model"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GenerationRun = typeof generationRunsTable.$inferSelect;

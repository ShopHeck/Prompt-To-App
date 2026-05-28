import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const refinementMessagesTable = pgTable("refinement_messages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  filesChanged: text("files_changed").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RefinementMessage = typeof refinementMessagesTable.$inferSelect;

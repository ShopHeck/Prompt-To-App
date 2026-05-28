import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  framework: text("framework").notNull().default("swiftui"),
  fileCount: integer("file_count").notNull().default(0),
  shareToken: text("share_token").unique(),
  architecturePlan: text("architecture_plan"),
  clarifyingQuestions: text("clarifying_questions"),
  clarifyAnswers: text("clarify_answers"),
  enrichedPrompt: text("enriched_prompt"),
  accuracyReport: text("accuracy_report"),
  repairHistory: text("repair_history"),
  livePreviewHtml: text("live_preview_html"),
  qualityReport: text("quality_report"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

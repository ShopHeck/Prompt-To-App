import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { type z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectFilesTable = pgTable("project_files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(),
  content: text("content").notNull(),
  language: text("language").notNull().default("swift"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectFileSchema = createInsertSchema(projectFilesTable).omit({ id: true, createdAt: true });
export type InsertProjectFile = z.infer<typeof insertProjectFileSchema>;
export type ProjectFile = typeof projectFilesTable.$inferSelect;

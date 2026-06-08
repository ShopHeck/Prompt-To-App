import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"owner" | "admin" | "member" | "viewer">(),
  invitedBy: integer("invited_by").references(() => usersTable.id, { onDelete: "set null" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.teamId, t.userId),
]);

export const teamInvitationsTable = pgTable("team_invitations", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().$type<"admin" | "member" | "viewer">(),
  token: text("token").notNull().unique(),
  invitedBy: integer("invited_by").references(() => usersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Team = typeof teamsTable.$inferSelect;
export type TeamMember = typeof teamMembersTable.$inferSelect;
export type TeamInvitation = typeof teamInvitationsTable.$inferSelect;

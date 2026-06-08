import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitHitsTable = pgTable("rate_limit_hits", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  hitAt: timestamp("hit_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RateLimitHit = typeof rateLimitHitsTable.$inferSelect;

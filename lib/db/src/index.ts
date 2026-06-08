import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";

// Re-export drizzle-orm operators so all consumers use the same instance
// (avoids duplicate type errors when optional peer deps like @opentelemetry/api
// cause pnpm to resolve two separate drizzle-orm copies)
export { eq, and, or, gt, gte, lt, lte, ne, desc, asc, sql, inArray, notInArray, isNull, isNotNull, count, sum } from "drizzle-orm";

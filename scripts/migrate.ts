#!/usr/bin/env tsx
/**
 * Production database migration runner.
 * Reads SQL files from lib/db/migrations/ in sorted order and applies them.
 * Idempotent — uses IF NOT EXISTS / IF EXISTS in migration SQL.
 *
 * Usage: pnpm run migrate
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("Starting database migration...");

    // Create base tables if they don't exist (needed for fresh databases)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        framework TEXT NOT NULL DEFAULT 'swiftui',
        file_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_files (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'swift',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  Base tables ensured");

    // Run migration files
    const migrationsDir = path.resolve(import.meta.dirname, "../lib/db/migrations");
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      await pool.query(sql);
      console.log(`  Applied: ${file}`);
    }

    console.log(`Migration complete — ${files.length} migration(s) applied`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

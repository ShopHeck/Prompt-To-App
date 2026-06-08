import { beforeAll, afterAll, afterEach } from "vitest";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const { Pool } = pg;

const TEST_DB_URL = "postgresql://postgres:postgres@localhost:5432/promptios_test";

// Set env before any imports that read process.env
process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = "test";

let pool: pg.Pool;

const BASE_TABLES = `
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
`;

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });

  await pool.query(BASE_TABLES);

  const migrationsDir = path.resolve(__dirname, "../../../../lib/db/migrations");
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    await pool.query(sql);
  }
});

afterEach(async () => {
  await pool.query("DELETE FROM rate_limit_hits");
  await pool.query("DELETE FROM generation_runs");
  await pool.query("DELETE FROM project_revisions");
  await pool.query("DELETE FROM refinement_messages");
  await pool.query("DELETE FROM project_files");
  await pool.query("DELETE FROM projects");
  await pool.query("DELETE FROM sessions");
  await pool.query("DELETE FROM users");
  // Reset sequences so IDs start fresh
  await pool.query("ALTER SEQUENCE projects_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE project_files_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE users_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE refinement_messages_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE generation_runs_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE project_revisions_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE rate_limit_hits_id_seq RESTART WITH 1");
});

afterAll(async () => {
  await pool.end();
});

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import pg from "pg";
import { FIXTURES_PATH } from "./fixtures-path";
import {
  SEEDED_AWAITING_AWAITING_TOKEN,
  SEEDED_AWAITING_PROJECT_NAME,
  SEEDED_COMPLETE_PROJECT_NAME,
  SEEDED_SHARE_TOKEN,
  seededAccuracyReport,
  seededArchitecturePlan,
  seededClarifyAnswers,
  seededClarifyingQuestions,
  seededFiles,
  seededRepairHistory,
} from "./seed-data";

const { Pool } = pg;

interface SeededFields {
  name: string;
  prompt: string;
  framework: string;
  status: string;
  clarifyingQuestions: unknown | null;
  clarifyAnswers: unknown | null;
  enrichedPrompt: string | null;
  architecturePlan: unknown | null;
  accuracyReport: unknown | null;
  repairHistory: unknown | null;
  shareToken: string;
  description: string | null;
}

async function reseedProject(pool: pg.Pool, fields: SeededFields): Promise<number> {
  // Delete by both name and share_token to guarantee a single seeded row even
  // if a previous run left duplicates or partial state behind.
  await pool.query(
    "DELETE FROM projects WHERE name = $1 OR share_token = $2",
    [fields.name, fields.shareToken],
  );

  const cq = fields.clarifyingQuestions ? JSON.stringify(fields.clarifyingQuestions) : null;
  const ca = fields.clarifyAnswers ? JSON.stringify(fields.clarifyAnswers) : null;
  const ap = fields.architecturePlan ? JSON.stringify(fields.architecturePlan) : null;
  const ar = fields.accuracyReport ? JSON.stringify(fields.accuracyReport) : null;
  const rh = fields.repairHistory ? JSON.stringify(fields.repairHistory) : null;

  const insert = await pool.query<{ id: number }>(
    `INSERT INTO projects
       (name, prompt, framework, status,
        clarifying_questions, clarify_answers, enriched_prompt,
        architecture_plan, accuracy_report, repair_history,
        share_token, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      fields.name,
      fields.prompt,
      fields.framework,
      fields.status,
      cq,
      ca,
      fields.enrichedPrompt,
      ap,
      ar,
      rh,
      fields.shareToken,
      fields.description,
    ],
  );
  return insert.rows[0].id;
}

async function syncSeededFiles(pool: pg.Pool, projectId: number) {
  await pool.query("DELETE FROM project_files WHERE project_id = $1", [projectId]);
  for (const f of seededFiles) {
    await pool.query(
      `INSERT INTO project_files (project_id, filename, filepath, content, language)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, f.filename, f.filepath, f.content, f.language],
    );
  }
  await pool.query(
    "UPDATE projects SET file_count = $2 WHERE id = $1",
    [projectId, seededFiles.length],
  );
}

export interface SeededFixtures {
  completeProjectId: number;
  awaitingProjectId: number;
  shareToken: string;
}

export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for Playwright global setup");
  }
  const pool = new Pool({ connectionString: url });

  try {
    const completeProjectId = await reseedProject(pool, {
      name: SEEDED_COMPLETE_PROJECT_NAME,
      prompt: "make me a simple notes app",
      framework: "swiftui",
      status: "complete",
      clarifyingQuestions: seededClarifyingQuestions,
      clarifyAnswers: seededClarifyAnswers,
      enrichedPrompt:
        "make me a simple notes app\n\nClarifications:\n- Students and casual writers\n- Create, search, tag notes\n- Local only",
      architecturePlan: seededArchitecturePlan,
      accuracyReport: seededAccuracyReport,
      repairHistory: seededRepairHistory,
      shareToken: SEEDED_SHARE_TOKEN,
      description: "Seeded e2e complete project",
    });
    await syncSeededFiles(pool, completeProjectId);

    const awaitingProjectId = await reseedProject(pool, {
      name: SEEDED_AWAITING_PROJECT_NAME,
      prompt: "make me a simple notes app",
      framework: "swiftui",
      status: "awaiting_clarification",
      clarifyingQuestions: seededClarifyingQuestions,
      clarifyAnswers: null,
      enrichedPrompt: null,
      architecturePlan: null,
      accuracyReport: null,
      repairHistory: null,
      shareToken: SEEDED_AWAITING_AWAITING_TOKEN,
      description: null,
    });

    const fixtures: SeededFixtures = {
      completeProjectId,
      awaitingProjectId,
      shareToken: SEEDED_SHARE_TOKEN,
    };
    mkdirSync(dirname(FIXTURES_PATH), { recursive: true });
    writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  } finally {
    await pool.end();
  }
}

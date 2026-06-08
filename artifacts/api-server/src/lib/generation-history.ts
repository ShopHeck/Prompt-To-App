import { db, generationRunsTable, projectRevisionsTable, eq, desc } from "@workspace/db";

export async function recordGenerationRun(params: {
  projectId: number;
  userId?: number | null;
  status: string;
  provider?: string | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}) {
  const [row] = await db
    .insert(generationRunsTable)
    .values({
      projectId: params.projectId,
      userId: params.userId ?? null,
      status: params.status,
      provider: params.provider ?? null,
      model: params.model ?? null,
      promptTokens: params.promptTokens ?? null,
      completionTokens: params.completionTokens ?? null,
      durationMs: params.durationMs ?? null,
      errorMessage: params.errorMessage ?? null,
    })
    .returning();
  return row;
}

export async function recordProjectRevision(params: {
  projectId: number;
  userId?: number | null;
  revisionType: string;
  payload: unknown;
  message?: string | null;
}) {
  const [row] = await db
    .insert(projectRevisionsTable)
    .values({
      projectId: params.projectId,
      userId: params.userId ?? null,
      revisionType: params.revisionType,
      payload: params.payload,
      message: params.message ?? null,
    })
    .returning();
  return row;
}

export async function getProjectHistory(projectId: number) {
  return db
    .select()
    .from(projectRevisionsTable)
    .where(eq(projectRevisionsTable.projectId, projectId))
    .orderBy(desc(projectRevisionsTable.createdAt));
}

export async function getProjectRuns(projectId: number) {
  return db
    .select()
    .from(generationRunsTable)
    .where(eq(generationRunsTable.projectId, projectId))
    .orderBy(desc(generationRunsTable.createdAt));
}

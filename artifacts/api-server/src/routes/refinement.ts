import { Router, type IRouter } from "express";
import { db, projectsTable, projectFilesTable, refinementMessagesTable, eq, asc } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { generationLimiter } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";
import { refineSchema } from "../lib/request-schemas";
import { callWithFallback, resolveProvider, DEFAULT_MODELS, FALLBACK_MODELS, type Provider } from "../lib/ai-client";

const router: IRouter = Router();

const REFINER_SYSTEM = `You are a Senior SwiftUI Engineer making targeted modifications to an existing iOS app project.

You will receive:
1. The user's refinement instruction
2. The original app prompt and name
3. A manifest of current files with their content

Rules:
1. Only modify files that need changes to fulfill the instruction.
2. Return complete file content for each modified file — no partial patches.
3. If a new file is needed, include it with its full path and content.
4. Preserve existing code style, naming conventions, and architecture.
5. Do NOT remove existing functionality unless explicitly asked.
6. Keep all imports intact and add new ones as needed.

Return a JSON object with this structure:
{
  "files": [{ "path": "Sources/MyApp/Views/SomeView.swift", "content": "..." }],
  "summary": "Brief description of what changed"
}

Return ONLY the JSON object.`;

const WEB_REFINER_SYSTEM = `You are a Senior React + Tailwind CSS Engineer making targeted modifications to an existing web app project.

You will receive:
1. The user's refinement instruction
2. The original app prompt and name
3. A manifest of current files with their content

Rules:
1. Only modify files that need changes to fulfill the instruction.
2. Return complete file content for each modified file — no partial patches.
3. If a new file is needed, include it with its full path and content.
4. Preserve existing code style, naming conventions, and architecture.
5. Do NOT remove existing functionality unless explicitly asked.
6. Maintain TypeScript strict mode — no \`any\`.
7. Use Tailwind CSS for styling, not inline styles.

Return a JSON object with this structure:
{
  "files": [{ "path": "src/pages/Home.tsx", "content": "..." }],
  "summary": "Brief description of what changed"
}

Return ONLY the JSON object.`;

router.get("/projects/:id/refinements", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const messages = await db
      .select()
      .from(refinementMessagesTable)
      .where(eq(refinementMessagesTable.projectId, projectId))
      .orderBy(asc(refinementMessagesTable.createdAt));

    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Failed to get refinement messages");
    res.status(500).json({ error: "Failed to get refinement messages" });
  }
});

router.post("/projects/:id/refine", requireAuth, generationLimiter, validateBody(refineSchema), async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const { instruction } = req.body as { instruction: string };

    const userPlan = req.user!.plan;
    if (userPlan === "free") {
      res.status(403).json({ error: "Refinement chat requires a Pro or Studio plan. Upgrade at /pricing." });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));

    if (files.length === 0) {
      res.status(400).json({ error: "Project has no files to refine" });
      return;
    }

    const provider = resolveProvider((req.query as Record<string, string>).provider);

    const isWeb = files.some(f =>
      f.filepath.endsWith(".tsx") || f.filepath.endsWith(".jsx") || f.filepath.includes("package.json"),
    );

    const fileManifest = files
      .slice(0, 15)
      .map(f => `### ${f.filepath}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
      .join("\n\n");

    const userMessage = `App: "${project.name}"
Original prompt: "${project.prompt}"

Current files:
${fileManifest}

User instruction: "${instruction}"

Return ONLY the JSON with modified/new files and a summary.`;

    // Save user message
    await db.insert(refinementMessagesTable).values({
      projectId,
      role: "user",
      content: instruction,
    });

    const result = await callWithFallback(
      {
        provider,
        model: DEFAULT_MODELS[provider].engineer,
        system: isWeb ? WEB_REFINER_SYSTEM : REFINER_SYSTEM,
        userMessage,
        maxTokens: 32000,
        timeoutMs: 120_000,
        responseFormat: "json",
      },
      FALLBACK_MODELS[provider].engineer,
    );

    const raw = result.content;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      await db.insert(refinementMessagesTable).values({
        projectId,
        role: "assistant",
        content: "I processed your request but couldn't generate file changes. Try being more specific.",
      });
      res.json({ summary: "No changes produced", filesChanged: [] });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      files?: Array<{ path: string; content: string }>;
      summary?: string;
    };

    const patchedFiles = parsed.files ?? [];
    const summary = parsed.summary ?? `Updated ${patchedFiles.length} file(s)`;

    if (patchedFiles.length > 0) {
      for (const patch of patchedFiles) {
        const existing = files.find(f => f.filepath === patch.path);
        if (existing) {
          await db
            .update(projectFilesTable)
            .set({ content: patch.content })
            .where(eq(projectFilesTable.id, existing.id));
        } else {
          await db.insert(projectFilesTable).values({
            projectId,
            filename: patch.path.split("/").pop() ?? patch.path,
            filepath: patch.path,
            content: patch.content,
          });
        }
      }

      // Update project file count
      const updatedFiles = await db
        .select()
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, projectId));

      await db
        .update(projectsTable)
        .set({ fileCount: updatedFiles.length })
        .where(eq(projectsTable.id, projectId));
    }

    const changedPaths = patchedFiles.map(f => f.path);

    await db.insert(refinementMessagesTable).values({
      projectId,
      role: "assistant",
      content: summary,
      filesChanged: changedPaths.length > 0 ? changedPaths : null,
    });

    res.json({
      summary,
      filesChanged: changedPaths,
      files: patchedFiles,
    });
  } catch (err) {
    req.log.error({ err }, "Refinement failed");
    res.status(500).json({ error: "Refinement failed" });
  }
});

export default router;

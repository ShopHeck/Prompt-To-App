import { Router, type IRouter, type Request, type Response } from "express";
import { db, projectsTable, projectFilesTable, eq, desc, count, sum } from "@workspace/db";
import JSZip from "jszip";
import { z } from "zod";
import {
  CreateProjectBody as CreateProjectBodyBase,
  GetProjectParams,
  DeleteProjectParams,
  GetProjectFilesParams,
  GenerateAppParams,
  GenerateAppBody,
  ApprovePlanParams,
  ApprovePlanBody,
  AnswerClarificationsParams,
  AnswerClarificationsBody,
} from "@workspace/api-zod";

const PROMPT_MAX_LENGTH = 10000;

const CreateProjectBody = CreateProjectBodyBase.extend({
  prompt: z.string().max(PROMPT_MAX_LENGTH, `Prompt must be ${PROMPT_MAX_LENGTH} characters or fewer`),
  name: z.string().max(200, "Name must be 200 characters or fewer"),
  stylePreset: z.string().max(50).optional(),
});
import {
  resolveProvider,
  getAvailableProviders,
  DEFAULT_MODELS,
} from "../lib/ai-client";
import { EXAMPLE_PROMPTS } from "../lib/prompt-templates";
import { generationLimiter } from "../middleware/rate-limit";
import { enforceQuota } from "../middleware/quota";
import { recordGenerationRun, getProjectHistory, getProjectRuns } from "../lib/generation-history";
import { logger } from "../lib/logger";
import { generationService } from "../lib/generation-service";

const router: IRouter = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Checks project ownership. Returns false and sends 404 if denied. */
function checkOwnership(
  project: { userId: number | null },
  req: Request,
  res: Response,
  jsonError = true,
): boolean {
  if (project.userId !== null && (!req.user || req.user.id !== project.userId)) {
    if (jsonError) res.status(404).json({ error: "Project not found" });
    return false;
  }
  if (project.userId === null && req.user) {
    if (jsonError) res.status(404).json({ error: "Project not found" });
    return false;
  }
  return true;
}

/** Sets up SSE headers + heartbeat. Returns sendEvent helper and cleanup. */
function setupSSE(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const heartbeatInterval = setInterval(() => { res.write(`: heartbeat\n\n`); }, 15000);
  res.on("close", () => { clearInterval(heartbeatInterval); });

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  return sendEvent;
}

// ── AI providers route ──────────────────────────────────────────────────────
router.get("/providers", (_req, res) => {
  const available = getAvailableProviders();
  const models: Record<string, { planner: string; engineer: string; reviewer: string }> = {};
  for (const p of available) {
    models[p] = DEFAULT_MODELS[p];
  }
  res.json({ providers: available, default: available[0] ?? null, models });
});

// ── Prompt templates route ───────────────────────────────────────────────────
router.get("/templates", (_req, res) => {
  res.json(EXAMPLE_PROMPTS);
});

// ── CRUD routes ─────────────────────────────────────────────────────────────
router.get("/projects", async (req, res) => {
  try {
    if (!req.user) {
      res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      return;
    }
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const [totalRow] = await db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.userId, req.user.id));
    const total = totalRow.count;
    const totalPages = Math.ceil(total / limit);
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, req.user.id)).orderBy(desc(projectsTable.updatedAt)).limit(limit).offset(offset);
    res.json({ data: projects, pagination: { page, limit, total, totalPages } });
  } catch (err) {
    req.log.error({ err }, "Failed to list projects");
    res.status(500).json({ error: "Failed to list projects" });
  }
});

router.post("/projects", async (req, res) => {
  try {
    const body = CreateProjectBody.parse(req.body);
    const [project] = await db.insert(projectsTable).values({
      name: body.name, prompt: body.prompt, framework: body.framework,
      stylePreset: body.stylePreset ?? null, status: "pending", fileCount: 0, userId: req.user?.id ?? null,
    }).returning();
    res.status(201).json(project);
  } catch (err) {
    req.log.error({ err }, "Failed to create project");
    res.status(400).json({ error: "Failed to create project" });
  }
});

router.get("/projects/recent", async (req, res) => {
  try {
    if (!req.user) { res.json([]); return; }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 5));
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, req.user.id)).orderBy(desc(projectsTable.updatedAt)).limit(limit);
    res.json(projects);
  } catch (err) {
    req.log.error({ err }, "Failed to get recent projects");
    res.status(500).json({ error: "Failed to get recent projects" });
  }
});

router.get("/projects/stats", async (req, res) => {
  try {
    const [totalRow] = await db.select({ count: count() }).from(projectsTable);
    const [completedRow] = await db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.status, "complete"));
    const [filesRow] = await db.select({ total: sum(projectsTable.fileCount) }).from(projectsTable);
    const [swiftuiRow] = await db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.framework, "swiftui"));
    const [uikitRow] = await db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.framework, "uikit"));
    res.json({
      totalProjects: totalRow.count,
      totalFilesGenerated: Number(filesRow.total ?? 0),
      completedProjects: completedRow.count,
      frameworkBreakdown: { swiftui: swiftuiRow.count, uikit: uikitRow.count },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.get("/projects/:id", async (req, res) => {
  try {
    const { id } = GetProjectParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (!checkOwnership(project, req, res)) return;
    res.json(project);
  } catch (err) {
    req.log.error({ err }, "Failed to get project");
    res.status(500).json({ error: "Failed to get project" });
  }
});

router.delete("/projects/:id", async (req, res) => {
  try {
    const { id } = DeleteProjectParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (!checkOwnership(project, req, res)) return;
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete project");
    res.status(500).json({ error: "Failed to delete project" });
  }
});

router.get("/projects/:id/files", async (req, res) => {
  try {
    const { id } = GetProjectFilesParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (!checkOwnership(project, req, res)) return;
    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, id))
      .orderBy(projectFilesTable.filepath);
    res.json(files);
  } catch (err) {
    req.log.error({ err }, "Failed to get project files");
    res.status(500).json({ error: "Failed to get project files" });
  }
});

// ── Share routes ────────────────────────────────────────────────────────────
router.post("/projects/:id/share", async (req, res) => {
  try {
    const { id } = GetProjectParams.parse(req.params);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (!checkOwnership(project, req, res)) return;

    let token = project.shareToken;
    if (!token) {
      token = crypto.randomUUID();
      await db.update(projectsTable).set({ shareToken: token }).where(eq(projectsTable.id, id));
    }
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
    const protocol = req.headers["x-forwarded-proto"] ?? "https";
    res.json({ token, url: `${protocol}://${host}/share/${token}` });
  } catch (err) {
    req.log.error({ err }, "Failed to create share token");
    res.status(500).json({ error: "Failed to create share token" });
  }
});

router.get("/share/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.shareToken, token));
    if (!project) { res.status(404).json({ error: "Shared project not found" }); return; }
    const files = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, project.id)).orderBy(projectFilesTable.filepath);
    res.json({ project, files });
  } catch (err) {
    req.log.error({ err }, "Failed to get shared project");
    res.status(500).json({ error: "Failed to get shared project" });
  }
});

// ── Preview routes ──────────────────────────────────────────────────────────
function sendPreviewHtml(res: Response, html: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob: https:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
}

router.get("/projects/:id/preview", async (req, res) => {
  const noPreviewHtml = "<!doctype html><meta charset=utf-8><title>No preview</title><body style=\"font-family:-apple-system,sans-serif;background:#000;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:1rem;font-size:13px;\">Preview not yet available.</body>";
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project || !checkOwnership(project, req, res, false) || !project.livePreviewHtml) {
      res.status(404).type("text/html").send(noPreviewHtml);
      return;
    }
    sendPreviewHtml(res, project.livePreviewHtml);
  } catch (err) {
    req.log.error({ err }, "Failed to load project preview");
    res.status(500).json({ error: "Failed to load preview" });
  }
});

router.get("/share/:token/preview", async (req, res) => {
  try {
    const token = req.params.token;
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.shareToken, token)).limit(1);
    if (!project || !project.livePreviewHtml) {
      res.status(404).type("text/html").send("<!doctype html><meta charset=utf-8><title>No preview</title><body style=\"font-family:-apple-system,sans-serif;background:#000;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:1rem;font-size:13px;\">Preview not available.</body>");
      return;
    }
    sendPreviewHtml(res, project.livePreviewHtml);
  } catch (err) {
    req.log.error({ err }, "Failed to load shared preview");
    res.status(500).json({ error: "Failed to load preview" });
  }
});

// ── Download route ──────────────────────────────────────────────────────────
router.get("/projects/:id/download", async (req, res) => {
  try {
    const { id } = GetProjectParams.parse(req.params);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (!checkOwnership(project, req, res)) return;

    const files = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, id)).orderBy(projectFilesTable.filepath);
    if (files.length === 0) { res.status(404).json({ error: "No files to download" }); return; }

    const zip = new JSZip();
    const folderName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const folder = zip.folder(folderName)!;
    for (const file of files) { folder.file(file.filepath, file.content); }

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folderName}.zip"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "Failed to create download zip");
    res.status(500).json({ error: "Failed to create zip" });
  }
});

// ── Generation routes (SSE streaming) ────────────────────────────────────────
router.post("/projects/:id/generate", generationLimiter, enforceQuota, async (req, res) => {
  const { id } = GenerateAppParams.parse(req.params);
  const body = GenerateAppBody.safeParse(req.body);
  const additionalContext = body.success ? body.data.additionalContext ?? null : null;
  const provider = resolveProvider((req.query as Record<string, string>).provider);

  const sendEvent = setupSSE(res);

  try {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) { sendEvent({ error: "Project not found" }); res.end(); return; }
    if (project.userId !== null && (!req.user || req.user.id !== project.userId)) {
      sendEvent({ error: "Project not found" }); res.end(); return;
    }
    if (project.userId === null && req.user) {
      sendEvent({ error: "Project not found" }); res.end(); return;
    }

    if (project.status === "generating") {
      const staleCutoff = new Date(Date.now() - 5 * 60 * 1000);
      const updatedAt = project.updatedAt ? new Date(project.updatedAt) : new Date(0);
      if (updatedAt < staleCutoff) {
        req.log.warn({ projectId: id, updatedAt }, "Resetting stale generating status");
      } else {
        sendEvent({ type: "error", message: "Build already in progress." });
        res.end();
        return;
      }
    }

    const frameworkName = project.framework === "swiftui" ? "SwiftUI" : "UIKit";

    await db
      .update(projectsTable)
      .set({ status: "generating" })
      .where(eq(projectsTable.id, id));
    sendEvent({ type: "status", status: "generating" });

    sendEvent({ type: "clarify_check", message: "Checking prompt for ambiguity..." });
    const clarify = await generationService.detectClarifications(project.prompt, frameworkName, provider);

    if (clarify.needsClarification) {
      await db
        .update(projectsTable)
        .set({
          status: "awaiting_clarification",
          clarifyingQuestions: JSON.stringify(clarify.questions),
        })
        .where(eq(projectsTable.id, id));
      sendEvent({ type: "clarify_questions", questions: clarify.questions });
      sendEvent({ type: "awaiting_clarification", questions: clarify.questions });
      res.end();
      return;
    }

    await db
      .update(projectsTable)
      .set({
        clarifyingQuestions: JSON.stringify([]),
        clarifyAnswers: JSON.stringify([]),
        enrichedPrompt: project.prompt,
      })
      .where(eq(projectsTable.id, id));

    await generationService.runPlanningPhase(res, sendEvent, req.log, {
      projectId: id,
      promptForPlanning: project.prompt,
      projectName: project.name,
      frameworkName,
      additionalContext,
      provider,
      stylePresetId: project.stylePreset ?? null,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Generation failed");
    try {
      await db
        .update(projectsTable)
        .set({ status: "error" })
        .where(eq(projectsTable.id, id));
    } catch (_) {}
    recordGenerationRun({
      projectId: id,
      userId: req.user?.id,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Generation failed",
    }).catch((err) => { logger.error({ err }, "Failed to record generation history"); });
    sendEvent({ type: "error", message: "Generation failed" });
    res.end();
  }
});

router.post("/projects/:id/answer-clarifications", async (req, res) => {
  const { id } = AnswerClarificationsParams.parse(req.params);
  const body = AnswerClarificationsBody.safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }

  const { answers, additionalContext, skip } = body.data;
  const sendEvent = setupSSE(res);

  try {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) { sendEvent({ type: "error", message: "Project not found" }); res.end(); return; }
    if (project.userId !== null && (!req.user || req.user.id !== project.userId)) {
      sendEvent({ type: "error", message: "Project not found" }); res.end(); return;
    }
    if (project.userId === null && req.user) {
      sendEvent({ type: "error", message: "Project not found" }); res.end(); return;
    }

    const frameworkName = project.framework === "swiftui" ? "SwiftUI" : "UIKit";
    const cleanedAnswers = (answers ?? []).map(a => ({
      id: a.id,
      question: a.question,
      answer: skip ? "" : a.answer,
    }));
    const enriched = generationService.buildEnrichedPrompt(project.prompt, cleanedAnswers);

    await db
      .update(projectsTable)
      .set({
        clarifyAnswers: JSON.stringify(cleanedAnswers),
        enrichedPrompt: enriched,
        status: "generating",
      })
      .where(eq(projectsTable.id, id));

    sendEvent({ type: "clarify_resumed", enrichedPrompt: enriched, answers: cleanedAnswers });

    await generationService.runPlanningPhase(res, sendEvent, req.log, {
      projectId: id,
      promptForPlanning: enriched,
      projectName: project.name,
      frameworkName,
      additionalContext: additionalContext ?? null,
      provider: resolveProvider((req.query as Record<string, string>).provider),
      stylePresetId: project.stylePreset ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Answer-clarifications phase failed");
    try {
      await db
        .update(projectsTable)
        .set({ status: "error" })
        .where(eq(projectsTable.id, id));
    } catch (_) {}
    sendEvent({ type: "error", message: "Failed to resume after clarifications" });
    res.end();
  }
});

// ── Approve plan + code generation (SSE streaming) ──────────────────────────
router.post("/projects/:id/approve-plan", generationLimiter, enforceQuota, async (req, res) => {
  const { id } = ApprovePlanParams.parse(req.params);
  const body = ApprovePlanBody.safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }

  const { plan: approvedPlan, additionalContext } = body.data;
  const provider = resolveProvider((req.query as Record<string, string>).provider);
  const sendEvent = setupSSE(res);

  try {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) { sendEvent({ type: "error", message: "Project not found" }); res.end(); return; }
    if (project.userId !== null && (!req.user || req.user.id !== project.userId)) {
      sendEvent({ type: "error", message: "Project not found" }); res.end(); return;
    }
    if (project.userId === null && req.user) {
      sendEvent({ type: "error", message: "Project not found" }); res.end(); return;
    }

    if (project.status === "generating") {
      const staleCutoff = new Date(Date.now() - 5 * 60 * 1000);
      const updatedAt = project.updatedAt ? new Date(project.updatedAt) : new Date(0);
      if (updatedAt < staleCutoff) {
        req.log.warn({ projectId: id, updatedAt }, "approve-plan: resetting stale generating status");
      } else {
        sendEvent({ type: "error", message: "Build already in progress." });
        res.end();
        return;
      }
    }

    await db
      .update(projectsTable)
      .set({ status: "generating", architecturePlan: JSON.stringify(approvedPlan) })
      .where(eq(projectsTable.id, id));

    await generationService.runCodeGeneration(res, sendEvent, req.log, {
      projectId: id,
      approvedPlan,
      additionalContext: additionalContext ?? null,
      provider,
      userId: req.user?.id,
    });
  } catch (err) {
    req.log.error({ err }, "Approve-plan phase 2 generation failed");
    try {
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
    } catch (_) {}
    recordGenerationRun({
      projectId: id,
      userId: req.user?.id,
      status: "failed",
      provider,
      errorMessage: err instanceof Error ? err.message : "Code generation failed",
    }).catch((err) => { logger.error({ err }, "Failed to record generation history"); });
    sendEvent({ type: "error", message: "Code generation failed" });
    res.end();
  }
});

// ── History & Runs endpoints ────────────────────────────────────────────────
router.get("/projects/:id/history", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (!checkOwnership(project, req, res)) return;

    const revisions = await getProjectHistory(id);
    res.json(revisions);
  } catch (err) {
    req.log.error({ err }, "Failed to get project history");
    res.status(500).json({ error: "Failed to get project history" });
  }
});

router.get("/projects/:id/runs", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (!checkOwnership(project, req, res)) return;

    const runs = await getProjectRuns(id);
    res.json(runs);
  } catch (err) {
    req.log.error({ err }, "Failed to get project runs");
    res.status(500).json({ error: "Failed to get project runs" });
  }
});

export default router;

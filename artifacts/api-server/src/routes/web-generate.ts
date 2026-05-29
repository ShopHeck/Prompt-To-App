import { Router, type IRouter } from "express";
import { db, projectsTable, projectFilesTable, eq } from "@workspace/db";
import { generationLimiter } from "../middleware/rate-limit";
import { enforceQuota, incrementUsage } from "../middleware/quota";
import { resolveProvider, type Provider } from "../lib/ai-client";
import { runWebPlanning, runWebGeneration, type WebPlan } from "../lib/web-generation";
import { evaluateQuality, type QualityReport } from "../lib/quality-scorer";
import type { ArchitecturePlan } from "../lib/types";

const router: IRouter = Router();

router.post("/projects/:id/generate-web", generationLimiter, enforceQuota, async (req, res) => {
  const id = Number(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) {
      sendEvent({ type: "error", message: "Project not found" });
      res.end();
      return;
    }

    if (project.framework !== "react") {
      sendEvent({ type: "error", message: "Project framework must be 'react' for web generation" });
      res.end();
      return;
    }

    let provider: Provider;
    try {
      provider = resolveProvider((req.query as Record<string, string>).provider);
    } catch {
      sendEvent({ type: "error", message: "No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY." });
      res.end();
      return;
    }

    await db
      .update(projectsTable)
      .set({ status: "generating" })
      .where(eq(projectsTable.id, id));

    // Phase 1: Planning
    sendEvent({ type: "progress", phase: "analyzing", message: "Architect designing web app...", percent: 5 });

    let plan: WebPlan;
    try {
      plan = await runWebPlanning(req.log, project.prompt, provider);
    } catch (planErr) {
      req.log.error({ planErr }, "Web planning failed");
      sendEvent({ type: "error", message: "Planning phase failed" });
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
      res.end();
      return;
    }

    sendEvent({
      type: "plan_ready",
      plan: {
        appName: plan.appName,
        tagline: plan.tagline,
        pages: plan.pages?.length ?? 0,
        componentPatterns: plan.componentPatterns,
      },
    });

    await db
      .update(projectsTable)
      .set({ architecturePlan: JSON.stringify(plan) })
      .where(eq(projectsTable.id, id));

    // Phase 2: Code generation
    sendEvent({ type: "progress", phase: "generating", message: "Engineer building web app...", percent: 30 });

    const webProject = await runWebGeneration(req.log, project.prompt, plan, provider);

    // Clear old files and insert new ones
    await db
      .delete(projectFilesTable)
      .where(eq(projectFilesTable.projectId, id));

    for (const file of webProject.files) {
      await db.insert(projectFilesTable).values({
        projectId: id,
        filename: file.path.split("/").pop() ?? file.path,
        filepath: file.path,
        content: file.content,
      });

      sendEvent({ type: "file", path: file.path, phase: "engineer" });
    }

    sendEvent({
      type: "progress",
      phase: "bundling",
      message: `Project built: ${webProject.files.length} files`,
      percent: 85,
    });

    // Phase 3: Quality scoring
    sendEvent({ type: "quality_scoring", message: "Evaluating quality..." });
    let qualityReport: QualityReport | null = null;
    try {
      qualityReport = await evaluateQuality(
        req.log,
        plan as unknown as ArchitecturePlan,
        webProject.files.map(f => ({ filename: f.path.split("/").pop() ?? f.path, filepath: f.path, content: f.content })),
        null,
        provider,
      );
      if (qualityReport) {
        sendEvent({ type: "quality_report", report: qualityReport });
      }
    } catch {
      // Quality scoring failure is non-fatal
    }

    // Increment usage for authenticated users
    if (req.user) {
      try {
        await incrementUsage(req.user.id);
      } catch { /* non-fatal */ }
    }

    await db
      .update(projectsTable)
      .set({
        status: "complete",
        description: webProject.summary,
        fileCount: webProject.files.length,
        qualityReport: qualityReport ? JSON.stringify(qualityReport) : null,
      })
      .where(eq(projectsTable.id, id));

    sendEvent({
      type: "complete",
      done: true,
      fileCount: webProject.files.length,
      description: webProject.summary,
      qualityReport,
    });

    res.end();
  } catch (err) {
    req.log.error({ err }, "Web generation failed");
    try {
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
    } catch { /* non-fatal */ }
    sendEvent({ type: "error", message: "Web generation failed" });
    res.end();
  }
});

export default router;

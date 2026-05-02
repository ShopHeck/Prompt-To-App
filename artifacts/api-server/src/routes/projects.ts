import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, projectFilesTable } from "@workspace/db";
import { eq, desc, count, sum, and } from "drizzle-orm";
import {
  CreateProjectBody,
  GetProjectParams,
  DeleteProjectParams,
  GetProjectFilesParams,
  GenerateAppParams,
  GenerateAppBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// GET /projects
router.get("/projects", async (req, res) => {
  try {
    const projects = await db
      .select()
      .from(projectsTable)
      .orderBy(desc(projectsTable.updatedAt));
    res.json(projects);
  } catch (err) {
    req.log.error({ err }, "Failed to list projects");
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// POST /projects
router.post("/projects", async (req, res) => {
  try {
    const body = CreateProjectBody.parse(req.body);
    const [project] = await db
      .insert(projectsTable)
      .values({
        name: body.name,
        prompt: body.prompt,
        framework: body.framework,
        status: "pending",
        fileCount: 0,
      })
      .returning();
    res.status(201).json(project);
  } catch (err) {
    req.log.error({ err }, "Failed to create project");
    res.status(400).json({ error: "Failed to create project" });
  }
});

// GET /projects/recent
router.get("/projects/recent", async (req, res) => {
  try {
    const projects = await db
      .select()
      .from(projectsTable)
      .orderBy(desc(projectsTable.updatedAt))
      .limit(5);
    res.json(projects);
  } catch (err) {
    req.log.error({ err }, "Failed to get recent projects");
    res.status(500).json({ error: "Failed to get recent projects" });
  }
});

// GET /projects/stats
router.get("/projects/stats", async (req, res) => {
  try {
    const [totalRow] = await db
      .select({ count: count() })
      .from(projectsTable);

    const [completedRow] = await db
      .select({ count: count() })
      .from(projectsTable)
      .where(eq(projectsTable.status, "complete"));

    const [filesRow] = await db
      .select({ total: sum(projectsTable.fileCount) })
      .from(projectsTable);

    const [swiftuiRow] = await db
      .select({ count: count() })
      .from(projectsTable)
      .where(eq(projectsTable.framework, "swiftui"));

    const [uikitRow] = await db
      .select({ count: count() })
      .from(projectsTable)
      .where(eq(projectsTable.framework, "uikit"));

    res.json({
      totalProjects: totalRow.count,
      totalFilesGenerated: Number(filesRow.total ?? 0),
      completedProjects: completedRow.count,
      frameworkBreakdown: {
        swiftui: swiftuiRow.count,
        uikit: uikitRow.count,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// GET /projects/:id
router.get("/projects/:id", async (req, res) => {
  try {
    const { id } = GetProjectParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (err) {
    req.log.error({ err }, "Failed to get project");
    res.status(500).json({ error: "Failed to get project" });
  }
});

// DELETE /projects/:id
router.delete("/projects/:id", async (req, res) => {
  try {
    const { id } = DeleteProjectParams.parse(req.params);
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete project");
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// GET /projects/:id/files
router.get("/projects/:id/files", async (req, res) => {
  try {
    const { id } = GetProjectFilesParams.parse(req.params);
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

// POST /projects/:id/generate  (SSE streaming)
router.post("/projects/:id/generate", async (req, res) => {
  const { id } = GenerateAppParams.parse(req.params);
  const body = GenerateAppBody.safeParse(req.body);
  const additionalContext = body.success ? body.data.additionalContext : null;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Fetch the project
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) {
      sendEvent({ error: "Project not found" });
      res.end();
      return;
    }

    // Mark as generating
    await db
      .update(projectsTable)
      .set({ status: "generating" })
      .where(eq(projectsTable.id, id));

    sendEvent({ type: "status", status: "generating" });

    const frameworkName = project.framework === "swiftui" ? "SwiftUI" : "UIKit";
    const contextBlock = additionalContext
      ? `\nAdditional context from the user: ${additionalContext}`
      : "";

    const systemPrompt = `You are an expert iOS developer. Generate a complete, production-quality iOS app using ${frameworkName}.

Output ONLY a JSON object with this exact structure:
{
  "files": [
    {
      "filename": "ContentView.swift",
      "filepath": "Sources/AppName/ContentView.swift",
      "content": "import SwiftUI\\n...",
      "language": "swift"
    }
  ],
  "description": "Brief description of the generated app"
}

Requirements:
- Generate 5-10 files minimum: main app file, views, models, view models, utilities
- Use modern ${frameworkName} patterns and Swift best practices
- Include proper error handling, loading states, and empty states
- Make the code production-ready and well-commented
- Use realistic sample data where needed
- For UIKit: use programmatic layout with Auto Layout
- For SwiftUI: use proper SwiftUI lifecycle with @StateObject, @Published, etc.
- Include a README.md with setup instructions
- Filenames should match real Xcode project structure`;

    const userMessage = `Create a complete iOS ${frameworkName} app for: ${project.prompt}${contextBlock}

App name: ${project.name}

Generate all necessary files for a working iOS app.`;

    sendEvent({ type: "thinking", message: "Designing your iOS app..." });

    const stream = await openai.chat.completions.create({
      model: "gpt-5.3-codex",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
    });

    let fullResponse = "";
    let chunkCount = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        chunkCount++;
        // Send progress every 20 chunks
        if (chunkCount % 20 === 0) {
          sendEvent({ type: "progress", message: "Generating code..." });
        }
      }
    }

    // Parse the JSON response
    sendEvent({ type: "parsing", message: "Parsing generated files..." });

    let parsed: { files: Array<{ filename: string; filepath: string; content: string; language: string }>; description?: string };
    try {
      // Extract JSON from the response (might be wrapped in markdown code blocks)
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      req.log.error({ parseErr }, "Failed to parse AI response");
      await db
        .update(projectsTable)
        .set({ status: "error" })
        .where(eq(projectsTable.id, id));
      sendEvent({ type: "error", message: "Failed to parse generated code" });
      res.end();
      return;
    }

    // Delete old files if regenerating
    await db
      .delete(projectFilesTable)
      .where(eq(projectFilesTable.projectId, id));

    // Insert all generated files
    const filesToInsert = parsed.files.map((f) => ({
      projectId: id,
      filename: f.filename,
      filepath: f.filepath,
      content: f.content,
      language: f.language || "swift",
    }));

    if (filesToInsert.length > 0) {
      await db.insert(projectFilesTable).values(filesToInsert);
    }

    // Update project status and file count
    await db
      .update(projectsTable)
      .set({
        status: "complete",
        fileCount: filesToInsert.length,
        description: parsed.description ?? null,
      })
      .where(eq(projectsTable.id, id));

    sendEvent({
      type: "complete",
      done: true,
      fileCount: filesToInsert.length,
      description: parsed.description,
    });
    res.end();
  } catch (err) {
    req.log.error({ err }, "Generation failed");
    // Mark project as error
    try {
      await db
        .update(projectsTable)
        .set({ status: "error" })
        .where(eq(projectsTable.id, id));
    } catch (_) {}
    sendEvent({ type: "error", message: "Generation failed" });
    res.end();
  }
});

export default router;

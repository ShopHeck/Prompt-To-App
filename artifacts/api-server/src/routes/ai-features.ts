import { Router, type IRouter } from "express";
import { db, projectsTable, projectFilesTable, eq } from "@workspace/db";
import { getStylePresets } from "../lib/style-presets";
import { getApiKey } from "../lib/ai-client";
import { validateBody } from "../middleware/validate";
import { generateIconSchema, visualFeedbackSchema } from "../lib/request-schemas";

const router: IRouter = Router();

// ── Style Presets ────────────────────────────────────────────────────────────

router.get("/style-presets", (_req, res) => {
  res.json(getStylePresets());
});

// ── Generate Icon ────────────────────────────────────────────────────────────

router.post("/projects/:id/generate-icon", validateBody(generateIconSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const geminiKey = getApiKey("gemini");
    if (!geminiKey) {
      res.status(503).json({ error: "Icon generation unavailable: GEMINI_API_KEY not configured" });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Ownership check
    if (project.userId !== null && (!req.user || req.user.id !== project.userId)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (project.userId === null && req.user) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const appName = req.body.name || project.name;
    const appDescription = req.body.description || project.prompt;

    const prompt = `Generate a minimalist, professional app icon for an iOS app called "${appName}". The app is: ${appDescription}. The icon should be simple, modern, use bold shapes and a clean color palette. It should work well at small sizes (60x60) and large sizes (1024x1024). No text in the icon. Square format with rounded corners appropriate for iOS.`;

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      req.log.error({ status: resp.status, errorText: errorText.slice(0, 400) }, "Gemini icon generation failed");
      res.status(502).json({ error: "Icon generation failed from AI provider" });
      return;
    }

    const data = await resp.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart?.inlineData) {
      res.status(502).json({ error: "AI did not generate an image" });
      return;
    }

    const { data: base64Data, mimeType } = imagePart.inlineData;

    // Store as a project file
    const filepath = "Assets.xcassets/AppIcon.appiconset/icon.png";
    const existing = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, id));

    const existingIcon = existing.find((f) => f.filepath === filepath);
    if (existingIcon) {
      await db
        .update(projectFilesTable)
        .set({ content: base64Data })
        .where(eq(projectFilesTable.id, existingIcon.id));
    } else {
      await db.insert(projectFilesTable).values({
        projectId: id,
        filename: "icon.png",
        filepath,
        content: base64Data,
        language: "binary",
      });
    }

    res.json({
      success: true,
      filepath,
      mimeType,
      size: base64Data.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate icon");
    res.status(500).json({ error: "Failed to generate icon" });
  }
});

// ── Visual Feedback ──────────────────────────────────────────────────────────

router.post("/projects/:id/visual-feedback", validateBody(visualFeedbackSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const geminiKey = getApiKey("gemini");
    if (!geminiKey) {
      res.status(503).json({ error: "Visual feedback unavailable: GEMINI_API_KEY not configured" });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Ownership check
    if (project.userId !== null && (!req.user || req.user.id !== project.userId)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (project.userId === null && req.user) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { screenshot, instruction } = req.body as { screenshot: string; instruction?: string };

    // Get current project files for context
    const files = await db
      .select({ filepath: projectFilesTable.filepath, content: projectFilesTable.content })
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, id));

    const fileContext = files
      .filter((f) => f.filepath.endsWith(".swift") || f.filepath.endsWith(".tsx") || f.filepath.endsWith(".ts"))
      .slice(0, 10)
      .map((f) => `--- ${f.filepath} ---\n${f.content.slice(0, 2000)}`)
      .join("\n\n");

    const userInstruction = instruction
      ? `\nUser instruction: ${instruction}`
      : "";

    const systemPrompt = `You are a senior UI/UX reviewer analyzing a screenshot of a mobile app. The app is called "${project.name}" and described as: "${project.prompt}".

Analyze the screenshot for UI/UX issues including:
- Layout problems (alignment, spacing, overflow)
- Color/contrast issues
- Missing states (empty, loading, error)
- Accessibility concerns
- Platform convention violations
- Visual inconsistencies
${userInstruction}

Here is the current source code context:
${fileContext.slice(0, 15000)}

Respond with ONLY a valid JSON object:
{
  "issues": ["issue description 1", "issue description 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "patchedFiles": [
    {"path": "relative/file/path.swift", "content": "full corrected file content"}
  ]
}

The patchedFiles array should only include files that need changes. If no patches are needed, return an empty array for patchedFiles.`;

    // Strip data URL prefix if present
    const base64Image = screenshot.replace(/^data:image\/[^;]+;base64,/, "");

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image, mimeType: "image/png" } },
            { text: "Analyze this screenshot and provide your feedback as JSON." },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      req.log.error({ status: resp.status, errorText: errorText.slice(0, 400) }, "Gemini visual feedback failed");
      res.status(502).json({ error: "Visual feedback analysis failed from AI provider" });
      return;
    }

    const data = await resp.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let feedback: { issues: string[]; suggestions: string[]; patchedFiles?: Array<{ path: string; content: string }> };
    try {
      feedback = JSON.parse(responseText);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        feedback = JSON.parse(jsonMatch[0]);
      } else {
        res.status(502).json({ error: "Failed to parse AI feedback response" });
        return;
      }
    }

    res.json({
      issues: Array.isArray(feedback.issues) ? feedback.issues : [],
      suggestions: Array.isArray(feedback.suggestions) ? feedback.suggestions : [],
      patchedFiles: Array.isArray(feedback.patchedFiles) ? feedback.patchedFiles : [],
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate visual feedback");
    res.status(500).json({ error: "Failed to generate visual feedback" });
  }
});

export default router;

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, projectFilesTable } from "@workspace/db";
import { eq, desc, count, sum, and } from "drizzle-orm";
import JSZip from "jszip";
import {
  CreateProjectBody,
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
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
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

// POST /projects/:id/share  (generate or return existing share token)
router.post("/projects/:id/share", async (req, res) => {
  try {
    const { id } = GetProjectParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    let token = project.shareToken;
    if (!token) {
      token = crypto.randomUUID();
      await db
        .update(projectsTable)
        .set({ shareToken: token })
        .where(eq(projectsTable.id, id));
    }

    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
    const protocol = req.headers["x-forwarded-proto"] ?? "https";
    const url = `${protocol}://${host}/share/${token}`;

    res.json({ token, url });
  } catch (err) {
    req.log.error({ err }, "Failed to create share token");
    res.status(500).json({ error: "Failed to create share token" });
  }
});

// GET /share/:token  (public read-only view)
router.get("/share/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.shareToken, token));

    if (!project) { res.status(404).json({ error: "Shared project not found" }); return; }

    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, project.id))
      .orderBy(projectFilesTable.filepath);

    res.json({ project, files });
  } catch (err) {
    req.log.error({ err }, "Failed to get shared project");
    res.status(500).json({ error: "Failed to get shared project" });
  }
});

// GET /projects/:id/download  (zip all generated files)
function sendPreviewHtml(res: import("express").Response, html: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
      "style-src 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com data:",
      "img-src data: blob: https:",
      "connect-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
  );
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
}

router.get("/projects/:id/preview", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project || !project.livePreviewHtml) {
      res.status(404).type("text/html").send("<!doctype html><meta charset=utf-8><title>No preview</title><body style=\"font-family:-apple-system,sans-serif;background:#000;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:1rem;font-size:13px;\">Preview not yet available.</body>");
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

router.get("/projects/:id/download", async (req, res) => {
  try {
    const { id } = GetProjectParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));

    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, id))
      .orderBy(projectFilesTable.filepath);

    if (files.length === 0) {
      res.status(404).json({ error: "No files to download" }); return;
    }

    const zip = new JSZip();
    const folderName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const folder = zip.folder(folderName)!;

    for (const file of files) {
      folder.file(file.filepath, file.content);
    }

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

// Architecture plan JSON shape
interface SpmDependency {
  url: string;
  packageName: string;
  productNames: string[];
  version: string;
}

interface ArchitecturePlan {
  screens: Array<{ name: string; purpose: string }>;
  models: Array<{ name: string; fields: string[] }>;
  navigation: string;
  spmDependencies: SpmDependency[];
  fileList: Array<{ filename: string; purpose: string }>;
}

type GeneratedFile = {
  filename: string;
  filepath: string;
  content: string;
  language: string;
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeInfoPlist(targetName: string, projectName: string): string {
  const bundleId = xmlEscape(`com.example.${targetName.toLowerCase().replace(/[^a-z0-9]/g, "")}`);
  const displayName = xmlEscape(projectName);
  const bundleName = xmlEscape(targetName);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>${bundleId}</string>
    <key>CFBundleDisplayName</key>
    <string>${displayName}</string>
    <key>CFBundleName</key>
    <string>${bundleName}</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
</dict>
</plist>`;
}

function makePackageSwift(targetName: string, spmDependencies: SpmDependency[]): string {
  const depsDecl = spmDependencies.length
    ? spmDependencies
        .map(d => `        .package(url: "${d.url}", from: "${d.version}"),`)
        .join("\n") + "\n"
    : "";

  const targetDepsBlock = spmDependencies.length
    ? spmDependencies
        .flatMap(d =>
          d.productNames.map(
            pn => `                .product(name: "${pn}", package: "${d.packageName}"),`,
          ),
        )
        .join("\n") + "\n"
    : "";

  return `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "${targetName}",
    platforms: [.iOS(.v16)],
    products: [
        .executable(name: "${targetName}", targets: ["${targetName}"]),
    ],
    dependencies: [
${depsDecl}    ],
    targets: [
        .executableTarget(
            name: "${targetName}",
            dependencies: [
${targetDepsBlock}            ],
            path: "Sources/${targetName}",
            resources: [
                .process("Info.plist")
            ]
        )
    ]
)
`;
}

function normalizeSwiftPackage(
  files: GeneratedFile[],
  targetName: string,
  projectName: string,
  spmDependencies: SpmDependency[],
): GeneratedFile[] {
  const sourcesPrefix = `Sources/${targetName}/`;

  const swiftFiles: GeneratedFile[] = [];
  const readmeFiles: GeneratedFile[] = [];

  for (const f of files) {
    const basename = f.filepath.split("/").pop() ?? f.filename;
    const lower = basename.toLowerCase();

    if (lower === "package.swift") continue;
    if (lower === "info.plist") continue;

    if (lower === "readme.md") {
      readmeFiles.push({ ...f, filepath: "README.md", filename: "README.md" });
      continue;
    }

    if (f.language === "swift" || f.filename.endsWith(".swift")) {
      const swiftBasename = basename.endsWith(".swift") ? basename : `${basename}.swift`;
      swiftFiles.push({ ...f, filepath: `${sourcesPrefix}${swiftBasename}`, filename: swiftBasename });
    }
  }

  const seenBasenames = new Map<string, number>();
  const deduplicatedSwift = swiftFiles.map((f) => {
    const count = seenBasenames.get(f.filename) ?? 0;
    seenBasenames.set(f.filename, count + 1);
    if (count > 0) {
      const withoutExt = f.filename.replace(/\.swift$/, "");
      const newBasename = `${withoutExt}_${count}.swift`;
      return { ...f, filepath: `${sourcesPrefix}${newBasename}`, filename: newBasename };
    }
    return f;
  });

  const infoPlistFile: GeneratedFile = {
    filename: "Info.plist",
    filepath: `${sourcesPrefix}Info.plist`,
    language: "xml",
    content: makeInfoPlist(targetName, projectName),
  };

  const packageSwiftFile: GeneratedFile = {
    filename: "Package.swift",
    filepath: "Package.swift",
    language: "swift",
    content: makePackageSwift(targetName, spmDependencies),
  };

  return [
    packageSwiftFile,
    ...deduplicatedSwift,
    infoPlistFile,
    ...readmeFiles,
  ];
}

// ── Accuracy validation + repair helpers ──────────────────────────────────
type ItemStatus = "matched" | "missing" | "off-spec" | "extra";
interface AccuracyItem {
  type: "screen" | "model" | "file";
  name: string;
  status: ItemStatus;
  confidence: number;
  notes?: string;
}
interface AccuracyReport {
  overallScore: number;
  summary: string;
  items: AccuracyItem[];
}

function defaultAccuracyReport(plan: ArchitecturePlan, files: Array<{ filename: string; filepath: string }>): AccuracyReport {
  const items: AccuracyItem[] = [];
  const filenamesLower = new Set(files.map(f => f.filename.toLowerCase()));
  const swiftFiles = files.filter(f => f.filename.endsWith(".swift") && f.filename !== "Package.swift");
  const swiftBasesLower = new Set(swiftFiles.map(f => f.filename.replace(/\.swift$/i, "").toLowerCase()));

  for (const s of plan.screens) {
    const matched = swiftBasesLower.has(s.name.toLowerCase()) || swiftBasesLower.has(`${s.name.toLowerCase()}view`);
    items.push({ type: "screen", name: s.name, status: matched ? "matched" : "missing", confidence: matched ? 0.9 : 0.5 });
  }
  for (const m of plan.models) {
    const matched = swiftBasesLower.has(m.name.toLowerCase());
    items.push({ type: "model", name: m.name, status: matched ? "matched" : "missing", confidence: matched ? 0.9 : 0.5 });
  }
  for (const f of plan.fileList) {
    const matched = filenamesLower.has(f.filename.toLowerCase());
    items.push({ type: "file", name: f.filename, status: matched ? "matched" : "missing", confidence: matched ? 0.95 : 0.6 });
  }
  const total = items.length || 1;
  const matchedCount = items.filter(i => i.status === "matched").length;
  return {
    overallScore: Math.round((matchedCount / total) * 100),
    summary: `${matchedCount} of ${total} planned items present in generated output (heuristic).`,
    items,
  };
}

async function runAccuracyValidation(
  reqLog: import("pino").Logger | { error: (...args: unknown[]) => void },
  enrichedPrompt: string,
  plan: ArchitecturePlan,
  files: Array<{ filename: string; filepath: string; content: string }>,
): Promise<AccuracyReport> {
  const fileSummary = files
    .map(f => {
      const preview = f.content.slice(0, 240).replace(/\s+/g, " ");
      return `- ${f.filepath} :: ${preview}${f.content.length > 240 ? "..." : ""}`;
    })
    .join("\n");

  const systemPrompt = `You are a strict QA reviewer. Compare a generated iOS project to its original prompt and approved architecture plan, and produce a structured accuracy report.

Output ONLY JSON of this shape:
{
  "overallScore": 0-100,
  "summary": "one-sentence assessment",
  "items": [
    { "type": "screen" | "model" | "file", "name": "Name", "status": "matched" | "missing" | "off-spec" | "extra", "confidence": 0..1, "notes": "optional short note" }
  ]
}

Rules:
- Include one item for every planned screen, every planned model, and every planned file.
- "matched": present in output and serves the planned purpose.
- "missing": planned but not in the output.
- "off-spec": present but clearly wrong purpose, empty stub, or trivially broken.
- "extra": for output items NOT in the plan that look unrelated. Only flag if clearly off-topic; small helpers are fine.
- overallScore reflects how well the build matches the prompt + plan.
- Keep notes very short (<= 12 words).
- Output JSON only. No markdown.`;

  const userMessage = `Original prompt:
${enrichedPrompt}

Approved plan:
- screens: ${plan.screens.map(s => `${s.name} (${s.purpose})`).join("; ")}
- models: ${plan.models.map(m => m.name).join(", ")}
- navigation: ${plan.navigation}
- fileList: ${plan.fileList.map(f => f.filename).join(", ")}

Generated files (path :: short preview):
${fileSummary}

Produce the JSON report now.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in validation response");
    const parsed = JSON.parse(match[0]) as AccuracyReport;
    if (!Array.isArray(parsed.items)) throw new Error("Missing items array");
    const score = typeof parsed.overallScore === "number" ? Math.max(0, Math.min(100, Math.round(parsed.overallScore))) : 0;
    return {
      overallScore: score,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      items: parsed.items
        .filter(i => i && typeof i.name === "string" && typeof i.type === "string")
        .map(i => ({
          type: (["screen", "model", "file"].includes(i.type) ? i.type : "file") as AccuracyItem["type"],
          name: i.name,
          status: (["matched", "missing", "off-spec", "extra"].includes(i.status) ? i.status : "missing") as ItemStatus,
          confidence: typeof i.confidence === "number" ? Math.max(0, Math.min(1, i.confidence)) : 0.5,
          notes: typeof i.notes === "string" ? i.notes : undefined,
        })),
    };
  } catch (validateErr) {
    reqLog.error({ validateErr }, "AI validation failed; falling back to heuristic accuracy report");
    return defaultAccuracyReport(plan, files);
  }
}

function collectRepairTargets(report: AccuracyReport): string[] {
  const targets = new Set<string>();
  for (const item of report.items) {
    if (item.type !== "file") continue;
    if (item.status === "missing" || item.status === "off-spec") {
      targets.add(item.name);
    }
  }
  // Also derive file targets from missing screens/models by convention.
  for (const item of report.items) {
    if ((item.type === "screen" || item.type === "model") && item.status === "missing") {
      targets.add(`${item.name}.swift`);
    }
  }
  return Array.from(targets).slice(0, 6);
}

async function runRepairPass(
  reqLog: import("pino").Logger | { error: (...args: unknown[]) => void; info?: (...args: unknown[]) => void },
  appTargetName: string,
  frameworkName: string,
  enrichedPrompt: string,
  plan: ArchitecturePlan,
  existingFiles: Array<{ filename: string; filepath: string; content: string; language: string }>,
  targets: string[],
): Promise<Array<{ filename: string; filepath: string; content: string; language: string }>> {
  const existingSummary = existingFiles
    .map(f => `- ${f.filepath}`)
    .join("\n");

  const systemPrompt = `You are an expert iOS developer doing a targeted repair pass. Regenerate ONLY the files listed below to match the prompt + approved plan. Do not touch other files.

Output ONLY JSON of this shape:
{
  "files": [
    { "filename": "Name.swift", "filepath": "Sources/${appTargetName}/Name.swift", "content": "import SwiftUI\\n...", "language": "swift" }
  ]
}

Rules:
- One entry per requested filename.
- Place Swift files under Sources/${appTargetName}/.
- Use ${frameworkName} idioms.
- Keep code production-quality and self-contained.
- Do not include Package.swift or Info.plist.
- Output JSON only.`;

  const userMessage = `Prompt: ${enrichedPrompt}

Plan summary:
- screens: ${plan.screens.map(s => `${s.name} (${s.purpose})`).join("; ")}
- models: ${plan.models.map(m => m.name).join(", ")}
- navigation: ${plan.navigation}

Existing files in project:
${existingSummary}

Repair these specific files (regenerate or create from scratch):
${targets.map(t => `- ${t}`).join("\n")}

Output JSON now.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    reqLog.error("Repair pass returned no JSON");
    return [];
  }
  try {
    const parsed = JSON.parse(match[0]) as { files?: Array<{ filename: string; filepath: string; content: string; language?: string }> };
    if (!parsed.files || !Array.isArray(parsed.files)) return [];
    return parsed.files
      .filter(f => f && typeof f.filename === "string" && typeof f.content === "string")
      .map(f => ({
        filename: f.filename,
        filepath: typeof f.filepath === "string" && f.filepath.length > 0 ? f.filepath : `Sources/${appTargetName}/${f.filename}`,
        content: f.content,
        language: f.language ?? "swift",
      }));
  } catch (repairParseErr) {
    reqLog.error({ repairParseErr }, "Failed to parse repair JSON");
    return [];
  }
}

async function runLivePreviewGeneration(
  reqLog: import("pino").Logger | { error: (...args: unknown[]) => void; info?: (...args: unknown[]) => void },
  appName: string,
  enrichedPrompt: string,
  plan: ArchitecturePlan,
  files: Array<{ filename: string; filepath: string; content: string }>,
): Promise<string | null> {
  // Pick UI-relevant files (Views) and clip them to keep the prompt manageable.
  const viewFiles = files
    .filter(f => /view|screen|app\.swift$/i.test(f.filename) || f.filepath.toLowerCase().includes("view"))
    .slice(0, 8);
  const fallback = viewFiles.length === 0 ? files.filter(f => f.filename.endsWith(".swift")).slice(0, 6) : viewFiles;
  const fileBlock = fallback
    .map(f => {
      const clipped = f.content.length > 1500 ? f.content.slice(0, 1500) + "\n// ...truncated" : f.content;
      return `// ${f.filepath}\n${clipped}`;
    })
    .join("\n\n");

  const navHint = (plan.navigation || "").toLowerCase();
  const navStyle = /tab/.test(navHint) ? "bottom tab bar" : /stack|push|nav/.test(navHint) ? "navigation stack with back button" : "single screen";

  const systemPrompt = `You are a UI translator. Given an iOS app's plan and SwiftUI source, produce ONE self-contained HTML document that visually approximates the app so it can be embedded in an iframe inside a phone-frame preview.

Hard rules:
- Output a complete HTML document. Start with <!DOCTYPE html>. No markdown fences. No commentary.
- Inline ALL styles and scripts. Allowed CDN tags: <script src="https://cdn.tailwindcss.com"></script>.
- Target a 390x844 viewport. Use mobile-first layout. No horizontal scroll.
- Use the system font stack: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif.
- Render an iOS-style status bar (time 9:41, signal/wifi/battery glyphs as inline SVG or unicode) at the top.
- Implement screen switching with plain vanilla JS (no React, no build step). Use a simple state object that toggles which screen <section> is visible.
- Include the navigation pattern indicated below: ${navStyle}. For tab bar, render at the bottom with icons + labels. For nav stack, show a header with title and an optional chevron-left back button when not on the root screen.
- Each screen should render representative content based on its purpose, with realistic mock data. Lists, cards, buttons, form controls — match SwiftUI styling (rounded corners, subtle separators, generous spacing, blue tint #007AFF for actions).
- Tap targets must work: tapping a list row navigates if appropriate, buttons toggle state where it makes sense.
- Keep total output under 14000 characters.
- DO NOT fetch external resources besides Tailwind CDN. No images from external URLs (use CSS gradients or inline SVG placeholders).
- DO NOT include any explanatory text. Output the HTML only.`;

  const userMessage = `App name: ${appName}
Original prompt: ${enrichedPrompt}

Architecture plan:
- screens: ${plan.screens.map(s => `${s.name} — ${s.purpose}`).join("; ")}
- models: ${plan.models.map(m => `${m.name}{${m.fields.join(",")}}`).join("; ")}
- navigation: ${plan.navigation}

SwiftUI source (clipped):
${fileBlock}

Produce the HTML preview now.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 6000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    let raw = completion.choices[0]?.message?.content ?? "";
    raw = raw.trim();
    // Strip code fences if AI added them anyway.
    const fenceMatch = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fenceMatch) raw = fenceMatch[1].trim();
    // Find the first <!DOCTYPE or <html opening to be safe.
    const docIdx = raw.search(/<!doctype|<html/i);
    if (docIdx > 0) raw = raw.slice(docIdx);
    if (!/<html[\s>]/i.test(raw)) {
      reqLog.error("Live preview AI output missing <html> tag");
      return null;
    }
    return raw;
  } catch (err) {
    reqLog.error({ err }, "Live preview generation failed");
    return null;
  }
}

function mergeFiles(
  base: Array<{ filename: string; filepath: string; content: string; language: string; projectId?: number }>,
  patches: Array<{ filename: string; filepath: string; content: string; language: string }>,
): Array<{ filename: string; filepath: string; content: string; language: string }> {
  const byFilename = new Map<string, { filename: string; filepath: string; content: string; language: string }>();
  for (const f of base) {
    byFilename.set(f.filename.toLowerCase(), { filename: f.filename, filepath: f.filepath, content: f.content, language: f.language });
  }
  for (const p of patches) {
    byFilename.set(p.filename.toLowerCase(), p);
  }
  return Array.from(byFilename.values());
}

// ── Shared clarification + planning helpers ────────────────────────────────
interface ClarifyingQuestion {
  id: string;
  question: string;
  suggestion?: string;
}

async function detectAmbiguityAndAskQuestions(
  prompt: string,
  frameworkName: string,
): Promise<{ needsClarification: boolean; questions: ClarifyingQuestion[] }> {
  const systemPrompt = `You are an iOS product manager who decides whether a user's app idea is clear enough to plan, or whether it needs 3-5 quick clarifying questions first.

Return ONLY a JSON object of this exact shape:
{
  "needsClarification": true | false,
  "questions": [
    { "id": "kebab-case-key", "question": "Single concise question.", "suggestion": "A short suggested default answer (optional)." }
  ]
}

Decision rules:
- If the prompt names a concrete domain, key entities, and at least a hint of features (e.g. "a habit tracker with daily streaks and reminders"), set needsClarification to false and return [] for questions.
- If the prompt is vague or one-liner ("make me a fitness app", "a notes app"), set needsClarification to true and return 3-5 high-leverage questions covering: target audience, must-have features, data persistence (local/cloud/none), auth (yes/no), and any unique differentiator.
- Each question must be answerable in one short sentence.
- Provide a "suggestion" for each question when a reasonable default exists.
- Do not ask about visual design / colors. Focus on functional scope.
- Output ONLY the JSON object, no markdown, no extra text.`;

  const userMessage = `Framework: ${frameworkName}
User prompt: ${prompt}

Decide.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 800,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return { needsClarification: false, questions: [] };
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      needsClarification?: boolean;
      questions?: ClarifyingQuestion[];
    };
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .filter(q => q && typeof q.id === "string" && typeof q.question === "string")
          .slice(0, 5)
          .map(q => ({
            id: q.id,
            question: q.question,
            suggestion: typeof q.suggestion === "string" ? q.suggestion : undefined,
          }))
      : [];
    const needs = parsed.needsClarification === true && questions.length > 0;
    return { needsClarification: needs, questions: needs ? questions : [] };
  } catch {
    return { needsClarification: false, questions: [] };
  }
}

function buildEnrichedPrompt(
  originalPrompt: string,
  answers: Array<{ id: string; question: string; answer: string }>,
): string {
  if (answers.length === 0) return originalPrompt;
  const lines = answers
    .filter(a => a.answer && a.answer.trim().length > 0)
    .map(a => `- ${a.question} → ${a.answer.trim()}`);
  if (lines.length === 0) return originalPrompt;
  return `${originalPrompt}\n\nClarifications from the user:\n${lines.join("\n")}`;
}

async function runPlanningPhase(
  res: import("express").Response,
  sendEvent: (data: object) => void,
  reqLog: { error: (...args: unknown[]) => void },
  projectId: number,
  promptForPlanning: string,
  projectName: string,
  frameworkName: string,
  additionalContext: string | null,
): Promise<void> {
  const contextBlock = additionalContext
    ? `\nAdditional context from the user: ${additionalContext}`
    : "";

  sendEvent({ type: "planning", message: "Designing architecture..." });

  const planningSystemPrompt = `You are a senior iOS architect. Given an app description, produce a concise architecture plan as a JSON object.

Output ONLY a valid JSON object with this exact structure:
{
  "screens": [
    { "name": "ScreenName", "purpose": "One-line description of what this screen does" }
  ],
  "models": [
    { "name": "ModelName", "fields": ["fieldName: Type", "fieldName: Type"] }
  ],
  "navigation": "Short description of the navigation flow between screens",
  "spmDependencies": [],
  "fileList": [
    { "filename": "FileName.swift", "purpose": "One-line description" }
  ]
}

Rules:
- spmDependencies must be an array of objects. Each object must include ALL of these fields:
    "url": the full GitHub URL of the Swift package (e.g. "https://github.com/Alamofire/Alamofire")
    "packageName": the Swift package identity used in Package.swift (e.g. "Alamofire")
    "productNames": array of exact product names to link (e.g. ["Alamofire"])
    "version": the minimum version to require (e.g. "5.0.0")
  Leave spmDependencies as an empty array [] if the standard Apple frameworks suffice — which is almost always the case.
- fileList must include Package.swift, Info.plist, and all Swift source files
- Do not add markdown or any text outside the JSON object`;

  const planningUserMessage = `Plan the architecture for this iOS ${frameworkName} app:

App name: ${projectName}
Description: ${promptForPlanning}${contextBlock}

Produce the JSON architecture plan now.`;

  const planStream = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: planningSystemPrompt },
      { role: "user", content: planningUserMessage },
    ],
    stream: true,
  });

  let planRaw = "";
  for await (const chunk of planStream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      planRaw += content;
      sendEvent({ type: "planning_chunk", chunk: content });
    }
  }

  let architecturePlan: ArchitecturePlan;
  try {
    const jsonMatch = planRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in planning response");
    const candidate = JSON.parse(jsonMatch[0]) as ArchitecturePlan;
    if (!Array.isArray(candidate.screens) || !Array.isArray(candidate.models)) {
      throw new Error("Plan JSON missing required screens/models arrays");
    }
    architecturePlan = {
      screens: candidate.screens,
      models: candidate.models,
      navigation: typeof candidate.navigation === "string" ? candidate.navigation : "",
      spmDependencies: Array.isArray(candidate.spmDependencies) ? candidate.spmDependencies : [],
      fileList: Array.isArray(candidate.fileList) ? candidate.fileList : [],
    };
  } catch (planParseErr) {
    reqLog.error({ planParseErr }, "Failed to parse architecture plan — aborting generation");
    await db
      .update(projectsTable)
      .set({ status: "error" })
      .where(eq(projectsTable.id, projectId));
    sendEvent({ type: "error", message: "Architecture planning failed — could not parse plan. Please try again." });
    res.end();
    return;
  }

  const planJson = JSON.stringify(architecturePlan);
  await db
    .update(projectsTable)
    .set({ architecturePlan: planJson, status: "awaiting_approval" })
    .where(eq(projectsTable.id, projectId));
  sendEvent({ type: "plan", plan: architecturePlan });
  sendEvent({ type: "awaiting_approval", plan: architecturePlan });
  res.end();
}

// POST /projects/:id/generate  (SSE streaming — clarify (if needed) → plan)
router.post("/projects/:id/generate", async (req, res) => {
  const { id } = GenerateAppParams.parse(req.params);
  const body = GenerateAppBody.safeParse(req.body);
  const additionalContext = body.success ? body.data.additionalContext ?? null : null;

  // Set SSE headers
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
      sendEvent({ error: "Project not found" });
      res.end();
      return;
    }

    const frameworkName = project.framework === "swiftui" ? "SwiftUI" : "UIKit";

    // Mark as generating
    await db
      .update(projectsTable)
      .set({ status: "generating" })
      .where(eq(projectsTable.id, id));
    sendEvent({ type: "status", status: "generating" });

    // ── PHASE 0: Clarification check ───────────────────────────────────────
    sendEvent({ type: "clarify_check", message: "Checking prompt for ambiguity..." });
    let clarify: { needsClarification: boolean; questions: ClarifyingQuestion[] };
    try {
      clarify = await detectAmbiguityAndAskQuestions(project.prompt, frameworkName);
    } catch (clarifyErr) {
      req.log.error({ clarifyErr }, "Clarify-phase failed; proceeding directly to planning");
      clarify = { needsClarification: false, questions: [] };
    }

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

    // No clarification needed — store enrichedPrompt = prompt and run planning.
    await db
      .update(projectsTable)
      .set({
        clarifyingQuestions: JSON.stringify([]),
        clarifyAnswers: JSON.stringify([]),
        enrichedPrompt: project.prompt,
      })
      .where(eq(projectsTable.id, id));

    await runPlanningPhase(
      res,
      sendEvent,
      req.log,
      id,
      project.prompt,
      project.name,
      frameworkName,
      additionalContext,
    );
    return;
  } catch (err) {
    req.log.error({ err }, "Generation failed");
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

// POST /projects/:id/answer-clarifications  (SSE streaming — resume into planning)
router.post("/projects/:id/answer-clarifications", async (req, res) => {
  const { id } = AnswerClarificationsParams.parse(req.params);
  const body = AnswerClarificationsBody.safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }

  const { answers, additionalContext, skip } = body.data;

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

    const frameworkName = project.framework === "swiftui" ? "SwiftUI" : "UIKit";
    const cleanedAnswers = (answers ?? []).map(a => ({
      id: a.id,
      question: a.question,
      answer: skip ? "" : a.answer,
    }));
    const enriched = buildEnrichedPrompt(project.prompt, cleanedAnswers);

    await db
      .update(projectsTable)
      .set({
        clarifyAnswers: JSON.stringify(cleanedAnswers),
        enrichedPrompt: enriched,
        status: "generating",
      })
      .where(eq(projectsTable.id, id));

    sendEvent({ type: "clarify_resumed", enrichedPrompt: enriched, answers: cleanedAnswers });

    await runPlanningPhase(
      res,
      sendEvent,
      req.log,
      id,
      enriched,
      project.name,
      frameworkName,
      additionalContext ?? null,
    );
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

// POST /projects/:id/approve-plan  (SSE streaming — Phase 2: code generation with approved plan)
router.post("/projects/:id/approve-plan", async (req, res) => {
  const { id } = ApprovePlanParams.parse(req.params);
  const body = ApprovePlanBody.safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }

  const { plan: approvedPlan, additionalContext } = body.data;

  // Set SSE headers
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

    // Mark as generating
    await db
      .update(projectsTable)
      .set({ status: "generating", architecturePlan: JSON.stringify(approvedPlan) })
      .where(eq(projectsTable.id, id));

    const frameworkName = project.framework === "swiftui" ? "SwiftUI" : "UIKit";
    const contextBlock = additionalContext
      ? `\nAdditional context from the user: ${additionalContext}`
      : "";

    sendEvent({ type: "building", message: "Synthesizing source code..." });

    // Sanitize to a valid Swift module/target name
    const rawTarget = project.name.replace(/[^a-zA-Z0-9]/g, "");
    const appTargetName = rawTarget.length === 0
      ? "App"
      : /^[0-9]/.test(rawTarget)
        ? `App${rawTarget}`
        : rawTarget;

    // Serialize SPM deps for the prompt
    const validDeps = (approvedPlan.spmDependencies ?? [])
      .filter(
        d => d && typeof d.url === "string" && typeof d.packageName === "string" &&
             Array.isArray(d.productNames) && typeof d.version === "string",
      )
      .map(d => ({
        url: d.url.replace(/[`"\\]/g, ""),
        packageName: d.packageName.replace(/[^a-zA-Z0-9_-]/g, ""),
        productNames: d.productNames
          .filter((p): p is string => typeof p === "string")
          .map(p => p.replace(/[^a-zA-Z0-9_-]/g, "")),
        version: d.version.replace(/[^0-9.]/g, "") || "1.0.0",
      }))
      .filter(d => d.url.length > 0 && d.packageName.length > 0 && d.productNames.length > 0);
    const spmDepsBlock = validDeps.length
      ? `SPM dependencies:\n${validDeps.map(d => `  - ${d.packageName} (${d.url}) products: ${d.productNames.join(", ")} version: ${d.version}`).join("\n")}`
      : "No external SPM dependencies needed — use only Apple frameworks.";

    const planContextBlock = `
Architecture Plan (follow this exactly):
- Screens: ${approvedPlan.screens.map(s => `${s.name} (${s.purpose})`).join(", ")}
- Data Models: ${approvedPlan.models.map(m => m.name).join(", ")}
- Navigation: ${approvedPlan.navigation}
- Planned files: ${approvedPlan.fileList.map(f => f.filename).join(", ")}
${spmDepsBlock}
`;

    const systemPrompt = `You are an expert iOS developer. Generate a complete, production-quality iOS app using ${frameworkName}.
${planContextBlock}
Output ONLY a JSON object with this exact structure:
{
  "files": [
    {
      "filename": "ContentView.swift",
      "filepath": "Sources/${appTargetName}/ContentView.swift",
      "content": "import SwiftUI\\n...",
      "language": "swift"
    }
  ],
  "description": "Brief description of the generated app"
}

MANDATORY files — these MUST be present in every output:
1. Package.swift — Swift tools version 5.9, executable target named "${appTargetName}", sources under Sources/${appTargetName}/. Include any SPM deps from the plan.
2. Info.plist — placed at Sources/${appTargetName}/Info.plist with standard iOS keys (CFBundleIdentifier using com.example.${appTargetName.toLowerCase()}, CFBundleDisplayName, UILaunchScreen, etc.)
3. All Swift source files under Sources/${appTargetName}/

Requirements:
- Generate 7-12 files minimum including Package.swift and Info.plist
- Use modern ${frameworkName} patterns and Swift best practices
- Include proper error handling, loading states, and empty states
- Make the code production-ready and well-commented
- Use realistic sample data where needed
- For UIKit: use programmatic layout with Auto Layout
- For SwiftUI: use proper SwiftUI lifecycle with @main App struct, @StateObject, @Published, etc.
- Include a README.md with Xcode open instructions (open Package.swift in Xcode, select the ${appTargetName} scheme, hit Run)
- All filepaths must be correct relative paths (Package.swift at root, Swift files under Sources/${appTargetName}/)`;

    const userMessage = `Create a complete iOS ${frameworkName} app for: ${project.enrichedPrompt ?? project.prompt}${contextBlock}

App name: ${project.name}
Target name: ${appTargetName}

Generate all necessary files including Package.swift and Info.plist for a compilable Xcode project.`;

    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 32768,
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
        if (chunkCount % 20 === 0) {
          sendEvent({ type: "progress", message: "Generating code..." });
        }
      }
    }

    sendEvent({ type: "parsing", message: "Parsing generated files..." });

    let parsed: { files: Array<{ filename: string; filepath: string; content: string; language: string }>; description?: string };
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      req.log.error({ parseErr }, "Failed to parse AI response");
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
      sendEvent({ type: "error", message: "Failed to parse generated code" });
      res.end();
      return;
    }

    const normalizedFiles = normalizeSwiftPackage(
      parsed.files,
      appTargetName,
      project.name,
      validDeps,
    );
    req.log.info({ fileCount: normalizedFiles.length, target: appTargetName }, "Swift package normalized");

    const hasSwiftSource = normalizedFiles.some(
      f => f.filename.endsWith(".swift") && f.filename !== "Package.swift",
    );
    if (!hasSwiftSource) {
      req.log.error("No Swift source files in normalized output — aborting");
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
      sendEvent({ type: "error", message: "Code generation produced no Swift source files. Please try again." });
      res.end();
      return;
    }

    // Delete old files if regenerating
    await db.delete(projectFilesTable).where(eq(projectFilesTable.projectId, id));

    const filesToInsert = normalizedFiles.map((f) => ({
      projectId: id,
      filename: f.filename,
      filepath: f.filepath,
      content: f.content,
      language: f.language || "swift",
    }));

    if (filesToInsert.length > 0) {
      await db.insert(projectFilesTable).values(filesToInsert);
    }

    await db
      .update(projectsTable)
      .set({ fileCount: filesToInsert.length })
      .where(eq(projectsTable.id, id));

    // ── Validation pass ─────────────────────────────────────────────────────
    sendEvent({ type: "validating", message: "Checking output against the plan..." });
    const promptForValidation = project.enrichedPrompt ?? project.prompt;
    let finalFileCount = filesToInsert.length;
    let report = await runAccuracyValidation(
      req.log,
      promptForValidation,
      approvedPlan,
      filesToInsert.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content })),
    );
    sendEvent({ type: "accuracy_report", report });

    const repairHistory: Array<{ at: string; targets: string[]; before: AccuracyReport; after: AccuracyReport }> = [];

    // ── Single repair pass if issues found ──────────────────────────────────
    const repairTargets = collectRepairTargets(report);
    if (repairTargets.length > 0) {
      sendEvent({ type: "repairing", message: "Regenerating off-spec or missing files...", targets: repairTargets });
      try {
        const repaired = await runRepairPass(
          req.log,
          appTargetName,
          frameworkName,
          promptForValidation,
          approvedPlan,
          filesToInsert.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content, language: f.language })),
          repairTargets,
        );
        if (repaired.length > 0) {
          // Replace and re-normalize
          const merged = mergeFiles(filesToInsert, repaired);
          const renormalized = normalizeSwiftPackage(
            merged.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content, language: f.language })),
            appTargetName,
            project.name,
            validDeps,
          );
          await db.delete(projectFilesTable).where(eq(projectFilesTable.projectId, id));
          const newRows = renormalized.map(f => ({
            projectId: id,
            filename: f.filename,
            filepath: f.filepath,
            content: f.content,
            language: f.language || "swift",
          }));
          if (newRows.length > 0) {
            await db.insert(projectFilesTable).values(newRows);
          }
          // Re-run validation
          const before = report;
          report = await runAccuracyValidation(
            req.log,
            promptForValidation,
            approvedPlan,
            newRows.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content })),
          );
          repairHistory.push({
            at: new Date().toISOString(),
            targets: repairTargets,
            before,
            after: report,
          });
          sendEvent({ type: "repair_complete", report, history: repairHistory });
          finalFileCount = newRows.length;
          await db
            .update(projectsTable)
            .set({ fileCount: newRows.length })
            .where(eq(projectsTable.id, id));
        }
      } catch (repairErr) {
        req.log.error({ repairErr }, "Repair pass failed; continuing with original output");
      }
    }

    // ── Live preview generation ─────────────────────────────────────────────
    sendEvent({ type: "preview_generating", message: "Rendering live preview..." });
    let livePreviewHtml: string | null = null;
    try {
      const finalFiles = await db
        .select()
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, id));
      livePreviewHtml = await runLivePreviewGeneration(
        req.log,
        project.name,
        promptForValidation,
        approvedPlan,
        finalFiles.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content })),
      );
    } catch (previewErr) {
      req.log.error({ previewErr }, "Live preview generation threw");
    }

    await db
      .update(projectsTable)
      .set({
        status: "complete",
        description: parsed.description ?? null,
        accuracyReport: JSON.stringify(report),
        repairHistory: JSON.stringify(repairHistory),
        livePreviewHtml,
      })
      .where(eq(projectsTable.id, id));

    sendEvent({ type: "preview_ready", available: !!livePreviewHtml });
    sendEvent({
      type: "complete",
      done: true,
      fileCount: finalFileCount,
      description: parsed.description,
      accuracyReport: report,
      repairHistory,
      previewAvailable: !!livePreviewHtml,
    });
    res.end();
  } catch (err) {
    req.log.error({ err }, "Approve-plan phase 2 generation failed");
    try {
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
    } catch (_) {}
    sendEvent({ type: "error", message: "Code generation failed" });
    res.end();
  }
});

export default router;

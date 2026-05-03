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

// POST /projects/:id/generate  (SSE streaming — two-phase: plan then build)
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

    // ── PHASE 1: Architecture Planning ──────────────────────────────────────
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

App name: ${project.name}
Description: ${project.prompt}${contextBlock}

Produce the JSON architecture plan now.`;

    const planStream = await openai.chat.completions.create({
      model: "gpt-5.3-codex",
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

    // Parse the plan — required for the two-phase contract; fail fast if unparseable
    let architecturePlan: ArchitecturePlan;
    try {
      const jsonMatch = planRaw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in planning response");
      const candidate = JSON.parse(jsonMatch[0]) as ArchitecturePlan;
      if (!Array.isArray(candidate.screens) || !Array.isArray(candidate.models)) {
        throw new Error("Plan JSON missing required screens/models arrays");
      }
      // Default any optional fields that downstream code depends on
      architecturePlan = {
        screens: candidate.screens,
        models: candidate.models,
        navigation: typeof candidate.navigation === "string" ? candidate.navigation : "",
        spmDependencies: Array.isArray(candidate.spmDependencies) ? candidate.spmDependencies : [],
        fileList: Array.isArray(candidate.fileList) ? candidate.fileList : [],
      };
    } catch (planParseErr) {
      req.log.error({ planParseErr }, "Failed to parse architecture plan — aborting generation");
      await db
        .update(projectsTable)
        .set({ status: "error" })
        .where(eq(projectsTable.id, id));
      sendEvent({ type: "error", message: "Architecture planning failed — could not parse plan. Please try again." });
      res.end();
      return;
    }

    // Persist and emit the plan
    const planJson = JSON.stringify(architecturePlan);
    await db
      .update(projectsTable)
      .set({ architecturePlan: planJson, status: "awaiting_approval" })
      .where(eq(projectsTable.id, id));
    sendEvent({ type: "plan", plan: architecturePlan });

    // ── PAUSE: Awaiting user approval before Phase 2 ─────────────────────────
    sendEvent({ type: "awaiting_approval", plan: architecturePlan });
    res.end();
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

    const userMessage = `Create a complete iOS ${frameworkName} app for: ${project.prompt}${contextBlock}

App name: ${project.name}
Target name: ${appTargetName}

Generate all necessary files including Package.swift and Info.plist for a compilable Xcode project.`;

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
    req.log.error({ err }, "Approve-plan phase 2 generation failed");
    try {
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
    } catch (_) {}
    sendEvent({ type: "error", message: "Code generation failed" });
    res.end();
  }
});

export default router;

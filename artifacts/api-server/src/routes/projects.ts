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

function defaultBundleId(targetName: string): string {
  const sanitized = targetName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `app.${sanitized || "myapp"}.ios`;
}

function makeInfoPlist(targetName: string, projectName: string): string {
  const displayName = xmlEscape(projectName);
  const bundleName = xmlEscape(targetName);
  // CFBundleIdentifier is intentionally driven by project.yml/Xcode build
  // settings ($(PRODUCT_BUNDLE_IDENTIFIER)) so users can change it without
  // touching Info.plist. Adding the App Store-required compliance, capability,
  // device-family, and orientation keys up front prevents validation rejects.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleDisplayName</key>
    <string>${displayName}</string>
    <key>CFBundleName</key>
    <string>${bundleName}</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>ITSAppUsesNonExemptEncryption</key>
    <false/>
    <key>UIApplicationSupportsIndirectInputEvents</key>
    <true/>
    <key>UILaunchScreen</key>
    <dict>
        <key>UIColorName</key>
        <string>AccentColor</string>
    </dict>
    <key>UIRequiredDeviceCapabilities</key>
    <array>
        <string>arm64</string>
    </array>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationPortraitUpsideDown</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
</dict>
</plist>`;
}

function yamlEscape(s: string): string {
  // Minimal YAML string escaping for double-quoted strings.
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function makeProjectYml(
  targetName: string,
  projectName: string,
  bundleId: string,
  spmDependencies: SpmDependency[],
): string {
  const packagesBlock = spmDependencies.length
    ? "packages:\n" +
      spmDependencies
        .map(
          d =>
            `  ${d.packageName}:\n    url: ${d.url}\n    from: ${d.version}`,
        )
        .join("\n") +
      "\n"
    : "";

  const targetSpmDeps = spmDependencies.length
    ? spmDependencies
        .flatMap(d =>
          d.productNames.map(
            pn => `      - package: ${d.packageName}\n        product: ${pn}`,
          ),
        )
        .join("\n") + "\n"
    : "";

  return `# Generated by promptiOS. Run \`xcodegen generate\` (brew install xcodegen)
# to materialize ${targetName}.xcodeproj from this spec, then open it in Xcode.
name: ${targetName}
options:
  bundleIdPrefix: ${bundleId.split(".").slice(0, -1).join(".") || "app.myapp"}
  deploymentTarget:
    iOS: "16.0"
  createIntermediateGroups: true
  generateEmptyDirectories: true
settings:
  base:
    MARKETING_VERSION: "1.0.0"
    CURRENT_PROJECT_VERSION: "1"
    SWIFT_VERSION: "5.9"
    DEVELOPMENT_LANGUAGE: en
    ENABLE_USER_SCRIPT_SANDBOXING: YES
    GENERATE_INFOPLIST_FILE: NO
${packagesBlock}targets:
  ${targetName}:
    type: application
    platform: iOS
    deploymentTarget: "16.0"
    sources:
      - path: ${targetName}
    info:
      path: ${targetName}/Info.plist
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ${bundleId}
        PRODUCT_NAME: "${yamlEscape(projectName)}"
        TARGETED_DEVICE_FAMILY: "1,2"
        INFOPLIST_FILE: ${targetName}/Info.plist
        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
        ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor
        CODE_SIGN_STYLE: Automatic
${targetSpmDeps.length > 0 ? `    dependencies:\n${targetSpmDeps}` : ""}schemes:
  ${targetName}:
    build:
      targets:
        ${targetName}: all
    run:
      config: Debug
    archive:
      config: Release
`;
}

function makeAssetsContentsJson(): string {
  return `{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function makeAppIconContentsJson(): string {
  // Single 1024x1024 marketing icon slot — this is the only icon Xcode now
  // requires (Xcode 14+ generates the smaller sizes automatically). Users
  // must drop a real Icon-1024.png into AppIcon.appiconset/ before submitting.
  return `{
  "images" : [
    {
      "filename" : "Icon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function makeAccentColorContentsJson(): string {
  return `{
  "colors" : [
    {
      "color" : {
        "color-space" : "srgb",
        "components" : {
          "alpha" : "1.000",
          "blue" : "0.937",
          "green" : "0.388",
          "red" : "0.000"
        }
      },
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function makeAppIconReadme(): string {
  return `# App Icon

Drop a 1024×1024 PNG named **Icon-1024.png** into this folder before
archiving for the App Store. Xcode 14+ generates all the smaller icon
sizes from this single file at build time.

Requirements (App Store):
- Exactly 1024×1024 px, PNG, no alpha channel, sRGB.
- Square — Apple applies the rounded mask automatically.
- No transparency, no large flat backgrounds that match the system
  wallpaper.

Until you add Icon-1024.png the app will still build and run in the
simulator, but App Store validation will reject the archive with
"Missing app icon".
`;
}

function makeAppStoreReadme(targetName: string, projectName: string, bundleId: string): string {
  return `# ${projectName}

Generated by promptiOS. This project is structured as a real iOS App target
(via [XcodeGen](https://github.com/yonaskolb/XcodeGen)) so it can be
submitted to the App Store with no architectural changes.

## 1. One-time setup

\`\`\`bash
brew install xcodegen
\`\`\`

## 2. Generate the Xcode project

From the project root:

\`\`\`bash
xcodegen generate
open ${targetName}.xcodeproj
\`\`\`

This produces a fresh \`${targetName}.xcodeproj\` from \`project.yml\`. Re-run
\`xcodegen generate\` whenever you add or remove source files — the project
file is checked into git as the *source of truth output*, but \`project.yml\`
is the source of truth *input*.

## 3. Run on a simulator

In Xcode: pick an iPhone simulator → ⌘R.

## 4. Get App Store-ready

The project is preconfigured with everything App Store Connect requires
*except* the things only you can fill in:

| Step | Where | What to do |
| ---- | ----- | ---------- |
| Bundle Identifier | \`project.yml\` (\`PRODUCT_BUNDLE_IDENTIFIER\`) — currently \`${bundleId}\` | Change to a unique reverse-DNS string you own, e.g. \`com.yourcompany.${targetName.toLowerCase()}\`. Re-run \`xcodegen generate\` after editing. |
| Signing team | Xcode → Target → Signing & Capabilities | Pick your Apple Developer team. Leave "Automatically manage signing" on. |
| App icon | \`${targetName}/Assets.xcassets/AppIcon.appiconset/Icon-1024.png\` | Drop a 1024×1024 PNG (no alpha) here before archiving. |
| Display name | \`project.yml\` → \`PRODUCT_NAME\` and \`${targetName}/Info.plist\` → \`CFBundleDisplayName\` | Already set to "${projectName}". Change if you want the home-screen label different from the project name. |
| Privacy strings | \`${targetName}/Info.plist\` | If your app uses Camera, Microphone, Location, Contacts, Photos, etc. you **must** add the matching \`NS*UsageDescription\` key explaining why. App Store rejects apps that use these APIs without a usage string. |

The following App Store essentials are **already** wired up for you:

- \`ITSAppUsesNonExemptEncryption=false\` (skips the export-compliance prompt for HTTPS-only apps).
- \`LSRequiresIPhoneOS=true\` and \`UIRequiredDeviceCapabilities=[arm64]\`.
- iPhone + iPad device family, modern \`UILaunchScreen\` dictionary, supported orientations.
- iOS 16.0 deployment target, Swift 5.9, Automatic signing.
- Asset catalog with \`AppIcon\` and \`AccentColor\` slots.

## 5. Archive & ship

1. In Xcode set the destination to **Any iOS Device (arm64)**.
2. Bump the build number under Target → General if this is a re-upload.
3. **Product → Archive** (Release configuration is wired up via the \`${targetName}\` scheme).
4. In the Organizer that opens, **Validate App** first, then **Distribute App → App Store Connect → Upload**.
5. Create the matching app record at https://appstoreconnect.apple.com → Apps → +.
6. Once the build appears in TestFlight (10–60 min), invite testers, fill in the App Store listing (description, screenshots, privacy questionnaire), and submit for review.

The in-app **App Store guide** has the long-form walkthrough, including
common rejection reasons.
`;
}

function normalizeIosProject(
  files: GeneratedFile[],
  targetName: string,
  projectName: string,
  spmDependencies: SpmDependency[],
): GeneratedFile[] {
  const sourcesPrefix = `${targetName}/`;
  const bundleId = defaultBundleId(targetName);

  const swiftFiles: GeneratedFile[] = [];
  let userReadme: GeneratedFile | null = null;

  for (const f of files) {
    const basename = f.filepath.split("/").pop() ?? f.filename;
    const lower = basename.toLowerCase();

    // Drop any AI attempts at SPM / project / asset scaffolding — we own those.
    if (lower === "package.swift") continue;
    if (lower === "info.plist") continue;
    if (lower === "project.yml") continue;
    if (lower === "contents.json") continue;
    if (lower === "readme.md") {
      // Keep the AI's README only as a secondary doc; the App Store-ready
      // README is generated below.
      userReadme = { ...f, filepath: "NOTES.md", filename: "NOTES.md" };
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

  const projectYmlFile: GeneratedFile = {
    filename: "project.yml",
    filepath: "project.yml",
    language: "yaml",
    content: makeProjectYml(targetName, projectName, bundleId, spmDependencies),
  };

  const readmeFile: GeneratedFile = {
    filename: "README.md",
    filepath: "README.md",
    language: "markdown",
    content: makeAppStoreReadme(targetName, projectName, bundleId),
  };

  const assetCatalogContents: GeneratedFile = {
    filename: "Contents.json",
    filepath: `${sourcesPrefix}Assets.xcassets/Contents.json`,
    language: "json",
    content: makeAssetsContentsJson(),
  };
  const appIconContents: GeneratedFile = {
    filename: "Contents.json",
    filepath: `${sourcesPrefix}Assets.xcassets/AppIcon.appiconset/Contents.json`,
    language: "json",
    content: makeAppIconContentsJson(),
  };
  const appIconReadme: GeneratedFile = {
    filename: "README.md",
    filepath: `${sourcesPrefix}Assets.xcassets/AppIcon.appiconset/README.md`,
    language: "markdown",
    content: makeAppIconReadme(),
  };
  const accentColorContents: GeneratedFile = {
    filename: "Contents.json",
    filepath: `${sourcesPrefix}Assets.xcassets/AccentColor.colorset/Contents.json`,
    language: "json",
    content: makeAccentColorContentsJson(),
  };

  const result: GeneratedFile[] = [
    projectYmlFile,
    readmeFile,
    ...deduplicatedSwift,
    infoPlistFile,
    assetCatalogContents,
    appIconContents,
    appIconReadme,
    accentColorContents,
  ];
  if (userReadme) result.push(userReadme);
  return result;
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
  const swiftFiles = files.filter(f => f.filename.endsWith(".swift"));
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

  const systemPrompt = `You are a strict QA reviewer for studio-grade iOS apps. You evaluate both COMPLETENESS (does the build match the plan?) and QUALITY (does it look hand-crafted, accessible, and App Store-shippable?). Compare the generated project to its original prompt and approved architecture plan, and produce a structured accuracy report.

Output ONLY JSON of this shape:
{
  "overallScore": 0-100,
  "summary": "one-sentence assessment",
  "items": [
    { "type": "screen" | "model" | "file", "name": "Name", "status": "matched" | "missing" | "off-spec" | "extra", "confidence": 0..1, "notes": "optional short note" }
  ]
}

Status rules:
- Include one item for every planned screen, every planned model, and every planned file.
- "matched": present in output AND meets studio-grade quality (see quality bar below).
- "missing": planned but not in the output.
- "off-spec": present but clearly wrong purpose, empty stub, trivially broken, OR fails the quality bar (e.g. a screen with hardcoded colors, no loading/empty state, or no accessibility). Mark off-spec aggressively when quality is below studio bar — the repair pass will fix it.
- "extra": for output items NOT in the plan that look unrelated. Only flag if clearly off-topic; small helpers are fine.

Studio-grade quality bar (used to decide matched vs. off-spec, and to drive overallScore):
- Design system: there is a Theme/DesignSystem file with color palette + typography + spacing tokens. Other files use those tokens, NOT hardcoded colors / font sizes.
- States: list / data-driven screens have explicit loading, empty, and error states (or compose dedicated state-view components).
- Realistic data: seed data is varied and believable, not "Item 1, Item 2".
- Modern Swift: SwiftUI uses @Observable (Observation framework) for view models, NavigationStack (not NavigationView), async/await for any IO.
- Accessibility: icon-only buttons have accessibility labels; body text scales with Dynamic Type.
- Polish: at least some haptics or animations on key interactions where they fit.
- Persistence + Settings: when relevant to the app, there is a persistence layer and a Settings screen.

Scoring rubric (overallScore is the holistic result, not a strict average):
- 90-100: Plan complete + all studio-grade quality bars met. Reviewer would happily ship.
- 75-89: Plan complete but 1-2 quality gaps (e.g. design system used inconsistently, missing some empty states).
- 50-74: Plan complete but quality is mediocre — many hardcoded colors, weak states, no haptics/animations, dated patterns.
- 25-49: Plan partially missing AND quality is weak.
- 0-24: Plan largely missing or output is broken.

Notes guidance:
- Keep notes <= 14 words and SPECIFIC. Examples: "uses hardcoded #FF0000 instead of Theme.colors.danger", "no empty state for empty list", "uses NavigationView (deprecated)", "missing accessibility labels on icon buttons".
- For matched items, omit notes unless something noteworthy.

Output JSON only. No markdown.`;

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
      max_completion_tokens: 2400,
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
  return Array.from(targets).slice(0, 10);
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

  const systemPrompt = `You are a principal iOS engineer doing a targeted POLISH + REPAIR pass on a studio-grade ${frameworkName} app. Regenerate ONLY the files listed below — either because they are missing OR because they fall short of the studio quality bar (hardcoded colors, missing states, weak accessibility, dated SwiftUI patterns, etc.). Do not touch any other file.

Output ONLY JSON of this shape:
{
  "files": [
    { "filename": "Name.swift", "filepath": "${appTargetName}/Name.swift", "content": "import SwiftUI\\n...", "language": "swift" }
  ]
}

Rules:
- One entry per requested filename. If a target is a screen/component that should live in a subfolder (e.g. Components/), use that filepath.
- Place Swift files under ${appTargetName}/ (no "Sources/" prefix — this is a real iOS App target, not an SPM executable).
- Use ${frameworkName} idioms. SwiftUI: @Observable view models (NOT @ObservableObject), NavigationStack, async/await, modern symbol effects.
- Read tokens from the existing Theme/DesignSystem file — NEVER use hardcoded colors, font sizes, or raw paddings (use Theme.spacing.* / Theme.radii.* / Theme.colors.* / Font.app*).
- Every list / data screen MUST have explicit loading, empty, and error states (use the existing EmptyStateView / LoadingView / ErrorView components when present in the plan).
- Use realistic, varied seed data (5-10 items, believable names/dates/descriptions). NEVER "Item 1, Item 2".
- Add accessibility labels on icon-only buttons; allow Dynamic Type (no \`.fixedSize()\` on body copy); keep tap targets >= 44pt.
- Add subtle haptics (Haptics.impact / Haptics.success / Haptics.error) on primary interactions when a Haptics helper exists.
- File header is a one-line comment: \`// AppName/FileName.swift — purpose\`.
- Files should be 30-120 lines, dense and well-factored. Extract subviews when nesting exceeds 3 levels.
- Do not include Package.swift, Info.plist, project.yml, README.md, Assets.xcassets, or any Contents.json — those are managed by the build system.
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
    max_completion_tokens: 6000,
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
        filepath: typeof f.filepath === "string" && f.filepath.length > 0 ? f.filepath : `${appTargetName}/${f.filename}`,
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

  const systemPrompt = `You are a UI translator. Given an iOS app's plan and SwiftUI source, produce ONE self-contained HTML document that visually approximates the app so it can be embedded in an iframe inside a phone-frame preview. The iframe is rendered at intrinsic 390×844 logical pixels and CSS-scaled to fit, so design EXACTLY for that viewport.

Hard rules:
- Output a complete HTML document. Start with <!DOCTYPE html>. No markdown fences. No commentary.
- Inline ALL styles and scripts. Allowed CDN tags: <script src="https://cdn.tailwindcss.com"></script>. Optional: Google Fonts <link> tags.
- The <head> MUST include this exact viewport meta tag: <meta name="viewport" content="width=390, initial-scale=1, viewport-fit=cover">.
- The <body> MUST be exactly 390px wide and 844px tall with overflow:hidden, so the iframe scales correctly. Apply this with inline style: style="margin:0;width:390px;height:844px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;".
- Inside <body>, layout must be a column: a fixed-height status bar (~44px), a flex-1 SCREEN container that holds the visible <section>, and (when present) a fixed-height tab bar (~84px) at the bottom. The SCREEN container MUST have overflow-y:auto and overscroll-behavior:contain so vertical scrolling happens INSIDE the iframe. Header / tab bar use position:sticky within their flex slots, NOT position:fixed.
- Render an iOS-style status bar at the top: time "9:41" on the left, signal/wifi/battery glyphs (inline SVG or unicode) on the right, ~44px tall.
- Implement screen switching with plain vanilla JS (no React, no build step). Use a simple state object that toggles which screen <section data-screen="..."> is visible (display:none vs flex).
- Include the navigation pattern indicated below: ${navStyle}. For tab bar, render at the bottom with icons + labels, exactly 84px tall (includes safe-area inset). For nav stack, show a sticky header with title and an optional chevron-left back button when not on the root screen.
- Every interactive element (<button>, list rows that navigate, tab items, toggles, links) MUST have a working JS click/tap handler — no dead controls. Tapping a list row navigates if appropriate; toggles flip a boolean and re-render.
- Each screen renders representative content based on its purpose, with realistic mock data (5-10 varied items per list, believable names/dates/copy, NEVER "Item 1, Item 2"). Match modern iOS styling: rounded corners (12-20px), subtle separators (rgba(60,60,67,0.18)), generous spacing (16-24px), accent #007AFF for actions, system grays for secondary text.
- Typography: body text minimum 15px, navigation/tab labels 11-13px, headlines 20-34px. Multi-word strings MUST wrap naturally — no white-space:nowrap on titles, descriptions, or list rows.
- Tap targets are at least 44×44px.
- Keep total output under 22000 characters.
- DO NOT fetch external resources besides Tailwind CDN and Google Fonts. No images from external URLs (use CSS gradients or inline SVG placeholders).
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
      max_completion_tokens: 9000,
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

  const planningSystemPrompt = `You are a senior iOS product designer and architect at a top-tier studio (think Linear, Things, Stripe, Apple Design Award winners). You design apps that look hand-crafted, feel native, and ship to the App Store.

Given an app description, produce a concise architecture plan as a JSON object.

Output ONLY a valid JSON object with this exact structure:
{
  "screens": [
    { "name": "ScreenName", "purpose": "One-line description including the visual treatment, key states (loading/empty/error), and primary interactions" }
  ],
  "models": [
    { "name": "ModelName", "fields": ["fieldName: Type", "fieldName: Type"] }
  ],
  "navigation": "Short description of the navigation flow between screens — including the primary container (NavigationStack vs. TabView), the visual mood/design language (e.g. 'warm minimal, generous whitespace, Inter-style sans, accent #6366F1, rounded 16'), and any onboarding/settings flow.",
  "spmDependencies": [],
  "fileList": [
    { "filename": "FileName.swift", "purpose": "One-line description of the file's role and notable details" }
  ]
}

Studio-grade architecture rules — the fileList MUST include all of the following (in addition to screens and models):
- A design-system file (e.g. "Theme.swift" or "DesignSystem.swift") that defines the app's color palette, typography scale, spacing tokens, corner radii, shadow elevations, and motion curves. Every other view will read from it — no hardcoded colors or font sizes anywhere.
- A "Haptics.swift" helper that wraps UIImpactFeedbackGenerator / UINotificationFeedbackGenerator for standardized tactile feedback on key interactions.
- One "ViewModel" file per stateful screen (e.g. "HomeViewModel.swift") using the @Observable macro (iOS 17+). Pure SwiftUI views consume them via @State / @Bindable.
- A "Components/" folder of 2-4 reusable view files (e.g. "PrimaryButton.swift", "Card.swift", "EmptyStateView.swift", "LoadingView.swift", "ErrorView.swift") that the screens compose. Empty / loading / error states are first-class — every list-style screen must have all three.
- A persistence/service layer when the app has state worth keeping across launches: a "Store.swift" or service file using @AppStorage, UserDefaults, or SwiftData. Choose the lightest option that fits.
- A "SettingsView.swift" screen with About, Version (read from Bundle), and any user-facing toggles (e.g. dark-mode override, units, notifications).
- An onboarding/welcome screen ("OnboardingView.swift") whenever the app benefits from a first-launch introduction (most apps with state do).

Other rules:
- screens.purpose and fileList.purpose should be specific and visually-grounded ("Hero card with current city, glassy translucent header, hourly scroll strip below" — not "shows weather").
- Aim for 12-18 Swift files total. Fewer than 10 is almost never enough for studio-grade.
- spmDependencies must be an array of objects. Each object must include ALL of these fields:
    "url": the full GitHub URL of the Swift package (e.g. "https://github.com/Alamofire/Alamofire")
    "packageName": the Swift package identity (e.g. "Alamofire")
    "productNames": array of exact product names to link (e.g. ["Alamofire"])
    "version": the minimum version to require (e.g. "5.0.0")
  Leave spmDependencies as an empty array [] if the standard Apple frameworks suffice — which is almost always the case.
- fileList must include all Swift source files only (do NOT list Package.swift, Info.plist, project.yml, README, or Assets.xcassets — those are auto-generated by the build pipeline).
- Always include a single @main entry-point Swift file in fileList. For SwiftUI: a file ending in "App.swift" containing \`@main struct ...App: App\`. For UIKit: an "AppDelegate.swift" file (UIApplicationDelegate) plus a "SceneDelegate.swift" file.
- Do not add markdown or any text outside the JSON object.`;

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

    const systemPrompt = `You are a principal iOS engineer at a top-tier studio (Linear, Things, Stripe, Apple Design Award caliber). You write code that looks hand-crafted, feels native, and ships to the App Store. Generate a complete, studio-grade iOS app using ${frameworkName} from the plan below.
${planContextBlock}
Output ONLY a JSON object with this exact structure:
{
  "files": [
    {
      "filename": "${appTargetName}App.swift",
      "filepath": "${appTargetName}/${appTargetName}App.swift",
      "content": "import SwiftUI\\n@main\\nstruct ${appTargetName}App: App { ... }",
      "language": "swift"
    }
  ],
  "description": "Brief description of the generated app"
}

PROJECT STRUCTURE — this is a real iOS App target (XcodeGen-generated .xcodeproj), NOT a Swift Package executable:
- All Swift sources go under ${appTargetName}/ (NO "Sources/" prefix).
- Do NOT generate Package.swift, Info.plist, project.yml, README.md, or any Assets.xcassets/Contents.json files — the build pipeline owns those.

MANDATORY content:
1. Exactly one @main App entry-point file: filename "${appTargetName}App.swift" at filepath "${appTargetName}/${appTargetName}App.swift". For SwiftUI use \`@main struct ${appTargetName}App: App { var body: some Scene { WindowGroup { RootView() } } }\` where RootView (or whatever primary screen the plan names) is the planned entry screen. For UIKit use \`@main class AppDelegate: UIResponder, UIApplicationDelegate\` plus a SceneDelegate. If the persistence layer uses SwiftData (@Model), add the required \`.modelContainer(for: [Type1.self, Type2.self])\` modifier to the WindowGroup.
2. A primary screen file (e.g. ContentView.swift) plus every screen listed in the plan.
3. Every data model file listed in the plan.
4. Every supporting file from the plan: Theme/DesignSystem, Haptics, ViewModels, Components, Store/service, Settings, Onboarding (when planned).

DESIGN SYSTEM (non-negotiable) — implement a Theme.swift file that defines:
- A cohesive color palette appropriate to the app's mood. Provide BOTH light and dark variants via \`Color(uiColor: UIColor { trait in trait.userInterfaceStyle == .dark ? darkHex : lightHex })\` or asset-catalog-style dynamic colors. Tokens at minimum: background, surface, surfaceElevated, textPrimary, textSecondary, textTertiary, accent, accentMuted, border, success, warning, danger.
- A typography scale: largeTitle, title, headline, body, callout, footnote — each with weight + tracking. Wrap them as \`Font\` extensions (e.g. \`Font.appTitle\`).
- Spacing tokens (xs:4, s:8, m:12, l:16, xl:24, xxl:32) and corner radii (sm:8, md:12, lg:16, xl:24, full:999).
- Shadow elevations (e1, e2, e3) as ViewModifiers.
- Motion curves: \`Animation.smooth\` / \`Animation.snappy\` constants for the app.
Every screen and component MUST consume Theme tokens. Hardcoded colors, fixed font sizes, raw paddings (other than 0/spacing tokens) are DISQUALIFYING.

UX QUALITY (non-negotiable):
- Every list / data-driven screen has explicit loading, empty, and error states — using bespoke EmptyStateView / LoadingView / ErrorView components from the plan, with a SF Symbol, headline, body, and (when relevant) a primary action button.
- Realistic seeded data: 5-10 varied items per list with believable names, dates, descriptions, emoji/symbols, and reasonable variation. NEVER "Item 1, Item 2".
- Persistence: when state matters across launches, persist via @AppStorage / UserDefaults JSON / SwiftData (@Model). Pick the lightest fit.
- Haptics: tap a Haptics.impact(.soft) on primary buttons, .success / .error on completions/errors. Use sparingly and meaningfully.
- Animations: use \`withAnimation(.smooth)\` on state changes; matchedGeometryEffect for hero transitions; \`.symbolEffect(.bounce)\` / \`.contentTransition(.numericText())\` (iOS 17+) where it fits. Subtle, not gimmicky.
- Accessibility: every Image/Icon-only button has \`.accessibilityLabel\`; decorative images use \`.accessibilityHidden(true)\`; text scales with Dynamic Type (no \`.fixedSize()\` on body copy); tap targets are at least 44pt.
- Settings screen uses Form with sections, includes Version (\`Bundle.main.infoDictionary\`), and a "Made with promptiOS" footer is fine.

CODE QUALITY (non-negotiable for SwiftUI):
- Use the @Observable macro (Observation framework, iOS 17+) for ViewModels — NOT @ObservableObject + @Published. Views own them with \`@State private var viewModel = HomeViewModel()\` and pass children \`@Bindable var viewModel\` when they need to mutate.
- Prefer \`NavigationStack\` (not the deprecated \`NavigationView\`).
- Pure value types for models; \`Identifiable\` + \`Hashable\` where lists need them.
- Concurrency: \`async/await\`, \`Task { ... }\`, \`@MainActor\` on UI types when needed. No completion handlers.
- File header is a one-line comment: \`// AppName/FileName.swift — purpose\`. No license blocks.
- Keep view bodies readable: extract subviews when nesting exceeds ~3 levels, and prefer many small views over giant ones.

GENERAL RULES:
- Generate 12-18 Swift files. Fewer than 10 is disqualifying. Each file should be 30-120 lines, dense and well-factored.
- For UIKit: programmatic Auto Layout, no Storyboards. Same design-system + state + accessibility expectations apply (UIColor extensions, UIFont extensions, etc.).
- If the app uses Camera, Microphone, Location, Contacts, Photos, HealthKit, or any privacy-sensitive API, add a comment at the top of the relevant Swift file: \`// REQUIRES Info.plist key: NSCameraUsageDescription = "<reason>"\` (the user reads README.md for what to add).
- All filepaths must use the ${appTargetName}/ prefix (e.g. "${appTargetName}/ContentView.swift", "${appTargetName}/Components/PrimaryButton.swift").
- The code MUST compile cleanly against iOS 17+ with Xcode 15+ — no experimental APIs, no deprecated symbols.`;

    const userMessage = `Create a complete iOS ${frameworkName} app for: ${project.enrichedPrompt ?? project.prompt}${contextBlock}

App name: ${project.name}
Target name: ${appTargetName}

Generate Swift sources only. Place every file under ${appTargetName}/. Always include ${appTargetName}App.swift as the @main entry point.`;

    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 65536,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
    });

    let fullResponse = "";
    let chunkCount = 0;
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const content = choice?.delta?.content;
      if (content) {
        fullResponse += content;
        chunkCount++;
        if (chunkCount % 20 === 0) {
          sendEvent({ type: "progress", message: "Generating code..." });
        }
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    }

    sendEvent({ type: "parsing", message: "Parsing generated files..." });

    let parsed: { files: Array<{ filename: string; filepath: string; content: string; language: string }>; description?: string };
    try {
      // With response_format=json_object the response is raw JSON, but be
      // defensive against accidental markdown fences from older models.
      let jsonText = fullResponse.trim();
      const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenced) jsonText = fenced[1].trim();
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        // Fallback: extract from first '{' to last '}' (handles stray prose).
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace === -1 || lastBrace <= firstBrace) {
          throw new Error(
            finishReason === "length"
              ? "Model output was truncated before JSON closed (token cap reached)."
              : "No JSON object found in model output.",
          );
        }
        parsed = JSON.parse(jsonText.slice(firstBrace, lastBrace + 1));
      }
    } catch (parseErr) {
      const message = parseErr instanceof Error ? parseErr.message : "unknown parse error";
      const truncated = finishReason === "length";
      req.log.error(
        { parseErr: message, finishReason, responseLength: fullResponse.length, head: fullResponse.slice(0, 400) },
        "Failed to parse AI response",
      );
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, id));
      sendEvent({
        type: "error",
        message: truncated
          ? "Code generation hit the model's output limit before finishing. Try a smaller plan or split features across screens."
          : `Failed to parse generated code: ${message}`,
      });
      res.end();
      return;
    }

    const normalizedFiles = normalizeIosProject(
      parsed.files,
      appTargetName,
      project.name,
      validDeps,
    );
    req.log.info({ fileCount: normalizedFiles.length, target: appTargetName }, "iOS project normalized");

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
          const renormalized = normalizeIosProject(
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

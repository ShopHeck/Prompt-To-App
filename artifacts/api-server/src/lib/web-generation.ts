import {
  callWithFallback,
  DEFAULT_MODELS,
  FALLBACK_MODELS,
  type Provider,
} from "./ai-client";
import {
  WEB_COMPONENT_LIBRARY,
  WEB_PATTERN_MENU,
  getSelectedWebPatterns,
  getScaffoldFiles,
} from "./web-component-library";

export interface WebPlan {
  appName: string;
  tagline: string;
  signatureFeature: string;
  accentColorHex: string;
  visualPersonality: string;
  designSystem: Record<string, string>;
  pages: Array<{ name: string; route: string; purpose: string; primaryCTA: string; emptyStateCopy: string }>;
  dataModel: Array<{ name: string; fields: Array<{ name: string; type: string }> }>;
  frameworks: string[];
  seedData: string;
  userJourneys: string[];
  delightMoments: string[];
  acceptanceCriteria: string[];
  apiRoutes: Array<{ method: string; path: string; purpose: string; responseShape: string }>;
  databaseSchema: Array<{ table: string; columns: Array<{ name: string; type: string; constraints?: string }> }>;
  authStrategy: string;
  componentPatterns: string[];
}

export interface WebProject {
  appName: string;
  summary: string;
  files: Array<{ path: string; content: string }>;
  plan: WebPlan;
}

const ARCHITECT_PROMPT = `You are a Senior Full-Stack Web Application Architect. Given a user idea, produce a detailed plan for a React + Tailwind CSS + Vite web application with an optional backend layer.

Your plan must include:
- appName: PascalCase (e.g. "MealPlanner")
- tagline: one-liner marketing pitch
- signatureFeature: the single feature that makes this app special
- accentColorHex: a DISTINCTIVE hex color (NOT default blue #3B82F6)
- visualPersonality: e.g. "bold and playful", "minimal and elegant", "dark and futuristic"
- designSystem: { accentColorHex, backgroundPrimary, backgroundSecondary, surfaceColor, textPrimary, textSecondary, fontFamily, borderRadius, shadowStyle, motionPersonality }
- pages: array of { name, route, purpose, primaryCTA, emptyStateCopy } — 3-5 pages
- dataModel: array of { name, fields: [{name, type}] } — 1-2 models
- frameworks: ["React", "Tailwind CSS", "Vite", plus any others]
- seedData: realistic example data (3-5 items per model) — specific names, numbers, dates
- userJourneys: 2-3 key user flows
- delightMoments: 3-4 specific micro-interactions (hover effects, transitions, animations)
- acceptanceCriteria: 5-7 testable quality gates
- apiRoutes: array of { method, path, purpose, responseShape } — 3-6 REST endpoints
- databaseSchema: array of { table, columns: [{name, type, constraints}] } — SQL table definitions
- authStrategy: one of "none" | "email_password" | "social_oauth"

Scope constraint: Keep it to 3-5 pages, 1-2 models, 3-6 API routes, minimal dependencies.

You MUST also select 4-6 premium component patterns from this library to include in the project:
${WEB_PATTERN_MENU}

Return your plan as a JSON object.`;

const ENGINEER_PROMPT = `You are a Senior Full-Stack React Engineer building a production-quality web application with React 18 + Tailwind CSS + Vite, with an integrated backend layer.

Rules:
1. TypeScript everywhere — strict mode, no \`any\`.
2. Functional components only. Use React hooks (useState, useEffect, useCallback, useMemo).
3. Tailwind CSS for all styling — no inline styles, no CSS modules.
4. Use the plan's designSystem tokens: map them to Tailwind config (colors, fonts, border-radius).
5. seed data from the plan — never use "Item 1", "Lorem ipsum", or placeholder text.
6. Use React Router v6 for routing (createBrowserRouter or BrowserRouter).
7. Responsive: mobile-first, looks great on phone, tablet, and desktop.
8. Transitions: use CSS transitions/animations or framer-motion for page transitions, hover effects, and entrance animations.
9. Accessibility: semantic HTML, ARIA labels, keyboard navigation, focus rings.
10. Each page component in its own file. Shared components in components/.

# Backend layer
If the plan includes apiRoutes and databaseSchema:
- Generate src/lib/api.ts — typed API client with fetch wrappers for each endpoint.
- Generate src/lib/db.ts — in-memory database implementation using a Map or array that holds the seed data.
- Generate server/api.ts — Express-style route handlers that wire up to db.ts.
- Generate server/schema.sql — SQL DDL for all tables in databaseSchema.

If the plan includes authStrategy !== "none":
- Generate src/lib/auth.ts — auth context with AuthProvider, useAuth hook.
- Generate src/components/AuthGuard.tsx — route wrapper that redirects to /login if not authenticated.
- Generate src/pages/Login.tsx and src/pages/Register.tsx.

File structure (15-30 files):
- src/main.tsx — React entry with BrowserRouter
- src/App.tsx — root component with routes and layout
- src/index.css — Tailwind directives + custom CSS vars
- src/lib/data.ts — seed data and TypeScript types/interfaces
- src/lib/api.ts — typed API client functions
- src/components/*.tsx — reusable UI components
- src/pages/*.tsx — one per page in the plan

SCAFFOLD FILES ARE PRE-GENERATED: Do NOT generate package.json, tsconfig.json, postcss.config.js, vite.config.ts, or index.html.

Return a JSON object with this structure:
{
  "appName": "...",
  "summary": "...",
  "files": [{ "path": "src/pages/Home.tsx", "content": "..." }]
}

Return ONLY the JSON.`;

export async function runWebPlanning(
  log: { error: (...args: unknown[]) => void },
  prompt: string,
  provider: Provider,
): Promise<WebPlan> {
  const result = await callWithFallback(
    {
      provider,
      model: DEFAULT_MODELS[provider].planner,
      system: ARCHITECT_PROMPT,
      userMessage: `Design a React + Tailwind CSS web app for this idea:\n\n"${prompt}"`,
      maxTokens: 8192,
      timeoutMs: 120_000,
      responseFormat: "json",
    },
    FALLBACK_MODELS[provider].planner,
  );

  const raw = result.content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Architect did not return a valid plan.");
  return JSON.parse(jsonMatch[0]) as WebPlan;
}

export async function runWebGeneration(
  log: { error: (...args: unknown[]) => void },
  prompt: string,
  plan: WebPlan,
  provider: Provider,
): Promise<WebProject> {
  const selectedPatternIds = plan.componentPatterns ?? ["glass_card", "animated_list", "empty_state", "shimmer_skeleton"];
  const componentLibrary = getSelectedWebPatterns(selectedPatternIds);
  const componentContext = componentLibrary
    ? `\n\n## PREMIUM COMPONENT LIBRARY\n${componentLibrary}\n\nPlace each component in src/components/ui/<Name>.tsx. Import and USE them extensively in your page components.`
    : "";

  const scaffoldFiles = getScaffoldFiles(plan as unknown as Record<string, unknown>);
  const componentFiles = selectedPatternIds
    .map(id => {
      const pattern = WEB_COMPONENT_LIBRARY.find(p => p.id === id);
      if (!pattern) return null;
      return { path: `src/components/ui/${pattern.name}.tsx`, content: pattern.tsx };
    })
    .filter((f): f is { path: string; content: string } => f !== null);

  const hasBackend = Array.isArray(plan.apiRoutes) && plan.apiRoutes.length > 0;
  const hasAuth = plan.authStrategy && plan.authStrategy !== "none";

  const userMessage = `App idea: "${prompt}"

Architect's plan:
\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`${componentContext}

Build the app-specific React + Tailwind code. 10-20 files (pages, components, hooks, data). Scaffold files (package.json, tsconfig, vite.config, etc.) are pre-injected — do NOT generate them. Use the plan's designSystem tokens. Use seedData for real content. Implement every page in the plan. USE the premium components provided above.${hasBackend ? "\n\nThe plan includes apiRoutes and databaseSchema — generate the full backend layer (src/lib/api.ts, src/lib/db.ts, server/api.ts, server/schema.sql). All page components must call the API client, NOT import seed data directly." : ""}${hasAuth ? `\n\nThe plan specifies authStrategy: "${plan.authStrategy}". Generate auth files (src/lib/auth.ts, src/components/AuthGuard.tsx, src/pages/Login.tsx, src/pages/Register.tsx) and wrap protected routes with AuthGuard.` : ""}`;

  const result = await callWithFallback(
    {
      provider,
      model: DEFAULT_MODELS[provider].engineer,
      system: ENGINEER_PROMPT,
      userMessage,
      maxTokens: 65536,
      timeoutMs: 300_000,
      responseFormat: "json",
    },
    FALLBACK_MODELS[provider].engineer,
  );

  const raw = result.content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Engineer did not return a valid project.");

  const rawProject = JSON.parse(jsonMatch[0]) as {
    appName: string;
    summary: string;
    files: Array<{ path: string; content: string }>;
  };

  if (!rawProject.files?.length) throw new Error("Engineer returned no files.");

  const engineerPaths = new Set(rawProject.files.map(f => f.path));
  const mergedFiles = [
    ...scaffoldFiles.filter(f => !engineerPaths.has(f.path)),
    ...componentFiles.filter(f => !engineerPaths.has(f.path)),
    ...rawProject.files,
  ];

  return {
    appName: rawProject.appName ?? plan.appName,
    summary: rawProject.summary ?? plan.tagline,
    files: mergedFiles,
    plan,
  };
}

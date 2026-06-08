import { BaseGenerator, type GeneratorContext, type GeneratorResult } from "./base-generator";
import { runWebPlanning, runWebGeneration, type WebPlan } from "../web-generation";
import type { ArchitecturePlan } from "../types";

/**
 * Web generator that wraps the existing runWebPlanning() and runWebGeneration()
 * functions into the BaseGenerator interface. Handles React + Tailwind CSS + Vite
 * web app generation.
 */
export class WebGenerator extends BaseGenerator {
  readonly target = "web_react";

  validate(plan: ArchitecturePlan): string[] {
    // Web generation uses its own WebPlan structure generated during planning.
    // The ArchitecturePlan passed here may be a WebPlan stored as JSON, so we
    // perform minimal validation.
    const errors: string[] = [];
    if (!plan || typeof plan !== "object") {
      errors.push("Plan must be a valid object.");
    }
    return errors;
  }

  async generate(context: GeneratorContext): Promise<GeneratorResult> {
    const { prompt, provider, sendEvent, reqLog } = context;

    // Phase 1: Planning (web uses its own planning flow)
    sendEvent({ type: "progress", phase: "analyzing", message: "Architect designing web app...", percent: 5 });

    let plan: WebPlan;
    try {
      plan = await runWebPlanning(reqLog, prompt, provider);
    } catch (err) {
      throw new Error("Web planning phase failed", { cause: err });
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

    // Phase 2: Code generation
    sendEvent({ type: "progress", phase: "generating", message: "Engineer building web app...", percent: 30 });

    const webProject = await runWebGeneration(reqLog, prompt, plan, provider);

    if (!webProject.files?.length) {
      throw new Error("Web generation produced no files.");
    }

    // Emit file events for progress tracking
    for (const file of webProject.files) {
      sendEvent({ type: "file", path: file.path, phase: "engineer" });
    }

    sendEvent({
      type: "progress",
      phase: "bundling",
      message: `Project built: ${webProject.files.length} files`,
      percent: 85,
    });

    // Convert web files to the common GeneratorResult format
    const files = webProject.files.map(f => ({
      filename: f.path.split("/").pop() ?? f.path,
      filepath: f.path,
      content: f.content,
      language: this.inferLanguage(f.path),
    }));

    return {
      files,
      description: webProject.summary ?? null,
    };
  }

  private inferLanguage(filepath: string): string {
    const ext = filepath.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "css":
        return "css";
      case "html":
        return "html";
      case "json":
        return "json";
      case "sql":
        return "sql";
      default:
        return "text";
    }
  }
}

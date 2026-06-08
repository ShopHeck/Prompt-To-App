import type { Provider } from "../ai-client";
import type { ArchitecturePlan } from "../types";
import type { SendEvent, ReqLogger } from "../generation-types";
import type { Response } from "express";

/**
 * Context provided to a generator's generate() method.
 */
export interface GeneratorContext {
  projectId: number;
  projectName: string;
  framework: string;
  prompt: string;
  approvedPlan: ArchitecturePlan;
  additionalContext: string | null;
  provider: Provider;
  userId?: number | null;
  sendEvent: SendEvent;
  reqLog: ReqLogger;
  res: Response;
}

/**
 * A single generated file produced by a generator.
 */
export interface GeneratedFileOutput {
  filename: string;
  filepath: string;
  content: string;
  language: string;
}

/**
 * Token usage information from the AI provider.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Result returned from a generator's generate() method.
 */
export interface GeneratorResult {
  files: GeneratedFileOutput[];
  description: string | null;
  tokenUsage?: TokenUsage;
}

/**
 * Abstract base class for pluggable code generators.
 * Each target platform (iOS SwiftUI, iOS UIKit, React web, etc.)
 * implements this class to handle prompt building, AI streaming,
 * and response parsing for its platform.
 */
export abstract class BaseGenerator {
  abstract readonly target: string;

  /**
   * Validate that the approved plan is suitable for this generator.
   * Returns an array of validation error messages (empty = valid).
   */
  abstract validate(plan: ArchitecturePlan): string[];

  /**
   * Run code generation: build the prompt, stream AI response, parse files.
   * Post-generation steps (validation, repair, preview, quality) remain
   * in the GenerationService orchestrator.
   */
  abstract generate(context: GeneratorContext): Promise<GeneratorResult>;
}

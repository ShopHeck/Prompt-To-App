import type { BaseGenerator } from "./base-generator";
import { IosGenerator } from "./ios-generator";
import { WebGenerator } from "./web-generator";

type GeneratorFactory = () => BaseGenerator;

const GENERATOR_FACTORIES: Record<string, GeneratorFactory> = {};

/**
 * Register a generator factory function for a given target string.
 */
export function registerGenerator(target: string, factory: GeneratorFactory): void {
  GENERATOR_FACTORIES[target] = factory;
}

/**
 * Get a generator instance for the given target.
 * Throws if no generator is registered for that target.
 */
export function getGenerator(target: string): BaseGenerator {
  const factory = GENERATOR_FACTORIES[target];
  if (!factory) {
    throw new Error(
      `Unsupported generation target: "${target}". Available targets: ${listAvailableTargets().join(", ")}`,
    );
  }
  return factory();
}

/**
 * List all registered target strings.
 */
export function listAvailableTargets(): string[] {
  return Object.keys(GENERATOR_FACTORIES);
}

/**
 * Resolve a project's framework field (e.g. 'swiftui', 'uikit', 'react')
 * to the corresponding registry target key.
 */
export function resolveTargetFromFramework(framework: string): string {
  switch (framework) {
    case "swiftui":
      return "ios_swiftui";
    case "uikit":
      return "ios_uikit";
    case "react":
      return "web_react";
    default:
      return framework;
  }
}

// ── Default registrations ─────────────────────────────────────────────────
registerGenerator("ios_swiftui", () => new IosGenerator("ios_swiftui"));
registerGenerator("ios_uikit", () => new IosGenerator("ios_uikit"));
registerGenerator("web_react", () => new WebGenerator());

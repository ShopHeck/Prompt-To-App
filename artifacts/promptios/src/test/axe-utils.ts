import axe, { type Result, type RunOptions, type Spec } from "axe-core";

export interface A11yOptions {
  rules?: Record<string, { enabled: boolean }>;
}

let configured = false;

export function configureAxe(spec?: Spec): void {
  if (spec) {
    axe.configure(spec);
  }
  configured = true;
}

export async function getViolations(
  container: Element,
  options?: A11yOptions,
): Promise<Result[]> {
  if (!configured) {
    // Set default config - disable color-contrast since jsdom doesn't compute styles
    axe.configure({
      rules: [{ id: "color-contrast", enabled: false }],
    });
    configured = true;
  }

  const runOptions: RunOptions = {};
  if (options?.rules) {
    runOptions.rules = options.rules;
  }

  const results = await axe.run(container, runOptions);
  return results.violations;
}

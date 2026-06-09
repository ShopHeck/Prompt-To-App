import { configureAxe, getViolations } from "./axe-utils";

export interface A11yOptions {
  rules?: Record<string, { enabled: boolean }>;
}

/**
 * Run axe-core accessibility checks on a container element.
 * Throws an error if any critical or serious violations are found.
 */
export async function checkA11y(
  container: Element,
  options?: A11yOptions,
): Promise<void> {
  const violations = await getViolations(container, options);

  const serious = violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );

  if (serious.length > 0) {
    const messages = serious.map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n` +
        v.nodes.map((n) => `  - ${n.html}`).join("\n"),
    );
    throw new Error(
      `Found ${serious.length} accessibility violation(s):\n\n${messages.join("\n\n")}`,
    );
  }
}

export { configureAxe };

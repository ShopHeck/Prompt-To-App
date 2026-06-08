/**
 * Maps file extensions to Monaco editor language identifiers.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  swift: "swift",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  xml: "xml",
  plist: "xml",
  svg: "xml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  sql: "sql",
  graphql: "graphql",
  dockerfile: "dockerfile",
  toml: "ini",
  ini: "ini",
  env: "ini",
  txt: "plaintext",
};

/**
 * Get the Monaco language ID for a given filename.
 */
export function getLanguageFromFilename(filename: string): string {
  const lower = filename.toLowerCase();

  // Handle special filenames (no extension)
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  if (lower === "gemfile") return "ruby";

  const ext = lower.split(".").pop() ?? "";
  return EXTENSION_TO_LANGUAGE[ext] ?? "plaintext";
}

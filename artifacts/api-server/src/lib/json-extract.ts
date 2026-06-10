// Robust JSON extraction from LLM output.
//
// Model responses frequently wrap JSON in markdown fences, prepend commentary,
// append trailing text, or get truncated mid-object by token caps. The greedy
// /\{[\s\S]*\}/ regex previously used across the engine fails on several of
// these. This module extracts the first balanced JSON object via a
// string-aware brace scan and can repair truncated documents by closing open
// strings/arrays/objects.

export interface ExtractedJson<T> {
  value: T;
  /** True when the JSON was incomplete and had to be repaired (truncated output). */
  repaired: boolean;
}

/** Strip markdown code fences (closed or unterminated) around a JSON payload. */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  // Unterminated fence — typical of truncated output: ```json { ... <EOF>
  const open = trimmed.match(/^```(?:json)?\s*([\s\S]*)$/i);
  if (open) return open[1].trim();
  return trimmed;
}

/**
 * Find the first balanced JSON object in the text. Returns the candidate text
 * and whether the closing brace was actually found (complete) or the input
 * ended first (truncated).
 */
export function extractBalancedObject(raw: string): { text: string; complete: boolean } | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return { text: raw.slice(start, i + 1), complete: true };
    }
  }
  return { text: raw.slice(start), complete: false };
}

/**
 * Close any open string, drop a dangling comma/colon/backslash, then close
 * open arrays/objects in reverse order so JSON.parse can accept the document.
 */
export function repairTruncatedJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let out = text;
  if (escaped) out = out.slice(0, -1);
  if (inString) out += '"';
  out = out.replace(/[\s]+$/, "");
  if (out.endsWith(",")) out = out.slice(0, -1);
  if (out.endsWith(":")) out += " null";
  while (stack.length > 0) out += stack.pop();
  return out;
}

/**
 * Extract and parse the first JSON object from raw model output.
 * Throws when no object can be recovered.
 */
export function extractJsonWithMeta<T>(raw: string, opts?: { repair?: boolean }): ExtractedJson<T> {
  const cleaned = stripFences(raw);

  // Fast path: the whole payload is valid JSON.
  try {
    return { value: JSON.parse(cleaned) as T, repaired: false };
  } catch { /* fall through to balanced extraction */ }

  const candidate = extractBalancedObject(cleaned);
  if (!candidate) throw new Error("No JSON object found in model output.");

  if (candidate.complete) {
    return { value: JSON.parse(candidate.text) as T, repaired: false };
  }

  if (opts?.repair === false) {
    throw new Error("JSON object in model output is incomplete (truncated).");
  }
  const repairedText = repairTruncatedJson(candidate.text);
  return { value: JSON.parse(repairedText) as T, repaired: true };
}

/** Extract and parse, throwing on failure. */
export function extractJson<T>(raw: string, opts?: { repair?: boolean }): T {
  return extractJsonWithMeta<T>(raw, opts).value;
}

/** Extract and parse, returning null instead of throwing. */
export function tryExtractJson<T>(raw: string, opts?: { repair?: boolean }): T | null {
  try {
    return extractJson<T>(raw, opts);
  } catch {
    return null;
  }
}

import { describe, it, expect } from "vitest";
import {
  extractJson,
  extractJsonWithMeta,
  tryExtractJson,
  extractBalancedObject,
  repairTruncatedJson,
} from "../lib/json-extract";

describe("extractJson", () => {
  it("parses a plain JSON document", () => {
    expect(extractJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"files": [{"name": "A.swift"}]}\n```';
    expect(extractJson<{ files: Array<{ name: string }> }>(raw).files[0].name).toBe("A.swift");
  });

  it("ignores leading and trailing prose around the object", () => {
    const raw = 'Here is your plan:\n{"screens": ["Home"]}\nLet me know if you need changes!';
    expect(extractJson<{ screens: string[] }>(raw)).toEqual({ screens: ["Home"] });
  });

  it("stops at the matching closing brace instead of the last brace in the text", () => {
    const raw = '{"a": 1} and also another stray } brace';
    expect(extractJson<{ a: number }>(raw)).toEqual({ a: 1 });
  });

  it("handles braces and escaped quotes inside string values", () => {
    const raw = '{"content": "struct A { let s = \\"}\\" }"}';
    expect(extractJson<{ content: string }>(raw).content).toContain("{ let s =");
  });

  it("repairs JSON truncated mid-string", () => {
    const raw = '{"files": [{"name": "A.swift", "content": "import Swi';
    const result = extractJsonWithMeta<{ files: Array<{ name: string }> }>(raw);
    expect(result.repaired).toBe(true);
    expect(result.value.files[0].name).toBe("A.swift");
  });

  it("repairs JSON truncated after a comma", () => {
    const raw = '{"items": [1, 2,';
    const result = extractJsonWithMeta<{ items: number[] }>(raw);
    expect(result.repaired).toBe(true);
    expect(result.value.items).toEqual([1, 2]);
  });

  it("repairs JSON truncated after a key's colon", () => {
    const raw = '{"a": 1, "b":';
    const result = extractJsonWithMeta<{ a: number; b: null }>(raw);
    expect(result.repaired).toBe(true);
    expect(result.value).toEqual({ a: 1, b: null });
  });

  it("repairs JSON inside an unterminated markdown fence", () => {
    const raw = '```json\n{"a": [1, 2';
    const result = extractJsonWithMeta<{ a: number[] }>(raw);
    expect(result.repaired).toBe(true);
    expect(result.value.a).toEqual([1, 2]);
  });

  it("throws on truncated JSON when repair is disabled", () => {
    expect(() => extractJson('{"a": [1, 2', { repair: false })).toThrow(/incomplete/);
  });

  it("throws when there is no JSON object at all", () => {
    expect(() => extractJson("I could not produce a plan, sorry.")).toThrow(/No JSON object/);
  });

  it("tryExtractJson returns null instead of throwing", () => {
    expect(tryExtractJson("no json here")).toBeNull();
    expect(tryExtractJson('{"x": true}')).toEqual({ x: true });
  });
});

describe("extractBalancedObject", () => {
  it("reports complete=false for truncated objects", () => {
    expect(extractBalancedObject('{"a": [1')?.complete).toBe(false);
    expect(extractBalancedObject('{"a": [1]}')?.complete).toBe(true);
  });

  it("returns null when no opening brace exists", () => {
    expect(extractBalancedObject("plain text")).toBeNull();
  });
});

describe("repairTruncatedJson", () => {
  it("closes open strings, arrays, and objects in order", () => {
    const repaired = repairTruncatedJson('{"a": {"b": ["c');
    expect(() => JSON.parse(repaired)).not.toThrow();
    expect(JSON.parse(repaired)).toEqual({ a: { b: ["c"] } });
  });

  it("drops a trailing escape backslash before closing", () => {
    const repaired = repairTruncatedJson('{"a": "text\\');
    expect(() => JSON.parse(repaired)).not.toThrow();
  });
});

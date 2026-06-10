import { describe, it, expect } from "vitest";
import { mergeFiles } from "../lib/ai-pipeline";

const f = (filepath: string, content = "old") => ({
  filename: filepath.split("/").pop() ?? filepath,
  filepath,
  content,
  language: "swift",
});

describe("mergeFiles", () => {
  it("replaces a file by exact filepath match", () => {
    const base = [f("App/HomeView.swift"), f("App/Theme.swift")];
    const merged = mergeFiles(base, [f("App/HomeView.swift", "new")]);
    expect(merged).toHaveLength(2);
    expect(merged.find(x => x.filepath === "App/HomeView.swift")?.content).toBe("new");
  });

  it("replaces by filename when the patch filepath differs but the name is unambiguous", () => {
    const base = [f("App/Components/Card.swift"), f("App/Theme.swift")];
    const merged = mergeFiles(base, [f("App/Card.swift", "new")]);
    expect(merged).toHaveLength(2);
    expect(merged.find(x => x.filename === "Card.swift")?.content).toBe("new");
  });

  it("does not clobber a same-named file in another directory when an exact path exists", () => {
    const base = [f("App/Card.swift", "root"), f("App/Components/Card.swift", "component")];
    const merged = mergeFiles(base, [f("App/Components/Card.swift", "patched")]);
    expect(merged).toHaveLength(2);
    expect(merged.find(x => x.filepath === "App/Card.swift")?.content).toBe("root");
    expect(merged.find(x => x.filepath === "App/Components/Card.swift")?.content).toBe("patched");
  });

  it("appends when the filename is ambiguous and no path matches", () => {
    const base = [f("App/A/Item.swift", "a"), f("App/B/Item.swift", "b")];
    const merged = mergeFiles(base, [f("App/C/Item.swift", "c")]);
    expect(merged).toHaveLength(3);
    expect(merged.find(x => x.filepath === "App/A/Item.swift")?.content).toBe("a");
    expect(merged.find(x => x.filepath === "App/B/Item.swift")?.content).toBe("b");
  });

  it("appends brand new files", () => {
    const base = [f("App/HomeView.swift")];
    const merged = mergeFiles(base, [f("App/NewView.swift", "new")]);
    expect(merged).toHaveLength(2);
  });

  it("matches filepaths case-insensitively", () => {
    const base = [f("App/HomeView.swift")];
    const merged = mergeFiles(base, [{ ...f("app/homeview.swift", "new"), filename: "HomeView.swift" }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe("new");
  });
});

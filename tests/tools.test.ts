import { describe, it, expect } from "vitest";
import { get_writeup_template, list_categories } from "../src/tools.js";

describe("get_writeup_template", () => {
  it("returns markdown for requested category", () => {
    const r = get_writeup_template("web", "SQLi Baby", "ExampleCTF 2026");
    expect(r.category).toBe("web");
    expect(r.markdown).toContain("SQLi Baby");
    expect(r.markdown).toContain("ExampleCTF 2026");
    expect(r.markdown).toContain("## Flag");
  });

  it("falls back to misc for unknown category", () => {
    const r = get_writeup_template("unknown-cat");
    expect(r.category).toBe("unknown-cat");
    expect(r.markdown).toContain("## Summary");
  });
});

describe("list_categories", () => {
  it("lists common categories", () => {
    const r = list_categories();
    const ids = r.categories.map(c => c.id);
    expect(ids).toContain("web");
    expect(ids).toContain("pwn");
    expect(ids).toContain("crypto");
    expect(ids).toContain("rev");
    expect(ids).toContain("forensics");
  });
});

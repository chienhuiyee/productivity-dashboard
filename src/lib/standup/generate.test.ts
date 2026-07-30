import { describe, expect, it } from "vitest";
import { buildClaudeArgs } from "./generate";

describe("buildClaudeArgs", () => {
  it("builds headless JSON args with a model (no --bare, which breaks token auth)", () => {
    const a = buildClaudeArgs("claude-sonnet-5");
    expect(a).toEqual(["-p", "--output-format", "json", "--model", "claude-sonnet-5"]);
  });
  it("appends the image path and Read tool when given an image", () => {
    const a = buildClaudeArgs("claude-sonnet-5", "/tmp/x.png");
    expect(a).toContain("--allowedTools");
    expect(a).toContain("Read");
    expect(a[a.length - 1]).toBe("/tmp/x.png");
  });
});

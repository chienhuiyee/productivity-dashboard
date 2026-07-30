import { describe, expect, it } from "vitest";
import { buildClaudeArgs } from "./generate";

describe("buildClaudeArgs", () => {
  it("builds headless JSON args with a model (no --bare, which breaks token auth)", () => {
    const a = buildClaudeArgs("claude-sonnet-5");
    expect(a).toEqual(["-p", "--output-format", "json", "--model", "claude-sonnet-5"]);
  });
  it("enables the Read tool for an image (path goes in the prompt, not argv)", () => {
    const a = buildClaudeArgs("claude-sonnet-5", "/tmp/x.png");
    expect(a).toContain("--allowedTools");
    expect(a).toContain("Read");
    expect(a).not.toContain("/tmp/x.png");
  });
});

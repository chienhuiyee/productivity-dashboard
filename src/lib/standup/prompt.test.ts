import { describe, expect, it } from "vitest";
import { buildGeneratePrompt, parseImageItems } from "./prompt";
import type { StandupFacts } from "./types";

const facts: StandupFacts = {
  mergedPrs: [{ repo: "o/web", number: 158, title: "RBAC", url: "u" }],
  openedPrs: [], reviewedPrs: [], openedIssues: [], closedIssues: [],
  commitsByRepo: [{ repo: "o/web", count: 9 }],
  needsReview: 4, waitingOnYou: 2, failingMain: ["o/job"], inProgress: [],
};

describe("buildGeneratePrompt", () => {
  it("includes the facts and instructs the model to use only them", () => {
    const p = buildGeneratePrompt(facts, [], [], "met with hck");
    expect(p).toContain("RBAC");
    expect(p).toContain("o/job");
    expect(p).toContain("met with hck");
    expect(p.toLowerCase()).toContain("only");
  });
});

describe("parseImageItems", () => {
  it("extracts items from a JSON reply", () => {
    expect(parseImageItems('{"items":["a","b"]}')).toEqual(["a", "b"]);
  });
  it("extracts from fenced JSON and ignores prose", () => {
    expect(parseImageItems('here you go:\n```json\n{"items":["x"]}\n```')).toEqual(["x"]);
  });
  it("returns [] on garbage", () => {
    expect(parseImageItems("no json here")).toEqual([]);
  });
});

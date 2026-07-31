import { describe, expect, it } from "vitest";
import { buildGeneratePrompt, parseImageItems } from "./prompt";
import type { StandupFacts, TrackedItem } from "./types";

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

  it("passes a scheduled item's time as local text, not a raw UTC ISO", () => {
    const item: TrackedItem = {
      id: "1",
      text: "sync with hck",
      type: "meeting",
      status: "open",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      scheduledFor: "2026-07-30T06:30:00.000Z",
      parentId: null,
    };
    const p = buildGeneratePrompt(facts, [], [item], "");
    expect(p).toContain("sync with hck");
    expect(p).toContain("scheduled for");
    expect(p).not.toContain("2026-07-30T06:30:00.000Z"); // never the raw UTC ISO
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
  it("ignores stray braces outside the JSON object", () => {
    expect(parseImageItems('{profile} board — {"items":["Fix bug"]} trailing {x}')).toEqual(["Fix bug"]);
  });
  it("extracts from a prose-wrapped reply", () => {
    expect(parseImageItems('Here are the items: {"items":["a","b"]}. Hope that helps!')).toEqual(["a", "b"]);
  });
});

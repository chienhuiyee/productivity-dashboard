import { describe, expect, it } from "vitest";
import { buildFocus, scoreAction, scorePr } from "./score";
import { RULES } from "./rules";
import type { ActionFailure, PullRequestItem } from "@/lib/github/types";

const NOW = Date.parse("2026-01-15T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function makePr(overrides: Partial<PullRequestItem> = {}): PullRequestItem {
  return {
    repo: "o/r",
    number: 1,
    title: "A PR",
    url: "https://github.com/o/r/pull/1",
    isDraft: false,
    mergeable: "MERGEABLE",
    createdAt: iso(0),
    updatedAt: iso(0),
    author: "someone",
    reviewRequestedForMe: false,
    lastActivity: { author: "someone", at: iso(0), isBot: false, kind: "opened" },
    ageMs: 0,
    score: 0,
    focusReasons: [],
    ...overrides,
  };
}

describe("scorePr", () => {
  it("gives a fresh, active PR no urgency", () => {
    const { score, reasons } = scorePr(makePr(), NOW);
    expect(score).toBe(0);
    expect(reasons).toEqual([]);
  });

  it("adds points for age and staleness", () => {
    const { score, reasons } = scorePr(
      makePr({ createdAt: iso(8 * DAY), lastActivity: { author: "x", at: iso(8 * DAY), isBot: false, kind: "comment" } }),
      NOW,
    );
    expect(score).toBe(40 + 10); // >1 week bucket + stale
    expect(reasons).toContain("open > 1 week");
    expect(reasons).toContain("no activity in 2+ days");
  });

  it("adds points when the user's review is requested", () => {
    const { score, reasons } = scorePr(
      makePr({ createdAt: iso(2 * DAY), reviewRequestedForMe: true }),
      NOW,
    );
    expect(score).toBe(10 + 15); // >1 day bucket + review requested
    expect(reasons).toContain("your review requested");
  });

  it("adds points and a reason for a conflicting PR", () => {
    const { score, reasons } = scorePr(makePr({ mergeable: "CONFLICTING" }), NOW);
    expect(score).toBe(12);
    expect(reasons).toContain("has merge conflicts");
  });

  it("sinks drafts to the bottom with a fixed low score", () => {
    const { score, reasons } = scorePr(makePr({ isDraft: true, createdAt: iso(30 * DAY) }), NOW);
    expect(score).toBe(RULES.pr.draftScore);
    expect(reasons).toEqual(["draft"]);
  });
});

describe("scoreAction", () => {
  it("scores a freshly broken main at the base weight", () => {
    expect(scoreAction({ failingSince: iso(0) }, NOW)).toBe(50);
  });

  it("adds a per-day penalty, capped", () => {
    expect(scoreAction({ failingSince: iso(3 * DAY) }, NOW)).toBe(50 + 30);
    expect(scoreAction({ failingSince: iso(30 * DAY) }, NOW)).toBe(50 + 40); // capped
  });
});

describe("buildFocus", () => {
  const actions: ActionFailure[] = [
    { repo: "o/a", repoUrl: "", defaultBranch: "main", workflowName: "CI", runUrl: null, failingSince: iso(DAY), failingForMs: DAY, score: 60 },
    { repo: "o/b", repoUrl: "", defaultBranch: "main", workflowName: "CI", runUrl: null, failingSince: iso(DAY), failingForMs: DAY, score: 60 },
  ];
  const prs: PullRequestItem[] = [
    makePr({ url: "p1", createdAt: iso(1 * DAY), reviewRequestedForMe: true }),
    makePr({ url: "p2", createdAt: iso(5 * DAY), lastActivity: { author: "x", at: iso(5 * DAY), isBot: false, kind: "comment" } }),
    makePr({ url: "p3", createdAt: iso(4 * DAY) }),
    makePr({ url: "p4", isDraft: true, createdAt: iso(10 * DAY), lastActivity: { author: "x", at: iso(10 * DAY), isBot: false, kind: "opened" } }),
  ];

  const focus = buildFocus(prs, actions, { reposWithOpenPrs: 3 }, NOW);

  it("puts broken main branches first", () => {
    expect(focus[0].kind).toBe("actions-broken");
    expect(focus[0].label).toBe("2 repos with failing main");
  });

  it("summarizes review, old, stale, and overview lines", () => {
    const byKind = Object.fromEntries(focus.map((f) => [f.kind, f.label]));
    expect(byKind["pr-review"]).toBe("1 PR needs your review");
    expect(byKind["pr-old"]).toBe("2 PRs open > 3 days"); // draft excluded
    expect(byKind["pr-stale"]).toBe("1 PR with no activity in 2+ days");
    expect(byKind["overview"]).toBe("3 repos with open PRs (4 total)");
  });

  it("orders every line by descending severity", () => {
    const severities = focus.map((f) => f.severity);
    expect([...severities].sort((a, b) => b - a)).toEqual(severities);
    expect(focus.at(-1)?.kind).toBe("overview");
  });

  it("surfaces a merge-conflict line", () => {
    const withConflict = buildFocus(
      [makePr({ url: "c1", mergeable: "CONFLICTING", createdAt: iso(1 * DAY) })],
      [],
      { reposWithOpenPrs: 1 },
      NOW,
    );
    expect(withConflict.find((f) => f.kind === "pr-conflict")?.label).toBe("1 PR with merge conflicts");
  });
});

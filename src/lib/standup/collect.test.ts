import { describe, expect, it } from "vitest";
import { assembleFacts } from "./collect";
import type { GithubData } from "@/lib/github/types";

const NOW = new Date(2026, 6, 27, 9, 0, 0).getTime();
const DAY = 86_400_000;

const contrib = {
  viewer: "me",
  mergedPrs: [{ repo: "o/web", number: 158, title: "RBAC", url: "u" }],
  openedPrs: [], reviewedPrs: [], openedIssues: [], closedIssues: [],
  commitsByRepo: [{ repo: "o/web", count: 9 }],
};

const github = {
  prs: [
    { repo: "o/web", number: 158, title: "RBAC", url: "u", author: "me", createdAt: new Date(NOW - 3 * DAY).toISOString(),
      isDraft: false, reviewRequestedForMe: false, mergeable: "MERGEABLE", updatedAt: "", ageMs: 0, score: 0, focusReasons: [],
      headRef: "f", baseRef: "main", lastActivity: { author: "me", at: null, isBot: false, kind: "opened" } },
    { repo: "o/api", number: 9, title: "fix", url: "u2", author: "them", createdAt: "", isDraft: false, reviewRequestedForMe: true,
      mergeable: "MERGEABLE", updatedAt: "", ageMs: 0, score: 0, focusReasons: [], headRef: "f", baseRef: "main",
      lastActivity: { author: "x", at: null, isBot: false, kind: "opened" } },
  ],
  notifications: [{ reason: "review_requested" }, { reason: "mention" }],
  actions: [{ repo: "o/job" }],
} as unknown as GithubData;

describe("assembleFacts", () => {
  it("carries merged PRs, dashboard counts, and my in-progress PRs with day counts", () => {
    const f = assembleFacts(contrib, github, [], NOW, "me");
    expect(f.mergedPrs).toHaveLength(1);
    expect(f.needsReview).toBe(1);
    expect(f.waitingOnYou).toBe(2);
    expect(f.failingMain).toEqual(["o/job"]);
    // only my own non-draft open PRs are "in progress"
    expect(f.inProgress.map((p) => p.number)).toEqual([158]);
    expect(f.inProgress[0].dayCount).toBe(3);
  });

  it("works with no github data (AI/GitHub unavailable)", () => {
    const f = assembleFacts(contrib, null, [], NOW, "me");
    expect(f.needsReview).toBe(0);
    expect(f.inProgress).toEqual([]);
    expect(f.mergedPrs).toHaveLength(1);
  });
});

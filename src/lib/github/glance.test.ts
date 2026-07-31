import { describe, expect, it } from "vitest";
import { computeGlanceCounts } from "./glance";
import type { GithubData, PullRequestItem, NotificationItem } from "./types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-30T09:00:00Z");

function pr(over: Partial<PullRequestItem>): PullRequestItem {
  return {
    repo: "acme/api", number: 1, title: "t", url: "u", isDraft: false,
    createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
    author: "you", mergeable: "MERGEABLE", headRef: "h", baseRef: "main",
    reviewRequestedForMe: false,
    lastActivity: { author: "you", at: new Date(NOW).toISOString(), isBot: false, kind: "commit" },
    ageMs: 0, score: 0, focusReasons: [], ...over,
  };
}
function notif(over: Partial<NotificationItem>): NotificationItem {
  return {
    id: "1", repo: "acme/api", repoUrl: "u", reason: "mention", reasonLabel: "mention",
    tier: "act", subjectType: "PullRequest", title: "t", url: "u", unread: true,
    updatedAt: new Date(NOW).toISOString(), ageMs: 0, score: 0, ...over,
  };
}
function data(over: Partial<GithubData>): GithubData {
  return {
    generatedAt: new Date(NOW).toISOString(), cached: false, viewer: "you", rateLimit: null,
    repoCount: 1, reposWithOpenPrs: 1, prs: [], actions: [], notifications: [],
    notificationsTruncated: false, focus: [], errors: [], ...over,
  };
}

describe("computeGlanceCounts", () => {
  it("counts review, conflicts, aging, stale, open PRs, ignoring drafts where the app does", () => {
    const prs = [
      pr({ reviewRequestedForMe: true }),
      pr({ mergeable: "CONFLICTING" }),
      pr({ createdAt: new Date(NOW - 4 * DAY).toISOString() }), // aging 3d+
      pr({ lastActivity: { author: "you", at: new Date(NOW - 3 * DAY).toISOString(), isBot: false, kind: "commit" } }), // stale 2d+
      pr({ isDraft: true, reviewRequestedForMe: true }), // draft: excluded from review/aging/stale
    ];
    const c = computeGlanceCounts(data({ prs }), NOW);
    expect(c.review).toBe(1);
    expect(c.conflicts).toBe(1);
    expect(c.aging).toBe(1);
    expect(c.stale).toBe(1);
    expect(c.openPrs).toBe(5);
  });

  it("counts waiting notifications (act + involved tiers) and failing actions", () => {
    const c = computeGlanceCounts(
      data({
        notifications: [notif({ tier: "act" }), notif({ id: "2", tier: "involved" }), notif({ id: "3", tier: "fyi" })],
        actions: [{ repo: "acme/api", repoUrl: "u", defaultBranch: "main", workflowName: null, runUrl: null, failingSince: null, failingForMs: null, score: 0 }],
      }),
      NOW,
    );
    expect(c.waiting).toBe(2);
    expect(c.failing).toBe(1);
  });
});

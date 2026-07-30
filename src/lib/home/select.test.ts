import { describe, expect, it } from "vitest";
import { selectNeedsYou, selectOpenWork } from "./select";
import type { GithubData, PullRequestItem } from "@/lib/github/types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-30T09:00:00Z");

function pr(over: Partial<PullRequestItem>): PullRequestItem {
  return {
    repo: "acme/api", number: 7, title: "PR title", url: "https://gh/pr/7", isDraft: false,
    createdAt: new Date(NOW - 2 * DAY).toISOString(), updatedAt: new Date(NOW).toISOString(),
    author: "you", mergeable: "MERGEABLE", headRef: "h", baseRef: "main",
    reviewRequestedForMe: false,
    lastActivity: { author: "you", at: new Date(NOW).toISOString(), isBot: false, kind: "commit" },
    ageMs: 0, score: 0, focusReasons: [], ...over,
  };
}
function data(over: Partial<GithubData>): GithubData {
  return {
    generatedAt: new Date(NOW).toISOString(), cached: false, viewer: "you", rateLimit: null,
    repoCount: 1, reposWithOpenPrs: 1, prs: [], actions: [], notifications: [],
    notificationsTruncated: false, focus: [], errors: [], ...over,
  };
}

describe("selectNeedsYou", () => {
  it("orders failing → waiting → review → conflict and fills each item's fields", () => {
    const items = selectNeedsYou(
      data({
        actions: [{ repo: "acme/api", repoUrl: "https://gh/api", defaultBranch: "main", workflowName: "CI", runUrl: "https://gh/run", failingSince: new Date(NOW - DAY).toISOString(), failingForMs: DAY, score: 0 }],
        notifications: [{ id: "1", repo: "acme/web", repoUrl: "u", reason: "mention", reasonLabel: "mention", tier: "act", subjectType: "PullRequest", title: "weigh in?", url: "https://gh/n1", unread: true, updatedAt: new Date(NOW).toISOString(), ageMs: 0, score: 0 }],
        prs: [pr({ reviewRequestedForMe: true, number: 10, url: "https://gh/pr/10" }), pr({ mergeable: "CONFLICTING", number: 11, url: "https://gh/pr/11" })],
      }),
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual(["failing", "waiting", "review", "conflict"]);
    expect(items[0].url).toBe("https://gh/run");
    expect(items[2].why.toLowerCase()).toContain("review");
  });

  it("excludes drafts from review/conflict and returns empty when nothing needs you", () => {
    expect(selectNeedsYou(data({ prs: [pr({ isDraft: true, reviewRequestedForMe: true })] }), NOW)).toEqual([]);
  });
});

describe("selectOpenWork", () => {
  it("returns the viewer's non-draft open PRs with day counts", () => {
    const items = selectOpenWork(
      data({ viewer: "you", prs: [pr({ author: "you", createdAt: new Date(NOW - 3 * DAY).toISOString() }), pr({ author: "someone", number: 99 }), pr({ author: "you", isDraft: true })] }),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].dayCount).toBe(3);
  });
});

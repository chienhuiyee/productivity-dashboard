import { describe, expect, it } from "vitest";
import { parseContributions, type RawContributions } from "./contributions";

const raw: RawContributions = {
  viewer: {
    login: "me",
    contributionsCollection: {
      pullRequestContributions: {
        nodes: [
          { pullRequest: { number: 76, title: "commission scope", url: "u/76", repository: { nameWithOwner: "o/core" } } },
        ],
      },
      pullRequestReviewContributions: {
        nodes: [
          { pullRequest: { number: 88, title: "board fix", url: "u/88", repository: { nameWithOwner: "o/wms" } } },
        ],
      },
      issueContributions: {
        nodes: [{ issue: { number: 5, title: "bug", url: "u/i5", repository: { nameWithOwner: "o/core" } } }],
      },
      commitContributionsByRepository: [
        { repository: { nameWithOwner: "o/web" }, contributions: { totalCount: 9 } },
        { repository: { nameWithOwner: "o/core" }, contributions: { totalCount: 2 } },
      ],
    },
  },
  merged: {
    nodes: [{ number: 158, title: "RBAC", url: "u/158", repository: { nameWithOwner: "o/web" } }],
  },
  closed: {
    nodes: [{ number: 152, title: "old bug", url: "u/i152", repository: { nameWithOwner: "o/web" } }],
  },
};

describe("parseContributions", () => {
  it("splits opened/merged/reviewed and sums commits", () => {
    const c = parseContributions(raw);
    expect(c.viewer).toBe("me");
    expect(c.mergedPrs.map((p) => p.number)).toEqual([158]);
    expect(c.openedPrs.map((p) => p.number)).toEqual([76]);
    expect(c.reviewedPrs.map((p) => p.number)).toEqual([88]);
    expect(c.openedIssues.map((p) => p.number)).toEqual([5]);
    expect(c.closedIssues.map((p) => p.number)).toEqual([152]);
    expect(c.commitsByRepo).toEqual([
      { repo: "o/web", count: 9 },
      { repo: "o/core", count: 2 },
    ]);
  });

  it("tolerates null/empty node lists", () => {
    const c = parseContributions({ viewer: { login: null, contributionsCollection: {} }, merged: null, closed: null } as unknown as RawContributions);
    expect(c.mergedPrs).toEqual([]);
    expect(c.commitsByRepo).toEqual([]);
  });
});

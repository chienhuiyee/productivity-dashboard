import { describe, expect, it } from "vitest";
import { authorFacets, filterByAuthor } from "./authorFilter";
import type { PullRequestItem } from "@/lib/github/types";

function pr(author: string | null, number = 1): PullRequestItem {
  return {
    repo: "acme/api",
    number,
    title: "t",
    url: `u${number}`,
    isDraft: false,
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
    author,
    mergeable: "MERGEABLE",
    headRef: "h",
    baseRef: "main",
    reviewRequestedForMe: false,
    lastActivity: { author, at: null, isBot: false, kind: "commit" },
    ageMs: 0,
    score: 0,
    focusReasons: [],
  };
}

describe("authorFacets", () => {
  it("counts PRs per author and sorts by count desc, then name asc", () => {
    const facets = authorFacets([pr("dan", 1), pr("dan", 2), pr("amy", 3), pr("bob", 4), pr("amy", 5)]);
    expect(facets).toEqual([
      { author: "amy", count: 2 },
      { author: "dan", count: 2 },
      { author: "bob", count: 1 },
    ]);
  });

  it("ignores PRs with no author", () => {
    expect(authorFacets([pr(null, 1), pr("amy", 2)])).toEqual([{ author: "amy", count: 1 }]);
  });

  it("returns an empty list when there are no PRs", () => {
    expect(authorFacets([])).toEqual([]);
  });
});

describe("filterByAuthor", () => {
  it("returns the original list unchanged when no author is selected", () => {
    const list = [pr("amy", 1), pr("bob", 2)];
    expect(filterByAuthor(list, null)).toBe(list);
  });

  it("keeps only the selected author's PRs (across repos)", () => {
    const list = [pr("amy", 1), pr("bob", 2), pr("amy", 3)];
    expect(filterByAuthor(list, "amy").map((p) => p.number)).toEqual([1, 3]);
  });
});

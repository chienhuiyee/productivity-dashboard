import { describe, expect, it } from "vitest";
import { parseRepo, runChunk } from "./fetchRepos";
import type { GithubGraphql } from "./client";
import type { RawPr, RawRepo } from "./queries";

const NOW = Date.parse("2026-01-15T00:00:00.000Z");

function makeRepo(overrides: Partial<RawRepo> = {}): RawRepo {
  return {
    nameWithOwner: "o/r",
    url: "https://github.com/o/r",
    isArchived: false,
    defaultBranchRef: null,
    pullRequests: { totalCount: 0, nodes: [] },
    ...overrides,
  };
}

function makePr(overrides: Partial<RawPr> = {}): RawPr {
  return {
    number: 1,
    title: "A PR",
    url: "https://github.com/o/r/pull/1",
    isDraft: false,
    mergeable: "MERGEABLE",
    createdAt: "2026-01-14T00:00:00.000Z",
    updatedAt: "2026-01-14T00:00:00.000Z",
    author: { login: "human" },
    reviewRequests: { nodes: [] },
    timelineItems: { nodes: [] },
    ...overrides,
  };
}

describe("parseRepo", () => {
  it("returns no action when there is no default branch", () => {
    const parsed = parseRepo(makeRepo({ defaultBranchRef: null }), "me", NOW);
    expect(parsed.action).toBeNull();
    expect(parsed.prs).toHaveLength(0);
  });

  it("detects a failing github-actions run on the default branch", () => {
    const raw = makeRepo({
      defaultBranchRef: {
        name: "main",
        target: {
          __typename: "Commit",
          oid: "abc",
          committedDate: "2026-01-10T00:00:00.000Z",
          statusCheckRollup: { state: "FAILURE" },
          checkSuites: {
            nodes: [
              {
                app: { slug: "github-actions" },
                status: "COMPLETED",
                conclusion: "FAILURE",
                updatedAt: "2026-01-13T00:00:00.000Z",
                workflowRun: {
                  url: "https://github.com/o/r/actions/runs/1",
                  createdAt: "2026-01-13T00:00:00.000Z",
                  updatedAt: "2026-01-13T00:00:00.000Z",
                  workflow: { name: "CI" },
                },
              },
            ],
          },
        },
      },
    });
    const parsed = parseRepo(raw, "me", NOW);
    expect(parsed.action).not.toBeNull();
    expect(parsed.action?.workflowName).toBe("CI");
    expect(parsed.action?.failingSince).toBe("2026-01-13T00:00:00.000Z");
    expect(parsed.action?.runUrl).toBe("https://github.com/o/r/actions/runs/1");
    expect(parsed.action?.failingForMs).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it("ignores a green default branch", () => {
    const raw = makeRepo({
      defaultBranchRef: {
        name: "main",
        target: {
          __typename: "Commit",
          statusCheckRollup: { state: "SUCCESS" },
          checkSuites: { nodes: [] },
        },
      },
    });
    expect(parseRepo(raw, "me", NOW).action).toBeNull();
  });

  it("flags bot-authored last activity", () => {
    const raw = makeRepo({
      pullRequests: {
        totalCount: 1,
        nodes: [
          makePr({
            timelineItems: {
              nodes: [{ __typename: "IssueComment", createdAt: "2026-01-14T12:00:00.000Z", author: { login: "dependabot[bot]" } }],
            },
          }),
        ],
      },
    });
    const { prs } = parseRepo(raw, "me", NOW);
    expect(prs[0].lastActivity.kind).toBe("comment");
    expect(prs[0].lastActivity.author).toBe("dependabot[bot]");
    expect(prs[0].lastActivity.isBot).toBe(true);
  });

  it("normalizes mergeable state, defaulting unknown values", () => {
    const raw = (m: string | null) =>
      makeRepo({ pullRequests: { totalCount: 1, nodes: [makePr({ mergeable: m })] } });
    expect(parseRepo(raw("CONFLICTING"), "me", NOW).prs[0].mergeable).toBe("CONFLICTING");
    expect(parseRepo(raw("MERGEABLE"), "me", NOW).prs[0].mergeable).toBe("MERGEABLE");
    expect(parseRepo(raw(null), "me", NOW).prs[0].mergeable).toBe("UNKNOWN");
  });

  it("marks a PR as needing my review only when the viewer matches", () => {
    const raw = makeRepo({
      pullRequests: {
        totalCount: 1,
        nodes: [
          makePr({
            reviewRequests: { nodes: [{ requestedReviewer: { __typename: "User", login: "me" } }] },
          }),
        ],
      },
    });
    expect(parseRepo(raw, "me", NOW).prs[0].reviewRequestedForMe).toBe(true);
    expect(parseRepo(raw, "someone-else", NOW).prs[0].reviewRequestedForMe).toBe(false);
  });
});

describe("runChunk", () => {
  it("isolates a failed repo alias without dropping the good ones", async () => {
    const good = makeRepo({ nameWithOwner: "o/good", pullRequests: { totalCount: 2, nodes: [makePr()] } });

    // Mimics @octokit/graphql throwing on a partial response (one repo not found).
    const fakeClient = (async () => {
      throw Object.assign(new Error("GraphQL error"), {
        data: {
          viewer: { login: "me" },
          r0: good,
          r1: null,
          rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-01-15T01:00:00.000Z" },
        },
        errors: [{ path: ["r1"], message: "Could not resolve to a Repository with the name 'o/bad'." }],
      });
    }) as unknown as GithubGraphql;

    const result = await runChunk(
      fakeClient,
      [
        { owner: "o", name: "good" },
        { owner: "o", name: "bad" },
      ],
      NOW,
    );

    expect(result.viewer).toBe("me");
    expect(result.reposWithOpenPrs).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].repo).toBe("o/bad");
    expect(result.errors[0].message).toContain("Could not resolve");
    expect(result.rateLimit?.remaining).toBe(4999);
  });
});

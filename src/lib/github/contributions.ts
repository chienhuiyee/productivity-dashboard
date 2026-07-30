import { githubClient } from "./client";
import type { Ref } from "@/lib/standup/types";

export const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query($from: DateTime!, $to: DateTime!, $mergedQ: String!, $closedQ: String!) {
    viewer {
      login
      contributionsCollection(from: $from, to: $to) {
        pullRequestContributions(first: 100) {
          nodes { pullRequest { number title url repository { nameWithOwner } } }
        }
        pullRequestReviewContributions(first: 100) {
          nodes { pullRequest { number title url repository { nameWithOwner } } }
        }
        issueContributions(first: 100) {
          nodes { issue { number title url repository { nameWithOwner } } }
        }
        commitContributionsByRepository(maxRepositories: 50) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
      }
    }
    merged: search(query: $mergedQ, type: ISSUE, first: 50) {
      nodes { ... on PullRequest { number title url repository { nameWithOwner } } }
    }
    closed: search(query: $closedQ, type: ISSUE, first: 50) {
      nodes { ... on Issue { number title url repository { nameWithOwner } } }
    }
  }
`;

interface RawRef { number: number; title: string; url: string; repository: { nameWithOwner: string } | null }
export interface RawContributions {
  viewer: {
    login: string | null;
    contributionsCollection: {
      pullRequestContributions?: { nodes: ({ pullRequest: RawRef } | null)[] | null } | null;
      pullRequestReviewContributions?: { nodes: ({ pullRequest: RawRef } | null)[] | null } | null;
      issueContributions?: { nodes: ({ issue: RawRef } | null)[] | null } | null;
      commitContributionsByRepository?: ({ repository: { nameWithOwner: string }; contributions: { totalCount: number } } | null)[] | null;
    };
  };
  merged: { nodes: (RawRef | null)[] | null } | null;
  closed: { nodes: (RawRef | null)[] | null } | null;
}

function toRef(r: RawRef | null | undefined): Ref | null {
  if (!r || !r.repository) return null;
  return { repo: r.repository.nameWithOwner, number: r.number, title: r.title, url: r.url };
}

export function parseContributions(data: RawContributions) {
  const cc = data.viewer?.contributionsCollection ?? {};
  const prNodes = (cc.pullRequestContributions?.nodes ?? []).map((n) => toRef(n?.pullRequest)).filter(Boolean) as Ref[];
  const reviewNodes = (cc.pullRequestReviewContributions?.nodes ?? []).map((n) => toRef(n?.pullRequest)).filter(Boolean) as Ref[];
  const issueNodes = (cc.issueContributions?.nodes ?? []).map((n) => toRef(n?.issue)).filter(Boolean) as Ref[];
  const commitsByRepo = (cc.commitContributionsByRepository ?? [])
    .filter(Boolean)
    .map((n) => ({ repo: n!.repository.nameWithOwner, count: n!.contributions.totalCount }));

  return {
    viewer: data.viewer?.login ?? null,
    mergedPrs: (data.merged?.nodes ?? []).map(toRef).filter(Boolean) as Ref[],
    openedPrs: prNodes,
    reviewedPrs: reviewNodes,
    openedIssues: issueNodes,
    closedIssues: (data.closed?.nodes ?? []).map(toRef).filter(Boolean) as Ref[],
    commitsByRepo,
  };
}

/** Runs the contributions query for a window. Throws on failure (caller flags it). */
export async function fetchContributions(token: string, fromISO: string, toISO: string) {
  const day = fromISO.slice(0, 10);
  const data = (await githubClient(token)(CONTRIBUTIONS_QUERY, {
    from: fromISO,
    to: toISO,
    mergedQ: `author:@me is:pr is:merged merged:>=${day}`,
    closedQ: `author:@me is:issue is:closed closed:>=${day}`,
  })) as RawContributions;
  return parseContributions(data);
}

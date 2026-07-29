import type { RepoRef } from "@/lib/config/schema";

/**
 * Per-repo fragment: open PRs (with review requests + last activity) and the
 * default branch's CI status. Batched across many repos via aliases in
 * `buildBatchQuery` so ~10 repos resolve in one request.
 */
export const REPO_DATA_FRAGMENT = /* GraphQL */ `
  fragment RepoData on Repository {
    nameWithOwner
    url
    isArchived
    defaultBranchRef {
      name
      target {
        __typename
        ... on Commit {
          oid
          committedDate
          statusCheckRollup {
            state
          }
          checkSuites(first: 20) {
            nodes {
              app {
                slug
              }
              status
              conclusion
              updatedAt
              workflowRun {
                url
                createdAt
                updatedAt
                workflow {
                  name
                }
              }
            }
          }
        }
      }
    }
    pullRequests(states: OPEN, first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      nodes {
        number
        title
        url
        isDraft
        mergeable
        headRefName
        baseRefName
        createdAt
        updatedAt
        author {
          login
        }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              __typename
              ... on User {
                login
              }
            }
          }
        }
        timelineItems(
          last: 1
          itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_COMMIT, READY_FOR_REVIEW_EVENT, REOPENED_EVENT]
        ) {
          nodes {
            __typename
            ... on IssueComment {
              createdAt
              author {
                login
              }
            }
            ... on PullRequestReview {
              createdAt
              author {
                login
              }
            }
            ... on PullRequestCommit {
              commit {
                committedDate
                author {
                  user {
                    login
                  }
                  name
                }
              }
            }
            ... on ReadyForReviewEvent {
              createdAt
              actor {
                login
              }
            }
            ... on ReopenedEvent {
              createdAt
              actor {
                login
              }
            }
          }
        }
      }
    }
  }
`;

/** Alias for the i-th repo in a batch, e.g. "r0". */
export function repoAlias(index: number): string {
  return `r${index}`;
}

/**
 * Build a single query that fetches every repo in the chunk under aliases r0..rN,
 * plus the viewer login and rate-limit info. Owner/name are strictly validated
 * upstream and JSON-encoded here, so interpolation is safe.
 */
export function buildBatchQuery(repos: RepoRef[]): string {
  const fields = repos
    .map(
      (r, i) =>
        `${repoAlias(i)}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) { ...RepoData }`,
    )
    .join("\n    ");

  return /* GraphQL */ `
    query {
      viewer { login }
      ${fields}
      rateLimit { cost remaining resetAt }
    }
    ${REPO_DATA_FRAGMENT}
  `;
}

// ---- Raw response shapes (only the fields we read) ----

export interface RawRateLimit {
  cost: number;
  remaining: number;
  resetAt: string;
}

export interface RawCheckSuite {
  app: { slug: string | null } | null;
  status: string | null;
  conclusion: string | null;
  updatedAt: string | null;
  workflowRun: {
    url: string;
    createdAt: string;
    updatedAt: string;
    workflow: { name: string | null } | null;
  } | null;
}

export interface RawCommitTarget {
  __typename: string;
  oid?: string;
  committedDate?: string;
  statusCheckRollup?: { state: string | null } | null;
  checkSuites?: { nodes: (RawCheckSuite | null)[] | null } | null;
}

export interface RawTimelineNode {
  __typename: string;
  createdAt?: string;
  author?: { login: string } | null;
  actor?: { login: string } | null;
  commit?: {
    committedDate?: string;
    author?: { user?: { login: string } | null; name?: string | null } | null;
  } | null;
}

export interface RawReviewRequestNode {
  requestedReviewer: { __typename: string; login?: string } | null;
}

export interface RawPr {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  mergeable: string | null;
  headRefName: string;
  baseRefName: string;
  createdAt: string;
  updatedAt: string;
  author: { login: string } | null;
  reviewRequests: { nodes: (RawReviewRequestNode | null)[] | null } | null;
  timelineItems: { nodes: (RawTimelineNode | null)[] | null } | null;
}

export interface RawRepo {
  nameWithOwner: string;
  url: string;
  isArchived: boolean;
  defaultBranchRef: { name: string; target: RawCommitTarget | null } | null;
  pullRequests: { totalCount: number; nodes: (RawPr | null)[] | null } | null;
}

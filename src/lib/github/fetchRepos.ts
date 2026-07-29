import { githubClient, type GithubGraphql } from "./client";
import {
  buildBatchQuery,
  repoAlias,
  type RawCheckSuite,
  type RawPr,
  type RawRateLimit,
  type RawRepo,
  type RawTimelineNode,
} from "./queries";
import type {
  ActionFailure,
  PrLastActivity,
  PullRequestItem,
  RateLimitInfo,
  RepoError,
} from "./types";
import { repoKey, type RepoRef } from "@/lib/config/schema";

const CHUNK_SIZE = 10;

/** GitHub Actions check-suite conclusions we treat as "main is broken". */
const FAILING_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"]);

export interface FetchResult {
  viewer: string | null;
  rateLimit: RateLimitInfo | null;
  prs: PullRequestItem[];
  actions: ActionFailure[];
  reposWithOpenPrs: number;
  errors: RepoError[];
}

// ---- Pure parsing (exported for unit tests) ----

function isBotLogin(login: string | null | undefined): boolean {
  return !!login && /\[bot\]$/i.test(login);
}

function parseLastActivity(pr: RawPr): PrLastActivity {
  const nodes = (pr.timelineItems?.nodes ?? []).filter(Boolean) as RawTimelineNode[];
  const node = nodes[nodes.length - 1];

  const opened: PrLastActivity = {
    author: pr.author?.login ?? null,
    at: pr.createdAt,
    isBot: isBotLogin(pr.author?.login),
    kind: "opened",
  };
  if (!node) return opened;

  const act = (author: string | null | undefined, at: string | null | undefined, kind: string): PrLastActivity => ({
    author: author ?? null,
    at: at ?? null,
    isBot: isBotLogin(author),
    kind,
  });

  switch (node.__typename) {
    case "IssueComment":
      return act(node.author?.login, node.createdAt, "comment");
    case "PullRequestReview":
      return act(node.author?.login, node.createdAt, "review");
    case "PullRequestCommit": {
      const login = node.commit?.author?.user?.login ?? node.commit?.author?.name ?? null;
      return act(login, node.commit?.committedDate, "commit");
    }
    case "ReadyForReviewEvent":
      return act(node.actor?.login, node.createdAt, "ready");
    case "ReopenedEvent":
      return act(node.actor?.login, node.createdAt, "reopened");
    default:
      return opened;
  }
}

function parsePr(pr: RawPr, repo: string, viewerLogin: string | null, now: number): PullRequestItem {
  const reviewRequestedForMe =
    !!viewerLogin &&
    (pr.reviewRequests?.nodes ?? []).some(
      (n) => n?.requestedReviewer?.__typename === "User" && n.requestedReviewer.login === viewerLogin,
    );

  const createdMs = Date.parse(pr.createdAt);
  const mergeable =
    pr.mergeable === "CONFLICTING" ? "CONFLICTING" : pr.mergeable === "MERGEABLE" ? "MERGEABLE" : "UNKNOWN";

  return {
    repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    mergeable,
    headRef: pr.headRefName,
    baseRef: pr.baseRefName,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    author: pr.author?.login ?? null,
    reviewRequestedForMe,
    lastActivity: parseLastActivity(pr),
    ageMs: Number.isNaN(createdMs) ? 0 : Math.max(0, now - createdMs),
    score: 0,
    focusReasons: [],
  };
}

/** Determine whether the default branch is failing and, if so, since when. */
function parseAction(raw: RawRepo, now: number): ActionFailure | null {
  const ref = raw.defaultBranchRef;
  const target = ref?.target;
  if (!ref || !target || target.__typename !== "Commit") return null;

  const suites = (target.checkSuites?.nodes ?? []).filter(Boolean) as RawCheckSuite[];
  const actionsFailures = suites.filter(
    (s) => s.app?.slug === "github-actions" && s.conclusion !== null && FAILING_CONCLUSIONS.has(s.conclusion),
  );

  let workflowName: string | null = null;
  let runUrl: string | null = null;
  let failingSince: string | null = null;
  let broken = actionsFailures.length > 0;

  if (broken) {
    const withRun = actionsFailures
      .filter((s) => s.workflowRun)
      .sort((a, b) => Date.parse(b.workflowRun!.updatedAt) - Date.parse(a.workflowRun!.updatedAt));
    const top = withRun[0];
    if (top?.workflowRun) {
      workflowName = top.workflowRun.workflow?.name ?? null;
      runUrl = top.workflowRun.url;
      failingSince = top.workflowRun.updatedAt;
    } else {
      failingSince = actionsFailures[0]?.updatedAt ?? target.committedDate ?? null;
    }
  } else {
    // Fall back to the aggregate rollup so external/commit-status CI failures still surface.
    const state = target.statusCheckRollup?.state;
    if (state === "FAILURE" || state === "ERROR") {
      broken = true;
      failingSince = target.committedDate ?? null;
    }
  }

  if (!broken) return null;

  const sinceMs = failingSince ? Date.parse(failingSince) : NaN;
  return {
    repo: raw.nameWithOwner,
    repoUrl: raw.url,
    defaultBranch: ref.name,
    workflowName,
    runUrl,
    failingSince,
    failingForMs: Number.isNaN(sinceMs) ? null : Math.max(0, now - sinceMs),
    score: 0,
  };
}

/** Parse one repository's raw data into normalized (unscored) items. */
export function parseRepo(
  raw: RawRepo,
  viewerLogin: string | null,
  now: number,
): { openPrCount: number; prs: PullRequestItem[]; action: ActionFailure | null } {
  const prNodes = (raw.pullRequests?.nodes ?? []).filter(Boolean) as RawPr[];
  const openPrCount = raw.pullRequests?.totalCount ?? prNodes.length;
  return {
    openPrCount,
    prs: prNodes.map((pr) => parsePr(pr, raw.nameWithOwner, viewerLogin, now)),
    action: parseAction(raw, now),
  };
}

// ---- Chunk execution + defensive merge ----

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}

/** Find a GraphQL error whose path points at a given alias (e.g. "r3"). */
function aliasError(errors: unknown[], alias: string): string | undefined {
  for (const e of errors) {
    const path = (e as { path?: unknown[] })?.path;
    if (Array.isArray(path) && path[0] === alias) return (e as { message?: string }).message;
  }
  return undefined;
}

interface ChunkResult {
  viewer: string | null;
  rateLimit: RateLimitInfo | null;
  prs: PullRequestItem[];
  actions: ActionFailure[];
  reposWithOpenPrs: number;
  errors: RepoError[];
}

/** Exported for tests. Executes one aliased batch and defensively parses each repo. */
export async function runChunk(client: GithubGraphql, repos: RepoRef[], now: number): Promise<ChunkResult> {
  const query = buildBatchQuery(repos);

  let data: Record<string, unknown> | null = null;
  let topLevelErrors: unknown[] = [];

  try {
    data = (await client(query)) as Record<string, unknown>;
  } catch (err) {
    // @octokit/graphql throws GraphqlResponseError on partial failures, but still
    // carries the partial `data` and the `errors` array. Salvage what we can.
    const e = err as { data?: unknown; errors?: unknown[] };
    if (e && typeof e === "object" && e.data) {
      data = e.data as Record<string, unknown>;
      topLevelErrors = Array.isArray(e.errors) ? e.errors : [];
    } else {
      throw err; // network/auth/total failure -> allSettled marks the whole chunk rejected
    }
  }

  const viewer = (data?.viewer as { login: string } | null)?.login ?? null;
  const rl = data?.rateLimit as RawRateLimit | null | undefined;
  const rateLimit: RateLimitInfo | null = rl
    ? { cost: rl.cost, remaining: rl.remaining, resetAt: rl.resetAt }
    : null;

  const prs: PullRequestItem[] = [];
  const actions: ActionFailure[] = [];
  const errors: RepoError[] = [];
  let reposWithOpenPrs = 0;

  repos.forEach((repo, i) => {
    const raw = data?.[repoAlias(i)] as RawRepo | null | undefined;
    if (!raw) {
      errors.push({
        repo: repoKey(repo),
        message: aliasError(topLevelErrors, repoAlias(i)) ?? "not found or no access",
      });
      return;
    }
    try {
      const parsed = parseRepo(raw, viewer, now);
      if (parsed.openPrCount > 0) reposWithOpenPrs++;
      prs.push(...parsed.prs);
      if (parsed.action) actions.push(parsed.action);
    } catch (e) {
      errors.push({ repo: repoKey(repo), message: errMessage(e) });
    }
  });

  return { viewer, rateLimit, prs, actions, reposWithOpenPrs, errors };
}

function mergeRateLimit(a: RateLimitInfo | null, b: RateLimitInfo | null): RateLimitInfo | null {
  if (!a) return b;
  if (!b) return a;
  return {
    cost: a.cost + b.cost,
    remaining: Math.min(a.remaining, b.remaining),
    resetAt: a.resetAt > b.resetAt ? a.resetAt : b.resetAt,
  };
}

/**
 * Fetch every monitored repo in parallel chunks. One failed repo (or one failed
 * chunk) never sinks the whole request — it becomes an entry in `errors`.
 */
export async function fetchGithubData(token: string, repos: RepoRef[], now: number): Promise<FetchResult> {
  if (repos.length === 0) {
    return { viewer: null, rateLimit: null, prs: [], actions: [], reposWithOpenPrs: 0, errors: [] };
  }

  const client = githubClient(token);
  const chunks = chunk(repos, CHUNK_SIZE);
  const settled = await Promise.allSettled(chunks.map((c) => runChunk(client, c, now)));

  const result: FetchResult = {
    viewer: null,
    rateLimit: null,
    prs: [],
    actions: [],
    reposWithOpenPrs: 0,
    errors: [],
  };

  settled.forEach((res, ci) => {
    if (res.status === "fulfilled") {
      const r = res.value;
      result.viewer = result.viewer ?? r.viewer;
      result.rateLimit = mergeRateLimit(result.rateLimit, r.rateLimit);
      result.prs.push(...r.prs);
      result.actions.push(...r.actions);
      result.errors.push(...r.errors);
      result.reposWithOpenPrs += r.reposWithOpenPrs;
    } else {
      for (const repo of chunks[ci]) {
        result.errors.push({ repo: repoKey(repo), message: errMessage(res.reason) });
      }
    }
  });

  return result;
}

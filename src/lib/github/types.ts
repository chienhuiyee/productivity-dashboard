import type { FocusItem } from "@/lib/modules/types";

/** The most recent meaningful activity on a PR (comment, review, commit, ...). */
export interface PrLastActivity {
  author: string | null;
  /** ISO timestamp, or null if unknown. */
  at: string | null;
  /** True when the author looks like a bot (login ends with [bot]). */
  isBot: boolean;
  /** "comment" | "review" | "commit" | "ready" | "reopened" | "opened" */
  kind: string;
}

export interface PullRequestItem {
  repo: string; // "owner/name"
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  author: string | null;
  /** GitHub's merge state. CONFLICTING = has conflicts; UNKNOWN = not yet computed. */
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  /** The signed-in user's review is directly requested on this PR. */
  reviewRequestedForMe: boolean;
  lastActivity: PrLastActivity;
  /** ms since the PR was opened, at generation time. */
  ageMs: number;
  /** Ranking score (higher = more urgent). */
  score: number;
  /** Why this PR scored the way it did, for display. */
  focusReasons: string[];
}

export interface ActionFailure {
  repo: string; // "owner/name"
  repoUrl: string;
  defaultBranch: string;
  workflowName: string | null;
  runUrl: string | null;
  /** ISO timestamp of the most recent failing run on the default branch. */
  failingSince: string | null;
  /** ms the default branch has been failing, at generation time. */
  failingForMs: number | null;
  score: number;
}

export interface RepoError {
  repo: string; // "owner/name"
  message: string;
}

export interface RateLimitInfo {
  cost: number;
  remaining: number;
  resetAt: string;
}

/** The full payload returned by the GitHub module / `/api/github`. */
export interface GithubData {
  generatedAt: string; // ISO
  cached: boolean;
  viewer: string | null;
  rateLimit: RateLimitInfo | null;
  repoCount: number;
  reposWithOpenPrs: number;
  prs: PullRequestItem[];
  actions: ActionFailure[];
  focus: FocusItem[];
  errors: RepoError[];
}

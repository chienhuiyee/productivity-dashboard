import "server-only";
import { fetchGithubData } from "./fetchRepos";
import type { GithubData } from "./types";
import { buildFocus, scoreAction, scorePr } from "@/lib/ranking/score";
import { readConfig } from "@/lib/config/store";
import { repoKey } from "@/lib/config/schema";
import { getCached, setCached } from "@/lib/cache";
import type { SourceProvider } from "@/lib/modules/types";

const CACHE_TTL_MS = 90_000;

/**
 * The GitHub module's entry point: read config -> (cache) -> fetch -> rank -> summarize.
 * Ranking runs here (server-side), so the returned payload already carries scores
 * and a ready-to-render focus summary.
 */
export async function getGithubData(token: string, opts: { force?: boolean } = {}): Promise<GithubData> {
  const config = await readConfig();
  const repos = config.repos;
  const cacheKey = `github:${repos.map(repoKey).sort().join(",")}`;

  if (!opts.force) {
    const cached = getCached<GithubData>(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const now = Date.now();
  const { viewer, rateLimit, prs, actions, reposWithOpenPrs, errors } = await fetchGithubData(token, repos, now);

  for (const pr of prs) {
    const { score, reasons } = scorePr(pr, now);
    pr.score = score;
    pr.focusReasons = reasons;
  }
  prs.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));

  for (const action of actions) {
    action.score = scoreAction(action, now);
  }
  actions.sort((a, b) => b.score - a.score);

  const data: GithubData = {
    generatedAt: new Date(now).toISOString(),
    cached: false,
    viewer,
    rateLimit,
    repoCount: repos.length,
    reposWithOpenPrs,
    prs,
    actions,
    focus: buildFocus(prs, actions, { reposWithOpenPrs }, now),
    errors,
  };

  setCached(cacheKey, data, CACHE_TTL_MS);
  return data;
}

/** GitHub as a pluggable dashboard module. Future modules mirror this shape. */
export const githubProvider: SourceProvider<GithubData> = {
  id: "github",
  title: "GitHub",
  async fetch(ctx) {
    if (!ctx.token) throw new Error("GitHub token required");
    return getGithubData(ctx.token, { force: ctx.force });
  },
  rank(data) {
    return data.focus;
  },
};

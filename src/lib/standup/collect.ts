import type { GithubData } from "@/lib/github/types";
import type { StandupFacts } from "./types";
import type { parseContributions } from "@/lib/github/contributions";

const DAY = 86_400_000;
type Contrib = ReturnType<typeof parseContributions>;

/** Combine GitHub contributions + dashboard data + tracked items into facts. */
export function assembleFacts(
  contrib: Contrib,
  github: GithubData | null,
  _items: unknown,
  now: number,
  viewer: string | null,
): StandupFacts {
  const prs = github?.prs ?? [];
  const myOpen = prs.filter((p) => !p.isDraft && (!viewer || p.author === viewer));
  const inProgress = myOpen.map((p) => ({
    title: p.title,
    url: p.url,
    number: p.number,
    repo: p.repo,
    dayCount: Math.max(0, Math.floor((now - Date.parse(p.createdAt)) / DAY)),
  }));

  return {
    mergedPrs: contrib.mergedPrs,
    openedPrs: contrib.openedPrs,
    reviewedPrs: contrib.reviewedPrs,
    openedIssues: contrib.openedIssues,
    closedIssues: contrib.closedIssues,
    commitsByRepo: contrib.commitsByRepo,
    needsReview: prs.filter((p) => p.reviewRequestedForMe && !p.isDraft).length,
    waitingOnYou: github?.notifications?.length ?? 0,
    failingMain: (github?.actions ?? []).map((a) => a.repo),
    inProgress,
  };
}

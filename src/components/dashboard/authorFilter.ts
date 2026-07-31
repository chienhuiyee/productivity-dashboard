import type { PullRequestItem } from "@/lib/github/types";

/** One PR author and how many open PRs they have across all monitored repos. */
export interface AuthorFacet {
  author: string;
  count: number;
}

/** Distinct PR authors with their open-PR counts, most PRs first (ties broken alphabetically). */
export function authorFacets(prs: PullRequestItem[]): AuthorFacet[] {
  const counts = new Map<string, number>();
  for (const p of prs) {
    if (!p.author) continue;
    counts.set(p.author, (counts.get(p.author) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));
}

/** Keep only PRs authored by `author`. A `null` selection means "everyone" (no filtering). */
export function filterByAuthor(prs: PullRequestItem[], author: string | null): PullRequestItem[] {
  if (!author) return prs;
  return prs.filter((p) => p.author === author);
}

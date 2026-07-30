import type { GithubData } from "@/lib/github/types";

const DAY = 86_400_000;

export type NeedKind = "failing" | "waiting" | "review" | "conflict";

export interface NeedItem {
  kind: NeedKind;
  title: string;
  repo: string;
  url: string;
  why: string;
}

export interface OpenWorkItem {
  title: string;
  repo: string;
  number: number;
  url: string;
  dayCount: number;
}

function daysAgo(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
}

/** The prioritized "act now" queue for Home: failing → waiting → review → conflict. Pure. */
export function selectNeedsYou(data: GithubData, now: number): NeedItem[] {
  const items: NeedItem[] = [];

  for (const a of data.actions) {
    const d = daysAgo(a.failingSince, now);
    items.push({
      kind: "failing",
      title: `${a.defaultBranch} is failing on ${a.repo.split("/")[1] ?? a.repo}`,
      repo: a.repo,
      url: a.runUrl ?? a.repoUrl,
      why: d > 0 ? `failing for ${d}d` : "just started failing",
    });
  }

  for (const n of data.notifications.filter((x) => x.tier === "act" || x.tier === "involved")) {
    items.push({
      kind: "waiting",
      title: n.title,
      repo: n.repo,
      url: n.url,
      why: n.reasonLabel,
    });
  }

  const active = data.prs.filter((p) => !p.isDraft);
  for (const p of active.filter((p) => p.reviewRequestedForMe)) {
    items.push({
      kind: "review",
      title: p.title,
      repo: `${p.repo} #${p.number}`,
      url: p.url,
      why: "your review requested",
    });
  }
  for (const p of active.filter((p) => p.mergeable === "CONFLICTING")) {
    items.push({
      kind: "conflict",
      title: p.title,
      repo: `${p.repo} #${p.number}`,
      url: p.url,
      why: "merge conflicts — needs a rebase",
    });
  }

  return items.slice(0, 8);
}

/** The viewer's own in-progress (non-draft) open PRs. Pure. */
export function selectOpenWork(data: GithubData, now: number): OpenWorkItem[] {
  const viewer = data.viewer;
  return data.prs
    .filter((p) => !p.isDraft && (!viewer || p.author === viewer))
    .map((p) => ({
      title: p.title,
      repo: p.repo,
      number: p.number,
      url: p.url,
      dayCount: daysAgo(p.createdAt, now),
    }));
}

import type { GithubData } from "./types";

const DAY = 86_400_000;

export interface GlanceCounts {
  waiting: number;
  failing: number;
  review: number;
  conflicts: number;
  aging: number;
  stale: number;
  openPrs: number;
}

/** At-a-glance counts for the GitHub tiles and the Home pills. Pure: `now` injected. */
export function computeGlanceCounts(data: GithubData, now: number): GlanceCounts {
  const active = data.prs.filter((p) => !p.isDraft);
  return {
    waiting: data.notifications.filter((n) => n.tier === "act" || n.tier === "involved").length,
    failing: data.actions.length,
    review: active.filter((p) => p.reviewRequestedForMe).length,
    conflicts: data.prs.filter((p) => p.mergeable === "CONFLICTING").length,
    aging: active.filter((p) => now - Date.parse(p.createdAt) >= 3 * DAY).length,
    stale: active.filter((p) => now - Date.parse(p.lastActivity.at ?? p.createdAt) >= 2 * DAY).length,
    openPrs: data.prs.length,
  };
}

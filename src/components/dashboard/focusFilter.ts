import type { PullRequestItem } from "@/lib/github/types";

const DAY = 86_400_000;

/** Which detail list is shown below the Focus tiles. */
export type DetailTab = "prs" | "notifications" | "actions";

/** PR sub-filters the Focus tiles can apply. */
export type PrFocus = "all" | "conflicts" | "review" | "aging" | "stale";

/** Every clickable Focus tile. "failing"/"waiting" switch tabs and "open" clears the
 *  PR filter — none of those three are PR sub-filters, so they're excluded from PrFocus. */
export type TileKind = "failing" | "waiting" | "conflicts" | "review" | "aging" | "stale" | "open";

export const FOCUS_LABEL: Record<Exclude<PrFocus, "all">, string> = {
  conflicts: "conflicts",
  review: "your review",
  aging: "aging 3d+",
  stale: "stale 2d+",
};

export function matchesFocus(pr: PullRequestItem, focus: PrFocus, now: number): boolean {
  switch (focus) {
    case "conflicts":
      return pr.mergeable === "CONFLICTING";
    case "review":
      return pr.reviewRequestedForMe && !pr.isDraft;
    case "aging":
      return !pr.isDraft && now - Date.parse(pr.createdAt) >= 3 * DAY;
    case "stale":
      return !pr.isDraft && now - Date.parse(pr.lastActivity.at ?? pr.createdAt) >= 2 * DAY;
    default:
      return true;
  }
}

/** Kept out of component/hook bodies so the Date.now() read isn't an impure render. */
export function filterByFocus(prs: PullRequestItem[], focus: PrFocus): PullRequestItem[] {
  if (focus === "all") return prs;
  const now = Date.now();
  return prs.filter((p) => matchesFocus(p, focus, now));
}

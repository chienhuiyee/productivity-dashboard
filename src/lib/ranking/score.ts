import { DAY_MS, RULES } from "./rules";
import type { ActionFailure, NotificationItem, PullRequestItem } from "@/lib/github/types";
import { isActionable } from "@/lib/github/notifications";
import type { FocusItem } from "@/lib/modules/types";

function ms(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? fallback : t;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

/** Score a single PR for ordering. Pure: `now` is injected so it's testable. */
export function scorePr(
  pr: Pick<PullRequestItem, "createdAt" | "isDraft" | "reviewRequestedForMe" | "lastActivity" | "mergeable">,
  now: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  if (pr.isDraft) {
    return { score: RULES.pr.draftScore, reasons: ["draft"] };
  }

  let score = 0;
  const ageDays = (now - ms(pr.createdAt, now)) / DAY_MS;
  for (const bucket of RULES.pr.ageBuckets) {
    if (ageDays >= bucket.minDays) {
      score += bucket.points;
      reasons.push(bucket.label);
      break;
    }
  }

  if (pr.reviewRequestedForMe) {
    score += RULES.pr.reviewRequestedForMe;
    reasons.push("your review requested");
  }

  if (pr.mergeable === "CONFLICTING") {
    score += RULES.pr.conflictPoints;
    reasons.push("has merge conflicts");
  }

  const lastAt = ms(pr.lastActivity?.at, ms(pr.createdAt, now));
  if (now - lastAt >= RULES.pr.staleActivityDays * DAY_MS) {
    score += RULES.pr.stalePoints;
    reasons.push(`no activity in ${RULES.pr.staleActivityDays}+ days`);
  }

  return { score, reasons };
}

/** Score a broken-default-branch failure. Longer broken = higher. */
export function scoreAction(
  action: Pick<ActionFailure, "failingSince">,
  now: number,
): number {
  const since = ms(action.failingSince, now);
  const daysFailing = Math.max(0, (now - since) / DAY_MS);
  return (
    RULES.actions.brokenBase +
    Math.min(daysFailing * RULES.actions.perDayFailingPoints, RULES.actions.maxFailingBonus)
  );
}

/** Score a GitHub notification. Pure: `now` is injected so it's testable. */
export function scoreNotification(
  n: Pick<NotificationItem, "reason" | "unread" | "updatedAt">,
  now: number,
): number {
  const points = RULES.notifications.reasonPoints[n.reason] ?? RULES.notifications.defaultReasonPoints;
  let score = points;
  if (n.unread) score += RULES.notifications.unreadBonus;

  const ageDays = (now - ms(n.updatedAt, now)) / DAY_MS;
  for (const bucket of RULES.notifications.ageBuckets) {
    if (ageDays >= bucket.minDays) {
      score += bucket.points;
      break;
    }
  }

  return score;
}

/**
 * Build the ranked focus summary from already-scored PRs, Action failures, and
 * notifications. Returns at most RULES.focus.maxLines items, most urgent first.
 */
export function buildFocus(
  prs: PullRequestItem[],
  actions: ActionFailure[],
  notifications: NotificationItem[],
  meta: { reposWithOpenPrs: number },
  now: number,
): FocusItem[] {
  const items: FocusItem[] = [];
  const sev = RULES.focus.severity;

  if (actions.length > 0) {
    items.push({
      moduleId: "github",
      kind: "actions-broken",
      label: `${actions.length} repo${plural(actions.length)} with failing main`,
      severity: sev.actionsBroken + actions.length,
    });
  }

  const waiting = notifications.filter((n) => isActionable(n.reason));
  if (waiting.length > 0) {
    items.push({
      moduleId: "github",
      kind: "notif-waiting",
      label: `${waiting.length} notification${plural(waiting.length)} waiting on you`,
      severity: sev.notifWaiting + waiting.length,
    });
  }

  const focusablePrs = prs.filter((p) => !(RULES.pr.excludeDraftsFromFocus && p.isDraft));

  const needsReview = focusablePrs.filter((p) => p.reviewRequestedForMe);
  if (needsReview.length > 0) {
    items.push({
      moduleId: "github",
      kind: "pr-review",
      label: `${needsReview.length} PR${plural(needsReview.length)} need${needsReview.length === 1 ? "s" : ""} your review`,
      severity: sev.prReview + needsReview.length,
    });
  }

  const conflicting = focusablePrs.filter((p) => p.mergeable === "CONFLICTING");
  if (conflicting.length > 0) {
    items.push({
      moduleId: "github",
      kind: "pr-conflict",
      label: `${conflicting.length} PR${plural(conflicting.length)} with merge conflicts`,
      severity: sev.prConflict + conflicting.length,
    });
  }

  const oldThreshold = RULES.focus.oldPrDays * DAY_MS;
  const oldPrs = focusablePrs.filter((p) => now - ms(p.createdAt, now) >= oldThreshold);
  if (oldPrs.length > 0) {
    items.push({
      moduleId: "github",
      kind: "pr-old",
      label: `${oldPrs.length} PR${plural(oldPrs.length)} open > ${RULES.focus.oldPrDays} days`,
      severity: sev.prOld + oldPrs.length,
    });
  }

  const staleThreshold = RULES.pr.staleActivityDays * DAY_MS;
  const stalePrs = focusablePrs.filter(
    (p) => now - ms(p.lastActivity?.at, ms(p.createdAt, now)) >= staleThreshold,
  );
  if (stalePrs.length > 0) {
    items.push({
      moduleId: "github",
      kind: "pr-stale",
      label: `${stalePrs.length} PR${plural(stalePrs.length)} with no activity in ${RULES.pr.staleActivityDays}+ days`,
      severity: sev.prStale + stalePrs.length,
    });
  }

  if (meta.reposWithOpenPrs > 0) {
    items.push({
      moduleId: "github",
      kind: "overview",
      label: `${meta.reposWithOpenPrs} repo${plural(meta.reposWithOpenPrs)} with open PRs (${prs.length} total)`,
      severity: sev.overview,
    });
  }

  items.sort((a, b) => b.severity - a.severity);
  return items.slice(0, RULES.focus.maxLines);
}

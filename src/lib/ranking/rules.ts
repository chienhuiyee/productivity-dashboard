/**
 * All ranking thresholds live here as the single source of truth.
 * `score.ts` consumes these; nothing else should hard-code time thresholds.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const RULES = {
  pr: {
    /** Checked in order; first matching bucket adds its points. */
    ageBuckets: [
      { minDays: 7, points: 40, label: "open > 1 week" },
      { minDays: 3, points: 25, label: "open > 3 days" },
      { minDays: 1, points: 10, label: "open > 1 day" },
    ],
    reviewRequestedForMe: 15,
    conflictPoints: 12,
    staleActivityDays: 2,
    stalePoints: 10,
    /** Drafts are shown in the widget (dimmed) but never counted in the focus summary. */
    excludeDraftsFromFocus: true,
    /** Score assigned to drafts so they sort to the bottom (kept finite for JSON). */
    draftScore: -1000,
  },
  actions: {
    brokenBase: 50,
    perDayFailingPoints: 10,
    maxFailingBonus: 40,
  },
  notifications: {
    /** Points per GitHub `reason`; higher = more "waiting on you". */
    reasonPoints: {
      review_requested: 50,
      assign: 45,
      mention: 40,
      security_alert: 30,
      team_mention: 30,
      author: 25,
      ci_activity: 22,
      invitation: 20,
      comment: 15,
      state_change: 12,
      manual: 8,
      subscribed: 5,
    } as Record<string, number>,
    /** Fallback for any reason GitHub adds that we don't map yet. */
    defaultReasonPoints: 10,
    /** Unread threads are, by definition, the ones still waiting. */
    unreadBonus: 8,
    /** Checked in order; first matching bucket adds its points (older = more neglected). */
    ageBuckets: [
      { minDays: 3, points: 10 },
      { minDays: 1, points: 5 },
    ],
    /** Reasons that count as actionable ("waiting on you"): the tile + focus line. */
    tiers: {
      act: ["review_requested", "assign", "mention", "team_mention"] as string[],
      involved: ["author", "ci_activity", "security_alert"] as string[],
    },
    /** Fetch bound: at most maxPages * perPage notifications. */
    perPage: 50,
    maxPages: 3,
  },
  focus: {
    /** Show at most this many summary lines. */
    maxLines: 6,
    /** Severity weights, so ordering across kinds is deterministic. */
    severity: {
      actionsBroken: 100,
      prReview: 80,
      notifWaiting: 78,
      prConflict: 70,
      prOld: 60,
      prStale: 40,
      overview: 20,
    },
    /** A PR counts as "old" for the summary at this age. */
    oldPrDays: 3,
  },
} as const;

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
  focus: {
    /** Show at most this many summary lines. */
    maxLines: 6,
    /** Severity weights, so ordering across kinds is deterministic. */
    severity: {
      actionsBroken: 100,
      prReview: 80,
      prConflict: 70,
      prOld: 60,
      prStale: 40,
      overview: 20,
    },
    /** A PR counts as "old" for the summary at this age. */
    oldPrDays: 3,
  },
} as const;

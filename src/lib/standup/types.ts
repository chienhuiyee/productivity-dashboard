export type ItemType = "meeting" | "review" | "task";
export type ItemStatus = "open" | "done" | "dropped";

/** A manual item the user tracks across days (persisted until resolved). */
export interface TrackedItem {
  id: string;
  text: string;
  type: ItemType;
  status: ItemStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Scheduled datetime (from natural-language parsing), if any. */
  scheduledFor: string | null; // ISO
  /** Links a follow-up ("2nd meeting") to its parent item. */
  parentId: string | null;
}

/** A single PR or issue reference for the facts panel. */
export interface Ref {
  repo: string; // "owner/name"
  number: number;
  title: string;
  url: string;
}

/** Deterministic facts assembled for a standup window. */
export interface StandupFacts {
  mergedPrs: Ref[];
  openedPrs: Ref[];
  reviewedPrs: Ref[];
  openedIssues: Ref[];
  closedIssues: Ref[];
  commitsByRepo: { repo: string; count: number }[];
  /** "Today" candidates reused from the dashboard. */
  needsReview: number;
  waitingOnYou: number;
  failingMain: string[]; // repo names
  inProgress: { title: string; url: string; number: number; repo: string; dayCount: number }[];
}

/** One saved day record. */
export interface StandupDay {
  date: string; // "YYYY-MM-DD" (local)
  windowFrom: string; // ISO
  windowTo: string; // ISO
  facts: StandupFacts;
  manualNotes: string;
  doneItemIds: string[];
  generatedText: string; // editable prose (Yesterday/Today)
}

/** Live cross-day state. */
export interface StandupState {
  items: TrackedItem[];
}

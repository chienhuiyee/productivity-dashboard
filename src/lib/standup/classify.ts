import * as chrono from "chrono-node";
import type { ItemType } from "./types";

const MEETING = /\b(meeting|meet|call|sync|1:1|standup|catch\s?up|chat with|discuss)\b/i;
const REVIEW = /\breview(ed|ing)?\b/i;

/** Keyword type classifier (instant, offline). */
export function classifyType(text: string): ItemType {
  if (MEETING.test(text)) return "meeting";
  if (REVIEW.test(text)) return "review";
  return "task";
}

/**
 * Classify an item and extract a scheduled datetime from natural language
 * ("tomorrow 3 pm"), returning a cleaned title. Pure: `now` injected.
 */
export function parseItem(text: string, now: number): { title: string; type: ItemType; scheduledFor: string | null } {
  const type = classifyType(text);
  const results = chrono.parse(text, new Date(now), { forwardDate: true });

  if (results.length === 0) {
    return { title: text.trim(), type, scheduledFor: null };
  }

  const r = results[0];
  const stripped = (text.slice(0, r.index) + text.slice(r.index + r.text.length))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+(on|at|@)\s*$/i, "")
    .trim();

  return {
    title: stripped || text.trim(),
    type,
    scheduledFor: r.start.date().toISOString(),
  };
}

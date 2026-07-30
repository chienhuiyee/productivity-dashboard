import type { NeedItem, NeedKind } from "./select";

export interface Briefing {
  greeting: string;
  lead: string;
  primary: { label: string; href: string } | null;
  allClear: boolean;
}

const COUNT_WORDS = ["nothing", "One thing", "Two things", "Three things", "Four things", "Five things"];

const PRIMARY_LABEL: Record<NeedKind, string> = {
  failing: "Look at the failing branch",
  waiting: "Jump to what's waiting",
  review: "Start with that review",
  conflict: "Resolve the conflict",
};

function timeOfDay(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function countPhrase(n: number): string {
  return n < COUNT_WORDS.length ? COUNT_WORDS[n] : `${n} things`;
}

/** Compose the Home briefing from the needs queue + failing count. Pure: `now` injected. */
export function buildBriefing(needs: NeedItem[], failingCount: number, now: number, name: string | null): Briefing {
  const tod = timeOfDay(now);
  const greeting = `Good ${tod}${name ? `, ${name}` : ""}.`;

  if (needs.length === 0) {
    return {
      greeting,
      lead: "You're all clear — nothing needs you right now. Enjoy the quiet.",
      primary: null,
      allClear: true,
    };
  }

  const count = countPhrase(needs.length);
  const mainClause =
    failingCount === 0
      ? "Every main branch is green"
      : `${failingCount} main branch${failingCount === 1 ? " is" : "es are"} failing`;
  const top = needs[0];
  const lead = `${count} need you this ${tod}. ${mainClause} — start with ${top.title}.`;

  return {
    greeting,
    lead,
    primary: { label: PRIMARY_LABEL[top.kind], href: top.url },
    allClear: false,
  };
}

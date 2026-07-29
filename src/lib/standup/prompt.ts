import type { StandupFacts, TrackedItem } from "./types";

function refLines(label: string, refs: { repo: string; number: number; title: string }[]): string {
  if (refs.length === 0) return "";
  return `${label}:\n` + refs.map((r) => `  - ${r.title} (${r.repo} #${r.number})`).join("\n") + "\n";
}

export function buildGeneratePrompt(
  facts: StandupFacts,
  doneItems: TrackedItem[],
  openItems: TrackedItem[],
  notes: string,
): string {
  const parts = [
    "You are writing a developer's daily standup. Use ONLY the facts below — do not invent work.",
    "Write two short sections, 'Yesterday' and 'Today', as tight bullet points suitable to read aloud.",
    "Group related items; be concise; no preamble.",
    "",
    "FACTS — yesterday:",
    refLines("Merged PRs", facts.mergedPrs),
    refLines("Opened PRs", facts.openedPrs),
    refLines("Reviewed PRs", facts.reviewedPrs),
    facts.commitsByRepo.length ? `Commits: ${facts.commitsByRepo.map((c) => `${c.count} in ${c.repo}`).join(", ")}\n` : "",
    doneItems.length ? "Also did:\n" + doneItems.map((i) => `  - ${i.text}`).join("\n") + "\n" : "",
    notes.trim() ? `Notes: ${notes.trim()}\n` : "",
    "",
    "FACTS — today:",
    facts.needsReview ? `- ${facts.needsReview} PR(s) need my review\n` : "",
    facts.waitingOnYou ? `- ${facts.waitingOnYou} notification(s) waiting on me\n` : "",
    facts.failingMain.length ? `- failing main: ${facts.failingMain.join(", ")}\n` : "",
    facts.inProgress.length ? "In progress:\n" + facts.inProgress.map((p) => `  - ${p.title} (${p.repo} #${p.number}, day ${p.dayCount})`).join("\n") + "\n" : "",
    openItems.length ? "Planned:\n" + openItems.map((i) => `  - ${i.text}${i.scheduledFor ? ` @ ${i.scheduledFor}` : ""}`).join("\n") + "\n" : "",
  ];
  return parts.filter(Boolean).join("\n");
}

export function buildRollupPrompt(days: { date: string; facts: StandupFacts }[], range: "week" | "month"): string {
  const lines = days.map((d) => {
    const f = d.facts;
    return `${d.date}: merged ${f.mergedPrs.length}, opened ${f.openedPrs.length}, reviewed ${f.reviewedPrs.length}, commits ${f.commitsByRepo.reduce((s, c) => s + c.count, 0)}`;
  });
  return [
    `Summarize this developer's ${range} in 3-4 sentences for a retro. Use ONLY these daily facts; be specific about themes and totals.`,
    "",
    ...lines,
  ].join("\n");
}

export const IMAGE_EXTRACT_PROMPT =
  'Look at this screenshot (a Slack thread, Jira board, or meeting notes). Extract the concrete action items, tasks, and meetings for the viewer. Reply with ONLY JSON: {"items": ["short item 1", "short item 2"]}. No prose.';

export function parseImageItems(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]);
    return Array.isArray(obj.items) ? obj.items.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

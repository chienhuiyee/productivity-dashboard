import type { GlanceCounts } from "@/lib/github/glance";

type Tone = "neutral" | "amber" | "orange" | "red" | "rose" | "green";

// Status is carried by a dot + label (never color alone); the number stays in ink.
const DOT: Record<Tone, string> = {
  neutral: "bg-zinc-400 dark:bg-zinc-600",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  rose: "bg-rose-500",
  green: "bg-green-600 dark:bg-green-500",
};

interface Pill {
  label: string;
  value: number;
  tone: Tone;
}

function pillsFor(c: GlanceCounts): Pill[] {
  return [
    { label: "Waiting on you", value: c.waiting, tone: "orange" },
    { label: "Failing main", value: c.failing, tone: c.failing ? "red" : "green" },
    { label: "Your review", value: c.review, tone: "amber" },
    { label: "Conflicts", value: c.conflicts, tone: "rose" },
    { label: "Aging 3d+", value: c.aging, tone: "orange" },
    { label: "Open PRs", value: c.openPrs, tone: "neutral" },
  ];
}

/** "At a glance" status pills for the Home masthead — dims to 0 value, but the dot + word still name the status. */
export function GlancePills({ counts }: { counts: GlanceCounts }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
      {pillsFor(counts).map((p) => (
        <span
          key={p.label}
          className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm shadow-sm ${
            p.value === 0 ? "opacity-60" : ""
          }`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[p.tone]}`} aria-hidden />
          <span className="font-mono font-semibold tabular-nums">{p.value}</span>
          <span className="text-muted">{p.label}</span>
        </span>
      ))}
    </div>
  );
}

import type { FocusItem } from "@/lib/modules/types";

const DOT: Record<string, string> = {
  "actions-broken": "bg-red-500",
  "pr-review": "bg-amber-500",
  "pr-conflict": "bg-rose-500",
  "pr-old": "bg-orange-500",
  "pr-stale": "bg-yellow-500",
  overview: "bg-blue-500",
};

/** The "what should I focus on" banner at the top of the dashboard. */
export function FocusSummary({ focus }: { focus: FocusItem[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Focus</h2>
      {focus.length === 0 ? (
        <p className="text-base">All clear ✨ Nothing needs your attention right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {focus.map((item, i) => (
            <li key={`${item.kind}-${i}`} className="flex items-center gap-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.kind] ?? "bg-muted"}`} aria-hidden />
              <span className="text-base">{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

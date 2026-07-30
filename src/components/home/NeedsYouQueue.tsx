import type { NeedItem, NeedKind } from "@/lib/home/select";
import { CopyButton } from "@/components/ui/CopyButton";

type Tone = "amber" | "orange" | "rose" | "red";

// Status is carried by a dot + label on the chip (never color alone) plus a matching stripe.
const TONE_BG: Record<Tone, string> = {
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  rose: "bg-rose-500",
  red: "bg-red-500",
};

const KIND: Record<NeedKind, { label: string; tone: Tone; action: string }> = {
  failing: { label: "Failing main", tone: "red", action: "View" },
  waiting: { label: "Waiting on you", tone: "orange", action: "Open" },
  review: { label: "Your review", tone: "amber", action: "Review" },
  conflict: { label: "Conflicts", tone: "rose", action: "Resolve" },
};

function NeedRow({ item, primary }: { item: NeedItem; primary: boolean }) {
  const meta = KIND[item.kind];
  return (
    <li className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${TONE_BG[meta.tone]}`} aria-hidden />
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3.5 pl-5 pr-4">
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-surface-muted px-2.5 py-1 text-[11px] font-semibold">
          <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${TONE_BG[meta.tone]}`} aria-hidden />
          {meta.label}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="font-mono">{item.repo}</span>
            <span className="text-foreground">{item.why}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className={
              primary
                ? "rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-background shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                : "rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-popover-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            }
          >
            {meta.action}
          </a>
          <CopyButton value={item.url} />
        </div>
      </div>
    </li>
  );
}

function EmptyQueue() {
  return (
    <div className="rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-sm">
      <p className="text-3xl" aria-hidden>
        🌿
      </p>
      <h3 className="mt-3 font-serif text-lg font-semibold">Nothing needs you right now</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
        You’re all caught up. Enjoy the quiet — or get ahead on your open work below.
      </p>
    </div>
  );
}

/** The prioritized "act now" queue: severity stripe, kind chip (dot + word), title/meta, action + copy. */
export function NeedsYouQueue({ items }: { items: NeedItem[] }) {
  return (
    <section>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight">Needs you today</h2>
        <span className="font-mono text-xs text-muted">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>
      {items.length === 0 ? (
        <EmptyQueue />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item, i) => (
            <NeedRow key={`${item.kind}-${item.url}`} item={item} primary={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

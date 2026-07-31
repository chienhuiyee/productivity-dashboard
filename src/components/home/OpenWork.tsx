import type { OpenWorkItem } from "@/lib/home/select";

/** Card listing the viewer's own in-progress (non-draft) PRs, each linking out to GitHub. */
export function OpenWork({ items }: { items: OpenWorkItem[] }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <h2 className="font-serif text-base font-semibold">Your open work</h2>
        <span className="ml-auto rounded-full bg-surface-muted px-2.5 py-0.5 font-mono text-xs font-semibold text-muted">
          {items.length}
        </span>
      </header>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No open PRs of yours right now.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border px-2 py-1">
          {items.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-popover-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {item.repo} #{item.number}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{item.dayCount}d</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import type { Ref, StandupFacts } from "@/lib/standup/types";

function RefLine({ r }: { r: Ref }) {
  return (
    <span className="block truncate">
      <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
        {r.title}
      </a>{" "}
      <span className="font-mono text-muted">
        {r.repo} #{r.number}
      </span>
    </span>
  );
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-border px-5 py-2.5 text-sm first:border-t-0">
      <span className="w-20 shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  );
}

function Unavailable() {
  return <p className="px-5 py-6 text-center text-sm text-muted">GitHub data isn’t available right now.</p>;
}

/** "Yesterday — the evidence" + "Today — suggested", always visible; degrades gracefully when facts is null. */
export function FactsPanel({ facts }: { facts: StandupFacts | null }) {
  const hasYesterday =
    !!facts &&
    (facts.mergedPrs.length > 0 ||
      facts.openedPrs.length > 0 ||
      facts.reviewedPrs.length > 0 ||
      facts.commitsByRepo.length > 0 ||
      facts.openedIssues.length > 0 ||
      facts.closedIssues.length > 0);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Yesterday — the evidence</h2>
        </header>
        {!facts ? (
          <Unavailable />
        ) : !hasYesterday ? (
          <p className="px-5 py-6 text-center text-sm text-muted">No activity in the window yet.</p>
        ) : (
          <div>
            {facts.mergedPrs.length > 0 && (
              <FactRow label="Merged">
                {facts.mergedPrs.map((r) => (
                  <RefLine key={r.url} r={r} />
                ))}
              </FactRow>
            )}
            {facts.openedPrs.length > 0 && (
              <FactRow label="Opened">
                {facts.openedPrs.map((r) => (
                  <RefLine key={r.url} r={r} />
                ))}
              </FactRow>
            )}
            {facts.reviewedPrs.length > 0 && (
              <FactRow label="Reviewed">
                {facts.reviewedPrs.map((r) => (
                  <RefLine key={r.url} r={r} />
                ))}
              </FactRow>
            )}
            {facts.commitsByRepo.length > 0 && (
              <FactRow label="Commits">
                <span>
                  {facts.commitsByRepo.reduce((n, c) => n + c.count, 0)} commits{" "}
                  <span className="text-muted">· {facts.commitsByRepo.map((c) => c.repo).join(", ")}</span>
                </span>
              </FactRow>
            )}
            {(facts.openedIssues.length > 0 || facts.closedIssues.length > 0) && (
              <FactRow label="Issues">
                {facts.closedIssues.length > 0 && <span className="block">Closed {facts.closedIssues.length}</span>}
                {facts.openedIssues.length > 0 && <span className="block">Opened {facts.openedIssues.length}</span>}
              </FactRow>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Today — suggested</h2>
        </header>
        {!facts ? (
          <Unavailable />
        ) : (
          <div>
            {facts.inProgress.length > 0 && (
              <FactRow label="In progress">
                {facts.inProgress.map((p) => (
                  <span key={p.url} className="block truncate">
                    <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {p.title}
                    </a>{" "}
                    <span className="font-mono text-muted">
                      {p.repo} #{p.number} · day {p.dayCount}
                    </span>
                  </span>
                ))}
              </FactRow>
            )}
            <FactRow label="Review">
              <span>
                {facts.needsReview} PR{facts.needsReview === 1 ? "" : "s"} waiting on your review
              </span>
            </FactRow>
            <FactRow label="Waiting">
              <span>
                {facts.waitingOnYou} notification{facts.waitingOnYou === 1 ? "" : "s"} need a reply
              </span>
            </FactRow>
            {facts.failingMain.length > 0 && (
              <FactRow label="Failing">
                {facts.failingMain.map((repo) => (
                  <span key={repo} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                    main broken on <span className="font-mono">{repo}</span>
                  </span>
                ))}
              </FactRow>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

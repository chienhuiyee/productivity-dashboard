"use client";

import { useMemo, useState } from "react";
import { Check, Copy, GitPullRequest, X } from "lucide-react";
import type { PullRequestItem } from "@/lib/github/types";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { EmptyState } from "./WidgetCard";
import { FOCUS_LABEL, filterByFocus, type PrFocus } from "./focusFilter";

const DAY = 86_400_000;

type SortMode = "urgency" | "oldest" | "active";

/** A short, color-coded age chip so the longest-aging PRs stand out at a glance. */
function ageInfo(createdAt: string): { label: string; className: string } {
  const ms = Date.now() - Date.parse(createdAt);
  const days = ms / DAY;

  let label: string;
  if (days >= 1) label = `${Math.floor(days)}d`;
  else {
    const hours = Math.floor(ms / 3_600_000);
    label = hours >= 1 ? `${hours}h` : "new";
  }

  let className = "bg-surface-muted text-muted";
  if (days >= 7) className = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  else if (days >= 3) className = "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300";
  else if (days >= 1) className = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";

  return { label, className };
}

/** Copies every currently shown PR URL, one per line. */
function CopyAllButton({ urls }: { urls: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (urls.length === 0) return;
    try {
      await navigator.clipboard.writeText(urls.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked (e.g. non-secure context); fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={urls.length === 0}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      {copied ? (
        <Check className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
      )}
      {copied ? "Copied" : `Copy all (${urls.length})`}
    </button>
  );
}

export function PullRequestsWidget({
  prs,
  focus,
  onClearFocus,
}: {
  prs: PullRequestItem[];
  focus: PrFocus;
  onClearFocus: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("urgency");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = filterByFocus(prs, focus);
    if (q) {
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q));
    }

    if (sort === "oldest") {
      list = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else if (sort === "active") {
      list = [...list].sort((a, b) => (b.lastActivity.at ?? "").localeCompare(a.lastActivity.at ?? ""));
    }
    // "urgency" keeps the server's score order.
    return list;
  }, [prs, filter, sort, focus]);

  if (prs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-10 text-center">
        <GitPullRequest className="h-5 w-5 text-muted" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-muted">No open pull requests right now.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by title or repo…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
              aria-label="Filter pull requests"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
              aria-label="Sort pull requests"
            >
              <option value="urgency">Most urgent</option>
              <option value="oldest">Oldest first</option>
              <option value="active">Recently active</option>
            </select>
            <CopyAllButton urls={visible.map((p) => p.url)} />
          </div>

          {focus !== "all" && (
            <div className="mb-3 flex items-center gap-2 text-xs text-muted">
              <span>Focus:</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2 py-0.5 font-medium text-foreground">
                {FOCUS_LABEL[focus]}
                <button
                  type="button"
                  onClick={onClearFocus}
                  aria-label="Clear focus filter"
                  className="text-muted transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" strokeWidth={2} aria-hidden />
                </button>
              </span>
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState>
              No PRs match{filter ? ` “${filter}”` : focus !== "all" ? " this focus filter" : ""}.
              {focus !== "all" && (
                <button type="button" onClick={onClearFocus} className="ml-2 underline">
                  clear filter
                </button>
              )}
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {visible.map((pr) => {
                const age = ageInfo(pr.createdAt);
                return (
                  <li
                    key={pr.url}
                    className={`py-3 first:pt-0 last:pb-0 ${pr.isDraft ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${age.className}`}
                            title={`opened ${age.label} ago`}
                          >
                            {age.label}
                          </span>
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium hover:underline"
                          >
                            {pr.title}
                          </a>
                          {pr.reviewRequestedForMe && <Badge variant="amber">your review</Badge>}
                          {pr.mergeable === "CONFLICTING" && <Badge variant="red">conflict</Badge>}
                          {pr.isDraft && <Badge variant="gray">draft</Badge>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted">
                          {pr.repo} #{pr.number} · opened <RelativeTime iso={pr.createdAt} />
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          last activity {pr.lastActivity.kind} by {pr.lastActivity.author ?? "unknown"}
                          {pr.lastActivity.isBot ? " (bot)" : ""} · <RelativeTime iso={pr.lastActivity.at} />
                        </p>
                      </div>
                      <CopyButton value={pr.url} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

      {filter && visible.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Showing {visible.length} of {prs.length}.
        </p>
      )}
    </>
  );
}

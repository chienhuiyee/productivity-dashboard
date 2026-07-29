"use client";

import { useMemo, useState } from "react";
import { Bell, Check, Copy } from "lucide-react";
import type { NotificationItem } from "@/lib/github/types";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { RelativeTime } from "@/components/ui/RelativeTime";

type SortMode = "urgency" | "newest" | "oldest";

/** Reason badge colour, grouped by how much the thread is "waiting on you". */
function reasonVariant(reason: string): BadgeVariant {
  switch (reason) {
    case "review_requested":
    case "assign":
      return "amber";
    case "mention":
      return "orange";
    case "team_mention":
      return "yellow";
    case "security_alert":
      return "red";
    case "author":
    case "ci_activity":
      return "blue";
    default:
      return "gray";
  }
}

/** Short, friendly label for a notification subject type. */
function typeLabel(subjectType: string): string {
  switch (subjectType) {
    case "PullRequest":
      return "PR";
    case "Issue":
      return "Issue";
    case "Discussion":
      return "Discussion";
    case "Release":
      return "Release";
    case "CheckSuite":
      return "CI";
    case "Commit":
      return "Commit";
    default:
      return subjectType;
  }
}

/** Copies every currently shown notification URL, one per line. */
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

/** The "waiting on you" inbox: unread GitHub notifications, most urgent first. */
export function NotificationsWidget({
  notifications,
  truncated,
}: {
  notifications: NotificationItem[];
  truncated: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("urgency");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = notifications;
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.repo.toLowerCase().includes(q) ||
          n.reasonLabel.toLowerCase().includes(q),
      );
    }

    if (sort === "newest") {
      list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (sort === "oldest") {
      list = [...list].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    }
    // "urgency" keeps the server's score order.
    return list;
  }, [notifications, filter, sort]);

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-10 text-center">
        <Bell className="h-5 w-5 text-muted" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-muted">Nothing’s waiting on you — your GitHub inbox is clear.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title, repo, or reason…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
          aria-label="Filter notifications"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
          aria-label="Sort notifications"
        >
          <option value="urgency">Most urgent</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <CopyAllButton urls={visible.map((n) => n.url)} />
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No notifications match{filter ? ` “${filter}”` : ""}.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {visible.map((n) => (
            <li key={n.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.unread && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-accent"
                        title="unread"
                        aria-label="unread"
                      />
                    )}
                    <Badge variant={reasonVariant(n.reason)}>{n.reasonLabel}</Badge>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {n.title}
                    </a>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {n.repo} · {typeLabel(n.subjectType)} · updated{" "}
                    <RelativeTime iso={n.updatedAt} />
                  </p>
                </div>
                <CopyButton value={n.url} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {truncated && (
        <p className="mt-3 text-xs text-muted">
          Showing the most recent {notifications.length}. Older unread notifications aren’t shown.
        </p>
      )}
      {filter && visible.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Showing {visible.length} of {notifications.length}.
        </p>
      )}
    </>
  );
}

import { RULES } from "@/lib/ranking/rules";
import type { NotificationItem, NotificationTier } from "./types";

/**
 * GitHub notifications ("waiting on you"). Unlike the PR/Actions layer this is a
 * REST call (`GET /notifications`) — the notifications inbox has no GraphQL
 * equivalent — so it uses plain fetch with the same OAuth token. Parsing is pure
 * and exported for unit tests; the network fetch never throws (a notifications
 * failure must not sink the rest of the dashboard payload).
 */

// ---- Raw REST response shape (only the fields we read) ----

export interface RawNotification {
  id: string;
  unread: boolean;
  reason: string;
  updated_at: string;
  subject: {
    title: string;
    url: string | null;
    latest_comment_url: string | null;
    type: string;
  } | null;
  repository: {
    full_name: string;
    html_url: string;
  } | null;
}

// ---- Pure helpers (exported for unit tests) ----

const REASON_LABELS: Record<string, string> = {
  review_requested: "review requested",
  assign: "assigned to you",
  mention: "mentioned you",
  team_mention: "team mentioned",
  author: "your thread",
  ci_activity: "CI activity",
  security_alert: "security alert",
  comment: "new comment",
  state_change: "state changed",
  subscribed: "subscribed",
  manual: "subscribed",
  invitation: "invitation",
};

/** Humanize a raw reason, falling back to a de-underscored form for unknowns. */
export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

/** Bucket a reason into a "waiting on you" tier. */
export function notificationTier(reason: string): NotificationTier {
  if (RULES.notifications.tiers.act.includes(reason)) return "act";
  if (RULES.notifications.tiers.involved.includes(reason)) return "involved";
  return "fyi";
}

/** True when a notification is something the user is expected to act on. */
export function isActionable(reason: string): boolean {
  const tier = notificationTier(reason);
  return tier === "act" || tier === "involved";
}

/**
 * The notifications API returns an *API* URL in `subject.url`, not a browser one.
 * Derive a clickable github.com URL for the common types; fall back to the repo
 * page for anything we can't map (releases, check-suites, nulls).
 */
export function notificationHtmlUrl(apiUrl: string | null | undefined, repoHtmlUrl: string): string {
  if (!apiUrl) return repoHtmlUrl;
  // Some subjects (e.g. Discussions) already arrive as browser URLs.
  if (apiUrl.startsWith("https://github.com/")) return apiUrl;

  const m = apiUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return repoHtmlUrl;

  const [, owner, repo, kind, rest] = m;
  const path =
    kind === "pulls" ? "pull" : kind === "issues" ? "issues" : kind === "commits" ? "commit" : null;
  if (!path) return repoHtmlUrl;

  return `https://github.com/${owner}/${repo}/${path}/${rest}`;
}

/** Normalize one raw notification. Returns null when it's too malformed to show. */
export function parseNotification(raw: RawNotification, now: number): NotificationItem | null {
  if (!raw?.subject || !raw.repository) return null;

  const updatedMs = Date.parse(raw.updated_at);
  return {
    id: raw.id,
    repo: raw.repository.full_name,
    repoUrl: raw.repository.html_url,
    reason: raw.reason,
    reasonLabel: reasonLabel(raw.reason),
    tier: notificationTier(raw.reason),
    subjectType: raw.subject.type,
    title: raw.subject.title,
    url: notificationHtmlUrl(raw.subject.url, raw.repository.html_url),
    unread: raw.unread,
    updatedAt: raw.updated_at,
    ageMs: Number.isNaN(updatedMs) ? 0 : Math.max(0, now - updatedMs),
    score: 0,
  };
}

// ---- Network fetch (server-side; never throws) ----

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export interface NotificationsResult {
  notifications: NotificationItem[];
  /** True when the page cap was reached (more unread notifications exist than shown). */
  truncated: boolean;
  /** Set when the fetch failed; the caller surfaces it as an errors[] entry. */
  error?: string;
}

/**
 * Fetch unread notifications ("waiting on you"), bounded to maxPages*perPage.
 * Returns an empty list + `error` on failure rather than throwing, so one bad
 * source never sinks the whole `/api/github` response.
 */
export async function fetchNotifications(token: string, now: number): Promise<NotificationsResult> {
  const { perPage, maxPages } = RULES.notifications;
  const headers = ghHeaders(token);
  const notifications: NotificationItem[] = [];
  let truncated = false;

  try {
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.github.com/notifications?all=false&per_page=${perPage}&page=${page}`;
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) {
        if (page === 1) {
          const body = await res.text();
          return { notifications: [], truncated: false, error: `GitHub API ${res.status}: ${body.slice(0, 200)}` };
        }
        break; // a later page failing still leaves us with a useful partial list
      }

      const batch = (await res.json()) as RawNotification[];
      for (const raw of batch) {
        const item = parseNotification(raw, now);
        if (item) notifications.push(item);
      }

      if (batch.length < perPage) break;
      if (page === maxPages) truncated = true;
    }
  } catch (err) {
    return { notifications: [], truncated: false, error: (err as Error).message ?? "failed to load notifications" };
  }

  return { notifications, truncated };
}

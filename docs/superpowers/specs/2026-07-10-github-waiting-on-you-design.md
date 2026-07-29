# "Waiting on you" — GitHub notifications inbox (design)

**Date:** 2026-07-10
**Status:** Approved-by-default (user asked me to proceed autonomously while away; decisions below were made on their behalf and are open to revision on their return).
**Feature:** Surface the GitHub notifications that are *waiting on the user* (review requests, @-mentions, assignments, activity on their own threads/CI) directly on the dashboard — closing the original pain "I miss GitHub's email notifications."

## Why this, why now

The project's very first stated pain was *missing GitHub email notifications*. The cleanest fix is not email at all — it's GitHub's own **notifications API** (`GET /notifications`), which returns exactly the threads the user is subscribed to / participating in, with a `reason` (why you got it) and `unread` flag. Surfacing the actionable ones on the dashboard removes the dependency on email.

This is the highest-leverage next step because it reuses everything already built:
- **Same OAuth token.** The `repo` scope already granted covers `GET /notifications` (the endpoint requires `notifications` *or* `repo`). **No re-login, no scope change.**
- **Same dashboard.** It plugs into the existing Analysis tiles + tabbed detail + `useGithubData` SWR hook + `/api/github` route.
- **Independent rate budget.** Notifications is a REST call (REST's own 5000/hr bucket), separate from the GraphQL points the PR/Actions fetch spends — so it doesn't compete with existing budget.

## Key decisions (made autonomously)

1. **Extend the GitHub module rather than add a new registry provider.** Notifications are still *GitHub*, use the same token, and belong on the same refresh cycle. The `modules/registry.ts` seam is reserved for genuinely different sources (email, calendar). Notification code lives in its own files (`lib/github/notifications.ts`) for cohesion, but flows through the existing `getGithubData` → `/api/github` → `useGithubData` path. Lowest risk, smallest new surface.
2. **Read-only v1.** No "mark as read / done" writes. Rationale: (a) marking-read is a state change I'd be building unsupervised and cannot test against the live API in this environment; (b) it keeps v1 shippable with zero re-auth. Each row links out to GitHub, where reading it clears it naturally. Mark-as-done is listed under Future work.
3. **Fetch unread only** (`all=false`, the API default). "Unread" *is* "still waiting". Bounded to `maxPages=3 × perPage=50 = 150` notifications to cap cost; if truncated we note it (silent caps are a smell).
4. **Rank by `reason`, not just recency.** A `review_requested` outranks a `subscribed` repo-watch comment. Thresholds live in `rules.ts` (project convention: all thresholds in one file).
5. **One focus-summary line + one Analysis tile + one new tab.** Don't flood the 6-line focus summary; contribute a single "N notifications waiting on you" line plus a dedicated "Waiting on you" tile and an "Inbox" tab.

## Data model

New `NotificationItem` (in `lib/github/types.ts`), added as `notifications: NotificationItem[]` on `GithubData`:

```ts
interface NotificationItem {
  id: string;
  repo: string;         // "owner/name"
  repoUrl: string;      // repository.html_url (always present; link fallback)
  reason: string;       // raw GitHub reason
  reasonLabel: string;  // humanized, e.g. "review requested"
  tier: "act" | "involved" | "fyi";
  subjectType: string;  // "PullRequest" | "Issue" | "Discussion" | "CheckSuite" | ...
  title: string;
  url: string;          // derived browser URL (falls back to repoUrl)
  unread: boolean;
  updatedAt: string;    // ISO
  ageMs: number;
  score: number;
}
```

### Reason → tier
- **act** (someone is waiting on you): `review_requested`, `assign`, `mention`, `team_mention`
- **involved** (your thing changed / may need action): `author`, `ci_activity`, `security_alert`
- **fyi**: `comment`, `state_change`, `subscribed`, `manual`, `invitation`, anything unknown

"Actionable" (drives the tile + focus line) = **act ∪ involved**.

### Browser-URL derivation
The API's `subject.url` is an API URL, not clickable. Pure `notificationHtmlUrl(apiUrl, repoHtmlUrl)`:
- If already `https://github.com/...` → return as-is (some subjects, e.g. Discussions, arrive as HTML URLs).
- `.../repos/{o}/{r}/pulls/{n}` → `https://github.com/{o}/{r}/pull/{n}`
- `.../issues/{n}` → `/issues/{n}`; `.../commits/{sha}` → `/commit/{sha}`
- Anything else (releases, check-suites, null) → fall back to `repoHtmlUrl`. Always clickable.

## Ranking (`lib/ranking`)

`RULES.notifications` in `rules.ts`:
- `reasonPoints`: review_requested 50, assign 45, mention 40, security_alert 30, team_mention 30, author 25, ci_activity 22, invitation 20, comment 15, state_change 12, manual 8, subscribed 5; `defaultReasonPoints` 10.
- `unreadBonus` 8; `ageBuckets` [{≥3d:+10},{≥1d:+5}] (older = more neglected, mirrors PR aging).
- `maxPages` 3, `perPage` 50.
- `tiers.act` / `tiers.involved` reason lists.

`scoreNotification(n, now)` (pure, tested): `reasonPoints[reason] + unread? + ageBucket`.
`buildFocus(...)` gains a `notifications` param and contributes one line: `"N notifications waiting on you"` at severity `focus.severity.notifWaiting = 78` (+count) — just below `prReview` (80).

## Fetch (`lib/github/notifications.ts`)

`fetchNotifications(token, now)` → `{ notifications, truncated, error? }`.
- REST `GET https://api.github.com/notifications?all=false&per_page=50&page=N`, headers mirror `api/repos/route.ts` (`Authorization: token …`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`).
- Paginate until a short page or `maxPages`; `truncated` if the cap is hit.
- **Never throws** — a notifications failure must not sink the PR/Actions payload (project rule: one bad source becomes an `errors[]` entry). Returns `error` string on failure; the provider pushes `{ repo: "notifications", message }` into `errors`.
- `parseNotification(raw, now)` is pure, defensive (null subject/repo → dropped), and exported for tests.

Provider (`lib/github/provider.ts`) runs it **in parallel** with `fetchGithubData` (`Promise.all`), scores + sorts (score desc, then newest), and includes it in `GithubData`. The 90s TTL cache wraps the whole payload unchanged.

## UI

- **Analysis tile** "Waiting on you" (actionable count), placed first; grid becomes `lg:grid-cols-4` (7 tiles → 4 + 3, two tidy rows). Clicking it selects the Inbox tab.
- **Tab** "Waiting on you" (Inbox), inserted between PRs and Failing branches; badge = actionable count. **The inbox shows only actionable notifications (act + involved tiers).** "fyi" reasons — especially `state_change` on already-merged/closed PRs, which stay "unread" forever until cleared on github.com — are dropped, so the tab, tile, and focus line all agree. (Correction after first run: the initial version listed every unread reason, which surfaced weeks-old merged-PR state changes.) Known residual: an *actionable* notification (e.g. an uncleared `review_requested`) on a PR that has since merged can still appear, because the notifications API carries no subject open/merged state — filtering that out would need a per-item lookup (≤150 extra calls/refresh), deferred in favor of a future "mark as done".
- **`NotificationsWidget`** mirrors `PullRequestsWidget`: filter (title/repo/reason), sort (urgency default / newest / oldest), Copy-all, and rows with: unread dot, reason badge (color by tier), title link (→ derived URL), `repo · type · updated …`, and a Copy button. Reuses `Badge`/`CopyButton`/`RelativeTime`/`EmptyState`. If `truncated`, a subtle note shows the cap was hit.
- Wiring: `focusFilter.ts` `TileKind` gains `"waiting"`; `DashboardClient` `tab` union gains `"notifications"`; `selectTile`/`activeKind` handle it exactly like `"failing"`/actions.

## Edge cases & resilience

- Notifications endpoint fails → PRs/Actions still render; error surfaces in the existing "couldn't be loaded" panel.
- `subject.url` null / exotic type → link falls back to the repo page.
- `repoCount === 0` still shows the "configure repos" prompt (notifications are account-wide but the dashboard gate is unchanged in v1 — noted as future work).
- Bounded fetch (≤150) prevents a huge inbox from ballooning the payload; truncation is surfaced, not silent.

## Testing

- `lib/github/notifications.test.ts`: `parseNotification` (null subject → null, PR/issue/commit URL derivation, HTML-URL passthrough, unknown-reason label, tier/actionable), `notificationHtmlUrl` cases.
- `lib/ranking/score.test.ts`: `scoreNotification` (reason weight, unread bonus, age buckets), a `buildFocus` "waiting on you" line, and the existing `buildFocus` calls updated for the new signature.
- `npm run typecheck && npm test && npm run lint && npm run build` must pass. **Live notification data still needs a real OAuth login** (same as the rest of the app per CLAUDE.md) — I can't exercise that headless.

## Out of scope / future work

- Mark-as-read / mark-as-done from the dashboard (needs write testing + confirmation).
- "Only where I'm involved" toggle / per-reason config (would touch the config schema).
- Showing the inbox when zero repos are configured.
- Folding notification review-requests and monitored-repo review-requests into a single de-duplicated line.

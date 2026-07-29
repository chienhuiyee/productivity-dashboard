@AGENTS.md

# Productivity Dashboard — project guide

A local, single-user Next.js dashboard surfacing "what needs my attention" across GitHub. GitHub is
the first of several planned modules (email/tasks/calendar later). See `README.md` for setup.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · NextAuth v5 (GitHub OAuth) ·
`@octokit/graphql` · SWR · zod v4 · date-fns · Vitest.

## Layout
- `src/auth.ts` — NextAuth config (classic GitHub OAuth App; token captured in JWT → session).
- `src/lib/config/` — `schema.ts` (zod) + `store.ts` (atomic fs, `server-only`); persisted to `data/config.json` (gitignored).
- `src/lib/github/` — `queries.ts` (aliased batch GraphQL + raw types), `fetchRepos.ts` (chunk + `Promise.allSettled` + defensive parse; `parseRepo`/`runChunk` are pure & unit-tested), `notifications.ts` (REST "waiting on you" inbox; pure `parseNotification`/`notificationHtmlUrl`, non-throwing `fetchNotifications`), `provider.ts` (fetch repos + notifications in parallel → rank → cache), `client.ts`, `types.ts`.
- `src/lib/ranking/` — `rules.ts` (all thresholds) + `score.ts` (pure `scorePr`/`scoreAction`/`scoreNotification`/`buildFocus`).
- `src/lib/modules/` — `SourceProvider` interface + `registry.ts` (the extension seam for future modules).
- `src/app/api/{github,config}/route.ts` — server aggregator + config CRUD; both gated by `auth()`.
- `src/components/` — `dashboard/`, `config/`, `ui/`, `auth/`. Client components fetch via `src/hooks/useGithubData.ts` (SWR).

## Conventions
- Ranking is pure and lives in `src/lib/ranking`; inject `now` (ms) so it stays testable. Change thresholds only in `rules.ts`.
- Server-only modules (`store.ts`, `provider.ts`, `registry.ts`) import `"server-only"` — never import them into client components.
- One bad repo must never fail the whole `/api/github` response; it becomes an entry in `errors[]`.
- Data routes are `dynamic = "force-dynamic"`.

## Verify
`npm run typecheck && npm test && npm run build`. Unit tests cover ranking and GraphQL/notification
parsing (null alias, null default branch, bot activity, notification URL derivation). Full GitHub
data flow (incl. the notifications inbox) needs a real OAuth login.

@AGENTS.md

# Productivity Dashboard — project guide

A local, single-user Next.js dashboard surfacing "what needs my attention" across GitHub. GitHub is
the first of several planned modules (email/tasks/calendar later). See `README.md` for setup.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · NextAuth v5 (GitHub OAuth) ·
`@octokit/graphql` · SWR · zod v4 · date-fns · Vitest · MongoDB Atlas · `@anthropic-ai/sdk`.

## Layout
- `src/auth.ts` — NextAuth config (classic GitHub OAuth App; token captured in JWT → session).
- `src/lib/db/` — `client.ts` (cached `MongoClient` on `globalThis`; `getDb`/`dbName`), `testing.ts` (`withTestDb` throwaway-database helper).
- `src/lib/config/` — `schema.ts` (zod) + `store.ts` (MongoDB, `server-only`); persisted to the `config` collection.
- `src/lib/auth/allowlist.ts` — pure `isAllowedLogin`, wired into the NextAuth `signIn` callback. Fails closed.
- `src/lib/github/` — `queries.ts` (aliased batch GraphQL + raw types), `fetchRepos.ts` (chunk + `Promise.allSettled` + defensive parse; `parseRepo`/`runChunk` are pure & unit-tested), `notifications.ts` (REST "waiting on you" inbox; pure `parseNotification`/`notificationHtmlUrl`, non-throwing `fetchNotifications`), `provider.ts` (fetch repos + notifications in parallel → rank → cache), `client.ts`, `types.ts`.
- `src/lib/standup/` — window, classify, items, collect, prompt, generate (Anthropic API), store (MongoDB); `/standup` page + `/api/standup` route (daily standup facts, tracked items, AI prose generation).
- `src/lib/ranking/` — `rules.ts` (all thresholds) + `score.ts` (pure `scorePr`/`scoreAction`/`scoreNotification`/`buildFocus`).
- `src/lib/modules/` — `SourceProvider` interface + `registry.ts` (the extension seam for future modules).
- `src/app/api/{github,config}/route.ts` — server aggregator + config CRUD; both gated by `auth()`.
- `src/components/` — `dashboard/`, `config/`, `ui/`, `auth/`. Client components fetch via `src/hooks/useGithubData.ts` (SWR).

## Conventions
- Ranking is pure and lives in `src/lib/ranking`; inject `now` (ms) so it stays testable. Change thresholds only in `rules.ts`.
- Server-only modules (`store.ts`, `provider.ts`, `registry.ts`) import `"server-only"` — never import them into client components.
- One bad repo must never fail the whole `/api/github` response; it becomes an entry in `errors[]`.
- Data routes are `dynamic = "force-dynamic"`. The standup route also sets `maxDuration = 60` for Anthropic calls.
- Storage is MongoDB Atlas; local and deployed share one database. Store functions take an optional trailing database-name argument used only by tests (`withTestDb`) — never pass it from application code.
- AI generation goes through the Anthropic API (`ANTHROPIC_API_KEY`). Every failure path must surface as `ClaudeUnavailableError` so `/api/standup` degrades to `{ aiError }` at HTTP 200 rather than a 500. Check `stop_reason` before reading `content` — a refusal can carry an empty array.

## Verify
`npm run typecheck && npm test && npm run build`. Unit tests cover ranking, GraphQL/notification
parsing (null alias, null default branch, bot activity, notification URL derivation), the login
allowlist, response-block extraction, and store round-trips. Store tests need `MONGODB_URI` in
`.env` / `.env.local` (loaded by `vitest.setup.ts`) and run against throwaway databases that they
drop afterwards; they skip themselves when it is absent. Full GitHub data flow (incl. the
notifications inbox) needs a real OAuth login.

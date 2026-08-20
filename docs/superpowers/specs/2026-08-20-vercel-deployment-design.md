# Vercel Deployment: Anthropic API + MongoDB Atlas — design

**Date:** 2026-08-20
**Status:** Approved (design presented in chat; user said "ok"). Ready for an implementation plan.

## Problem

The dashboard runs only on the user's machine. Two things tie it there:

1. **AI generation shells out to the local `claude` CLI.** `runClaude` spawns `claude -p` and deliberately strips `ANTHROPIC_API_KEY` so the call authenticates against the user's Max subscription via `CLAUDE_CODE_OAUTH_TOKEN`. There is no `claude` binary in a serverless runtime, and the subscription OAuth token is a personal CLI credential, not a server-side application credential.
2. **All state is JSON files under `data/`.** On Vercel the filesystem is read-only outside `/tmp` and does not survive between invocations, so writes vanish and reads return `ENOENT` — which `readConfig` silently swallows into `DEFAULT_CONFIG`. The deployed app would render an empty dashboard and lose every repo the user added.

A third issue surfaces only once deployed: on a public URL the GitHub OAuth flow accepts **any** GitHub account, not just the owner's.

## Solution in one line

Swap two implementations behind their existing interfaces — Claude CLI → Anthropic API, `fs` → MongoDB Atlas — then add a login allowlist and the deployment env wiring.

## Decisions (locked with the user)

| Question | Decision |
|---|---|
| Storage backend | **MongoDB Atlas** (M0 free tier) |
| Local vs production data | **Same cluster, same database** — one shared dataset |
| Access control | **Single-username allowlist** in the NextAuth `signIn` callback, via `ALLOWED_GITHUB_LOGIN` |
| Existing local data | **Migrated once** by a script; `data/` left in place as backup |
| Layering | **Swap module internals, keep interfaces** — API route call sites unchanged |
| AI model | Unchanged: from config, default `claude-sonnet-5` |
| Streaming | **No** — standup prose is short; non-streaming with `max_tokens: 16000` |
| Deploy + Atlas network config | **User performs**, not the implementation |

### Rejected alternatives

- **Vercel Blob / KV instead of Atlas.** Closest to the current file-shaped code, but gives no querying and no shared local/production dataset — and the roadmap points at more data sources (Gmail next), not fewer.
- **A `StorageAdapter` interface with file and Mongo implementations.** Builds a seam for a dual-store setup the user explicitly ruled out by choosing one shared database.
- **Querying Mongo directly from the API routes.** Scatters driver calls across the API layer and breaks the `server-only` boundary the project maintains.

## Architecture

Five modules change. The store and config call sites keep their exact signatures, so the API routes do not change *because of the storage swap* — but `route.ts` does take two small edits of its own, noted below.

```
src/lib/db/client.ts          [NEW]  cached MongoClient promise
src/lib/config/store.ts       [SWAP] fs -> config collection
src/lib/standup/store.ts      [SWAP] fs -> standupState + standupDays collections
src/lib/standup/generate.ts   [SWAP] spawn("claude") -> @anthropic-ai/sdk
src/auth.ts                   [EDIT] + signIn allowlist callback
scripts/migrate-to-atlas.ts   [NEW]  one-off data/ import
src/app/api/standup/route.ts  [EDIT] drop temp-file image dance; import listDaysWithPosted
```

The two `route.ts` edits are consequences of the swaps, not of the interfaces: the screenshot handler no longer needs a temp file, and `listDaysWithPosted` moves into the store module where it can be one query.

### Connection handling

Serverless opens a new connection per cold invocation, and Next.js dev HMR re-evaluates modules on every edit. Both are handled by a single module-level cached promise:

```ts
// src/lib/db/client.ts — shape only
let clientPromise: Promise<MongoClient> | undefined;
export function getDb(): Promise<Db>;   // memoized; reuses across warm invocations
```

The client is created once per process and reused. `MONGODB_URI` is read from the environment; the module is `server-only`.

### Data model

One database, three collections. Documents keep their current TypeScript shapes (`AppConfig`, `StandupState`, `StandupDay`) so no serialization layer is needed.

| Collection | `_id` | Document | Replaces |
|---|---|---|---|
| `config` | `"app"` | `AppConfig` | `data/config.json` |
| `standupState` | `"state"` | `StandupState` | `data/standup-state.json` |
| `standupDays` | `"YYYY-MM-DD"` | `StandupDay` | `data/standups/*.json` |

Singleton documents use a fixed `_id` and `replaceOne({_id}, doc, {upsert: true})`, preserving the atomic-overwrite semantics the file store got from write-temp-then-rename.

`StandupDay.date` duplicates `_id`. Keep the field so the existing type and all read paths stay unchanged; `_id` is what queries sort and range over.

### Query improvements this unlocks

`listDaysWithPosted` currently calls `listDays()` and then `readDay()` once per date purely to read a `postedAt` flag — an N+1 that grows with history. It collapses to one projection:

```ts
db.collection("standupDays")
  .find({}, { projection: { _id: 1, postedAt: 1 } })
  .sort({ _id: -1 })
```

`listDaysWithPosted` moves into the store module and returns the tagged list directly.

The week/month rollup at `route.ts:163` currently lists dates and then issues a read per date. It becomes `recentDays(limit)` — one sorted, limited query returning whole documents.

Between them these two cover every caller, so the bare `listDays` date list is dropped rather than kept as dead code.

### AI generation

`generate.ts` keeps its public surface so `route.ts` is untouched:

- `runClaude(prompt, model, imagePath?)` → `generateText(prompt, model, imageBase64?)`
- `ClaudeUnavailableError` is retained by name and still carries a short message.

Implementation uses `@anthropic-ai/sdk` with `client.messages.create`, `max_tokens: 16000`. `buildClaudeArgs` and its tests are deleted — CLI argv construction no longer exists.

The screenshot path gets **simpler**. Today `route.ts` base64-decodes `body.dataUrl`, writes a temp PNG, passes the path so the CLI's Read tool can open it, and unlinks in a `finally`. Over the API the base64 goes straight in as an `image` content block, so the temp-file write, the `--allowedTools Read` flag, and the `withImage` prompt suffix all disappear.

Failure mapping — every case must land on the existing `aiError` envelope so the UI degrades exactly as it does now:

| Condition | Handling |
|---|---|
| Missing/invalid `ANTHROPIC_API_KEY` (`AuthenticationError`) | `ClaudeUnavailableError` → `{ aiError }`, HTTP 200 |
| `RateLimitError` (429) | `ClaudeUnavailableError` → `{ aiError }`, HTTP 200 |
| `stop_reason: "refusal"` | `ClaudeUnavailableError` before reading `content` |
| `APIConnectionError` / timeout | `ClaudeUnavailableError` |
| Anything else | rethrown → HTTP 500, as today |

Checking `stop_reason` before touching `content[0]` matters: on a refusal `content` can be empty, and indexing it would throw a 500 where the UI expects a soft `aiError`.

### Auth and access control

A `signIn` callback in `src/auth.ts` compares the GitHub `profile.login` against `ALLOWED_GITHUB_LOGIN` and returns `false` on mismatch, so a non-owner is rejected at the OAuth callback and never reaches the dashboard. Comparison is case-insensitive (GitHub logins are case-preserving but not case-sensitive).

If `ALLOWED_GITHUB_LOGIN` is unset the callback **denies all logins** rather than allowing them. A missing env var in production must fail closed.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `AUTH_SECRET` | both | NextAuth session encryption |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | both | OAuth app credentials |
| `AUTH_URL` | Vercel | `https://<app>.vercel.app`; must match the registered callback URL |
| `ALLOWED_GITHUB_LOGIN` | both | Login allowlist (fails closed) |
| `MONGODB_URI` | both | Atlas connection string, including database name |
| `ANTHROPIC_API_KEY` | both | Anthropic API auth; marked Sensitive in Vercel |

`.env.example` and the README setup section are updated to match.

### Function duration

The standup `generate` and `rollup` actions call the Anthropic API and can exceed Vercel's default function timeout. `export const maxDuration = 60` is set on the standup route (60s is the ceiling on Vercel's Hobby plan; raise it if the account is on Pro). The old 120-second CLI timeout is replaced by the SDK's own request timeout, set to 50s — deliberately below `maxDuration` so a slow call surfaces as a soft `aiError` rather than a platform-level function kill with no response body.

## Migration

`scripts/migrate-to-atlas.ts`, run once via `npm run migrate:atlas`:

1. Read `data/config.json`, `data/standup-state.json`, `data/standups/*.json`.
2. Validate config through `configSchema` — the same gate the API uses.
3. Upsert into `config`, `standupState`, `standupDays`.
4. Report counts written.

Idempotent: re-running upserts the same `_id`s. `data/` is left untouched as a backup and stays gitignored.

Current volume to migrate: 33 monitored repos, 21 tracked items, 4 standup days.

## Testing

- **Unchanged:** ranking, GraphQL/notification parsing, prompt builders, window/classify/items — all pure, all still covered.
- **Deleted:** `buildClaudeArgs` tests, along with the function.
- **New:** store round-trip tests (`writeConfig` → `readConfig`, `writeDay` → `readDay` → `listDays` ordering, `listDaysWithPosted` flags) against the real database, cleaning up the `_id`s they create.
- **New:** `signIn` allowlist — allows the configured login, rejects another, rejects when the env var is unset.
- **Verification gate:** `npm run typecheck && npm test && npm run build` must pass before handover.

Full GitHub data flow still needs a real OAuth login, as it does today.

## Out of scope

- Running `vercel deploy` and changing Atlas Network Access — the user performs both.
- Multi-user support. The allowlist is one login; nothing else in the app is user-scoped.
- Background jobs, scheduled standups, or push notifications.
- Migrating the GitHub module or Home overview — they are read-through and hold no state.

## Risks

| Risk | Mitigation |
|---|---|
| Vercel has no static egress IP on lower plans, forcing Atlas Network Access to `0.0.0.0/0` | Scoped database user with a strong password; `MONGODB_URI` is the only credential and lives in Vercel env, never in git |
| Per-token API billing replaces flat subscription cost | Usage is a handful of short prompts per day; model stays configurable so it can be lowered |
| Cold-start connection latency (~100–300ms) | Cached client promise; only cold invocations pay it |
| Local and production share one dataset — a local experiment writes real history | Accepted deliberately by the user in exchange for a single source of truth |
| `data/` and Atlas silently diverge after migration | File store is deleted, not left as a fallback; only the migration script reads `data/` |

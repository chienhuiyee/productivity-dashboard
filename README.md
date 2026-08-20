# Productivity Dashboard

A local, single-user web dashboard that tells you **what needs your attention right now** across
your GitHub repos. The first module answers three questions at a glance:

- **Which repos have open pull requests?** — with a link, a copy-URL button, how long each PR has
  been open, and who was last active on it. PRs where *your* review is requested are highlighted.
- **Is any `main` branch broken?** — repos whose default branch has a failing GitHub Actions run,
  and how long it's been failing.
- **What should I look at first?** — a rule-based focus summary at the top, ordered by urgency.

GitHub is module one. The code is structured so future modules (email, tasks, calendar) can plug in
alongside it (see `src/lib/modules/`).

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Register a GitHub OAuth App (one time)

Go to **https://github.com/settings/developers → OAuth Apps → New OAuth App** (a *classic* OAuth
App, **not** a "GitHub App"). Set:

- **Homepage URL:** `http://localhost:3000`
- **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github` (must match exactly)

Create it, copy the **Client ID**, and generate a **Client Secret**.

> Classic OAuth App tokens don't expire, so there's no refresh handling. The app requests the
> `repo` scope so it can read private repos and their Actions. If a repo lives in a SAML-SSO org,
> authorize the token for that org from the app's authorization screen.

### 3. Create `.env.local`

```bash
cp .env.example .env.local
npx auth secret   # fills in AUTH_SECRET
```

Then fill in the rest:

```
AUTH_SECRET=...            # from `npx auth secret`
AUTH_GITHUB_ID=...         # OAuth App Client ID
AUTH_GITHUB_SECRET=...     # OAuth App Client Secret
ALLOWED_GITHUB_LOGIN=...   # your GitHub login — only this account may sign in
MONGODB_URI=...            # MongoDB Atlas connection string
ANTHROPIC_API_KEY=...      # https://console.anthropic.com/
```

`ALLOWED_GITHUB_LOGIN` is required. It is the only thing stopping another GitHub account from
signing in once the app is reachable on a public URL — and if it is unset, every sign-in is
rejected rather than allowed.

`MONGODB_URI` points at a MongoDB Atlas cluster (the free M0 tier is enough). Local development
and the deployed app share one database, so a standup generated locally shows up on the deployed
app and vice versa. If the URI has no database in its path, `dashboard` is used.

`ANTHROPIC_API_KEY` powers standup generation. This is per-token API billing, not a Claude
subscription.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in with GitHub, then go to **Configure** to add the repos you want
to monitor (as `owner/repo`, one or many at a time).

## Deploying to Vercel

1. **MongoDB Atlas** — create a cluster (M0 is enough) and a database user. Under *Network Access*,
   allow `0.0.0.0/0`: Vercel has no static egress IP on Hobby/Pro, so the connection string plus a
   strong database password is what protects the data.

2. **Migrate existing local data** (once, from your machine):

   ```bash
   npm run migrate:atlas
   ```

   Upserts `data/config.json`, `data/standup-state.json`, and `data/standups/*.json` into Atlas.
   Safe to re-run; `data/` is left in place as a backup.

3. **GitHub OAuth App** — add the deployed callback URL:
   `https://<your-app>.vercel.app/api/auth/callback/github`. A classic OAuth App has a single
   callback URL, so preview deployments (which get their own URLs) can't complete sign-in — use
   the production URL.

4. **Vercel environment variables** — set every variable from `.env.example`, with `AUTH_URL`
   pointing at the deployed URL. Mark `ANTHROPIC_API_KEY`, `MONGODB_URI`, `AUTH_SECRET`, and
   `AUTH_GITHUB_SECRET` as Sensitive. **Paste values without surrounding quotes** — Vercel takes
   them literally, and a quoted connection string fails with `MongoParseError: Invalid scheme`.

5. **Deploy** — `vercel deploy --prod`, or push to the connected branch.

### Cost note

Standup generation moves from a Claude Max subscription to per-token API billing. Usage is a
handful of short prompts a day; the model is configurable in Settings if you want to trade
quality for cost.

## Access from another device (Tailscale)

Browsers only allow the copy-to-clipboard buttons in a "secure context" (HTTPS or localhost), so the
nicest way to use the dashboard from another machine is Tailscale's built-in HTTPS proxy:

1. In the Tailscale admin console (**DNS** page), enable **MagicDNS** and **HTTPS Certificates**.
2. Proxy your tailnet HTTPS URL to the dev server (runs via the daemon, persists across restarts):
   ```bash
   tailscale serve 3000
   ```
   This makes `https://<machine>.<tailnet>.ts.net` forward to `localhost:3000` — TLS terminated by
   Tailscale with a valid cert, no port in the URL. Check it with `tailscale serve status`; undo with
   `tailscale serve reset`.
3. Register the GitHub OAuth **callback** as `https://<machine>.<tailnet>.ts.net/api/auth/callback/github`
   and set `AUTH_URL` to `https://<machine>.<tailnet>.ts.net` in `.env.local` (see `.env.example`).
4. Run `npm run dev` as usual — localhost binding is fine, since Tailscale connects to it on the same
   machine — and open the `https://…ts.net` URL from any device on your tailnet.

Because it's real HTTPS, the copy buttons work everywhere and session cookies are properly secure. A
classic OAuth App has a single callback URL, so use this HTTPS URL from every device, including the
host machine.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on :3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run unit tests (ranking, parsing, stores, allowlist) |
| `npm run lint` | ESLint |
| `npm run migrate:atlas` | One-off import of `data/*.json` into MongoDB Atlas |

## How it works

- **Auth** (`src/auth.ts`) — NextAuth v5 with the GitHub provider; the OAuth token is kept in the
  encrypted JWT and used server-side.
- **Config** (`src/lib/config/`) — your monitored repo list, validated with zod and stored as a
  single document in MongoDB Atlas. `data/` holds the pre-migration backup and stays gitignored
  (it can contain private repo names).
- **Storage** (`src/lib/db/`) — one cached `MongoClient` shared across warm serverless invocations
  and dev HMR. Three collections: `config`, `standupState`, `standupDays` (keyed by date).
- **Fetch** (`src/lib/github/`) — one batched GraphQL query per ~10 repos (open PRs + default-branch
  CI), run in parallel chunks. One unreachable repo becomes an inline error, never a whole-page
  failure.
- **Ranking** (`src/lib/ranking/`) — pure, unit-tested scoring; all thresholds live in `rules.ts`.
- **API** (`src/app/api/github`) — aggregates fetch + ranking behind a 90s in-memory cache; the
  dashboard auto-refreshes (default 5 min, configurable) and the Refresh button forces a fresh pull.

## Data & privacy

Single-user by design: only the GitHub account named in `ALLOWED_GITHUB_LOGIN` can sign in, and an
unset value rejects every login rather than allowing all of them.

Your GitHub token stays in the encrypted session cookie and is used only to call `api.github.com` —
it is never stored in the database or sent to Anthropic.

Two things do leave your machine:

- **MongoDB Atlas** holds your monitored repo list, tracked items, and standup history — including
  private repo names. Because Vercel has no static egress IP, Atlas network access is open to the
  internet and the connection string is what guards it. Treat it as a credential.
- **The Anthropic API** receives your standup facts (repo names, PR titles, your notes, and any
  screenshot you paste) in order to phrase the standup. Nothing else is sent, and the AI step is
  optional — the factual bullets still render when it is unavailable.

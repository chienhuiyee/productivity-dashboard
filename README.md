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

Then paste your Client ID / Secret:

```
AUTH_SECRET=...            # from `npx auth secret`
AUTH_GITHUB_ID=...         # OAuth App Client ID
AUTH_GITHUB_SECRET=...     # OAuth App Client Secret
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in with GitHub, then go to **Configure** to add the repos you want
to monitor (as `owner/repo`, one or many at a time).

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
| `npm test` | Run unit tests (ranking + GraphQL parsing) |
| `npm run lint` | ESLint |

## How it works

- **Auth** (`src/auth.ts`) — NextAuth v5 with the GitHub provider; the OAuth token is kept in the
  encrypted JWT and used server-side.
- **Config** (`src/lib/config/`, `data/config.json`) — your monitored repo list, validated with zod
  and written atomically. `data/` is gitignored (it can contain private repo names).
- **Fetch** (`src/lib/github/`) — one batched GraphQL query per ~10 repos (open PRs + default-branch
  CI), run in parallel chunks. One unreachable repo becomes an inline error, never a whole-page
  failure.
- **Ranking** (`src/lib/ranking/`) — pure, unit-tested scoring; all thresholds live in `rules.ts`.
- **API** (`src/app/api/github`) — aggregates fetch + ranking behind a 90s in-memory cache; the
  dashboard auto-refreshes (default 5 min, configurable) and the Refresh button forces a fresh pull.

## Data & privacy

Everything runs locally. Your token lives in a cookie in your browser and is used only to call
`api.github.com`. Nothing is sent anywhere else.

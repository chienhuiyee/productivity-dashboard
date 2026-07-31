# Daily Standup Assistant — design

**Date:** 2026-07-29
**Status:** Approved (design validated with the user via an interactive mockup; user said "proceed"). Ready for an implementation plan.
**Mockup:** https://claude.ai/code/artifact/c9353f39-9716-41d6-bc08-f6fe1c958d26

## Problem

Every day at standup the user has to announce, from memory, what they did yesterday and what they'll do today. They forget items and under-report. They want a tool that (a) tracks what they've been doing, (b) shows how long they've been on things, and (c) suggests what to do next — and lets them look back over past days.

## Solution in one line

A new **Standup** page that gathers the user's GitHub activity deterministically, mixes in typed/tracked manual items (with follow-ups and scheduling), and has Claude turn it all into a speakable **Yesterday / Today** blurb — with a browsable history and week/month roll-ups.

## Guiding principle: deterministic backbone + AI polish

Facts are gathered deterministically from GitHub and from stored items. The AI (Claude) only **phrases** those facts and (for screenshots) **extracts candidate items the user confirms**. It never invents work. If the AI step is unavailable, the factual bullets still render — the page stays useful.

## Decisions (locked with the user)

| Question | Decision |
|---|---|
| Source of "what I did" | **GitHub auto + manual add** |
| Duration / "how long" | **Days-on-task (auto)** from GitHub timestamps; no hour estimates |
| How the standup text is produced | **AI-generated prose** |
| AI auth + model | **Max subscription via Claude Code headless**; default **Sonnet 5**, configurable |
| Consumption + history | **Dedicated Standup page**; keep history **indefinitely**; **browse past days + AI week/month roll-up** |
| Manual items | **Tracked items**: auto-typed, status lifecycle, type-aware follow-ups, follow-up chains |
| Scheduling | Natural-language time parsing ("tomorrow 3 pm") via **chrono-node** → `scheduledFor` |
| Screenshot → items | Paste an image → **vision model extracts candidate items** the user confirms |
| Follow-up delivery | **Surfaced on the Standup page** each day (no background push in v1) |

## Feature detail

### 1. "Yesterday" — deterministic GitHub facts
One GraphQL call to `viewer.contributionsCollection(from, to)` across **all** the user's repos (private included via the existing `repo` scope), extracting: PRs merged / opened / closed, PRs reviewed, commit counts per repo, issues opened / closed. Plus any tracked items resolved as **done** in the window, plus manual notes.

### 2. "Today" — suggestions (reuse existing focus logic)
- **In progress:** the user's open PRs, each with **days-on-task** (from PR/first-activity timestamps).
- **Needs your review**, **Waiting on you** (notifications), **Failing main** — reuse the data the dashboard already computes.
- **Open tracked items** (incl. scheduled items due today) and **carry-over** (items planned but not resolved).

### 3. Tracked items (the manual side)
A manual entry becomes a first-class, persisted item:
- **Auto-typed** by keyword (`meeting` / `review` / `task`; default `task`) — instant, offline, correctable chip.
- **Status lifecycle:** `open → done | dropped`; `carry` keeps it open and increments its day count.
- **Type-aware follow-up:** each open item resurfaces on the Standup page with a prompt suited to its type (meeting → "happen? follow-up?"; task → "done? still on it?").
- **Follow-up chains:** "+ Follow-up" spawns a linked child item (e.g. "Meeting with hck (2nd)") via `parentId`.
- Done items feed **Yesterday**; open/scheduled items feed **Today**.

### 4. Scheduling (natural language)
Entry text is run through **chrono-node** (deterministic, offline) to extract a datetime: "meeting with hck tomorrow 3 pm" → title "meeting with hck", type `meeting`, `scheduledFor` = tomorrow 15:00 (parsed in the user's **local timezone**). Scheduled items stay out of the way until **due**, then surface under Today; their follow-up activates **after** the scheduled time.

### 5. Screenshot → items (vision)
Pasting an image into the add area (Slack thread, Jira board, meeting notes) sends it to a **vision-capable Claude model**, which extracts candidate items. Each extracted item is a **draft the user confirms/edits** before it persists (grounding). Auto-typing and time-parsing apply to extracted items too.

**Mechanism (verified):** write the pasted image to a temp file; invoke Claude Code headless `--bare -p "<extract prompt>" <tempfile> --allowedTools Read --output-format json` with `CLAUDE_CODE_OAUTH_TOKEN` and `--model claude-sonnet-5`. Claude reads the image via its Read tool. Delete the temp file after. Limits: ≤10 MB, ≤8000×8000 px, PNG/JPG/GIF/WebP.

### 6. History + roll-ups
A **History** view on the Standup page: pick any past day to re-read its saved report, plus an on-demand **week / month roll-up** the AI builds from the stored day records ("This week: merged 14 PRs across 5 repos, 6 meetings, shipped RBAC…"). Retention: **keep everything** (a year is a few hundred KB); an optional "archive older than N months" setting can come later.

### 7. Generation + output
A **Generate** button assembles the deterministic facts + items into a prompt and calls Claude (Sonnet 5) via the subscription; the result is an **editable** Yesterday/Today block with a **Copy** button. Regenerate re-runs it. User edits are saved to that day's record.

## AI invocation (Claude Code headless, Max subscription)

- Auth: `CLAUDE_CODE_OAUTH_TOKEN` (from a one-time `claude setup-token`) in `.env` (gitignored). **No `ANTHROPIC_API_KEY`** (it would take precedence and bill per-token).
- Invocation: `execFile("claude", ["--bare", "-p", "--output-format", "json", "--model", <model>, ...])`, prompt/data passed over **stdin** (text) or as a **temp file path** (images) — never string-interpolated into a shell — to avoid injection.
- **User-triggered only** (Generate / Derive / Roll-up clicks); no unattended/background calls.
- Model configurable via `settings.standup.model` (default `claude-sonnet-5`).
- **Graceful fallback:** if `claude` is missing / not logged in / errors, the API returns the deterministic facts with an `aiError` flag; the page shows the factual bullets + a one-line setup hint (`claude setup-token`).

## Persistence

Local files under `data/` (gitignored, `server-only`, atomic writes — same pattern as `config.json`), on the user's machine only:
- `data/standups/YYYY-MM-DD.json` — one file per day: window, GitHub facts snapshot, manual notes, resolved items, generated text (+ user edits).
- `data/standup-state.json` — live tracked items (open across days) + scheduled items.

## Architecture / new code

- `src/lib/standup/`
  - `types.ts` — `TrackedItem { id, text, type, status, createdAt, updatedAt, scheduledFor?, parentId? }`, `StandupDay`, `StandupFacts`. (Day-count is **derived** from `createdAt` at render time, never stored, so it can't go stale.)
  - `window.ts` — compute the standup window: **since the last working day** (Mon covers Fri+weekend), with an explicit override; working days from settings (default Mon–Fri). Pure, `now` injected.
  - `collect.ts` — turn GitHub contributions + tracked items into `StandupFacts` (pure grouping; unit-tested).
  - `classify.ts` — keyword type classifier + `chrono-node` schedule parsing (pure; unit-tested).
  - `prompt.ts` — build the generation / roll-up / image-extract prompts (pure; unit-tested).
  - `generate.ts` — invoke Claude Code headless (text + image), parse JSON, handle failure (`server-only`).
  - `store.ts` — atomic read/write of the day files + state file (`server-only`).
- `src/lib/github/contributions.ts` — the `viewer.contributionsCollection` query + defensive parse (pure parse unit-tested, mirroring `fetchRepos`).
- `src/app/api/standup/route.ts` — `GET` (today's draft + open items + recent history) · `POST` (actions: `generate`, `deriveImage`, `rollup`) · `PUT` (add/update item, resolve/carry/drop, save notes, save edited text). Gated by `auth()`; `dynamic = "force-dynamic"`.
- `src/app/standup/page.tsx` + `src/components/standup/` — Today (follow-ups, add item + paste, generate + prose, facts) and History (day list, day detail, roll-up).
- Header: a **Standup** link/nav alongside Configure.
- Config: `settings.standup { model: "claude-sonnet-5", workingDays: [1,2,3,4,5] }` added to the zod schema (backward-compatible defaults).

## Out of scope (v1)

- Proactive push/notification reminders (follow-ups are pull, on the page).
- Auto-creating Google Calendar events from scheduled items (natural once the calendar module lands).
- Hour-level time tracking (only days-on-task).
- Non-Claude providers.
- Editing/trends beyond the week/month roll-up.

## Open items to confirm at build time

1. **Vision billing under Max:** docs don't explicitly state whether programmatic **vision** counts under the Max subscription or needs API billing. Volume is ~1–3/day (negligible). Fallback if needed: an `ANTHROPIC_API_KEY` used **only** for the screenshot-extract step, everything else stays on the subscription. Confirm early.
2. Exact `claude` model id string at build time (default `claude-sonnet-5`).

## Verification plan

- Unit tests (pure, `now` injected): `window.ts` (weekend rule + override), `collect.ts` (grouping), `classify.ts` (types + chrono parsing incl. "tomorrow 3 pm", "next friday 10:30"), `contributions.ts` parse (empty, private, multi-repo), `prompt.ts` (shape).
- `npm run typecheck && npm test && npm run lint && npm run build` must pass.
- Live paths (need a real login + Claude Code): the GitHub contributions fetch, `generate`, `deriveImage`, and `rollup` — exercised manually; the code degrades gracefully when the AI is unavailable.

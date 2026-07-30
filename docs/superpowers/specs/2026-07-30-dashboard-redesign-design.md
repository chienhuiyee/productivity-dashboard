# Dashboard redesign — design spec

**Date:** 2026-07-30
**Status:** Approved direction (interactive mock reviewed and accepted)
**Mock:** https://claude.ai/code/artifact/204ba6bc-0a3c-4ca7-a585-6ff5fcbb8944

## Goal

Redesign the whole web app into a calm, responsive daily driver: a tool the user *looks
forward to opening*. The organizing idea is **glance-and-act on Home, drill in when needed**.
The user opens Home every morning, understands their day in one plain-language sentence, clears
the urgent items inline, and only visits a dedicated page when they want to do more (filter PRs,
browse standup history, edit config).

This is an evolution, not a teardown. The existing design system — warm sage-neutral palette,
Fraunces/Hanken/Geist type roles, and the "status shown by a dot **and** a word" convention — is
good and is preserved. What changes is the information architecture and layout.

## Design decisions (locked)

- **Vibe:** refined calm — evolve the current warm-editorial look, elevate hierarchy and polish.
- **Layout:** persistent left sidebar + wide canvas; collapses to a bottom tab bar on mobile.
- **Daily hook:** a morning-briefing masthead — greeting + one generated plain-language sentence
  summarizing the day + a single primary action.
- **Product name:** stays "Productivity Dashboard." No rename.
- **"I'm caught up" control:** collapses the briefing for the rest of the local day.

## Information architecture

Four routes. Home is the overview; the rest are the deep views.

| Route      | Purpose                                                                 |
|------------|-------------------------------------------------------------------------|
| `/`        | **Home** — morning briefing + "Needs you today" action queue + your open work + today's standup mini. Act without leaving. |
| `/github`  | **GitHub** — the current deep dashboard: stat tiles that filter a tabbed list (PRs / Actions / Notifications). |
| `/standup` | **Standup** — today's builder (facts, tracking, generated prose, mark-as-posted) + history. |
| `/config`  | **Configure** — watched repos + preferences + account.                  |

**Routing change:** today `/` *is* the deep GitHub dashboard. The deep dashboard moves to
`/github`, and `/` becomes the new Home overview. `/standup` and `/config` keep their routes.

## Layout system

**App shell** (new): a two-column CSS grid — a sticky ~232px sidebar rail and a fluid canvas. The
canvas centers content at `max-width: 1080px`. The shell wraps all four pages so navigation is one
click and the app has a fixed home base (it now reads as an app, not a report).

- **Sidebar:** brandmark, primary nav (Home / GitHub / Standup / Configure) with a live count
  badge on GitHub (actionable "waiting on you" total), and a footer with theme toggle + account.
- **Mobile (≤860px):** sidebar is replaced by a fixed bottom tab bar (thumb-reachable, safe-area
  aware). The GitHub tab shows a small dot when items are waiting. Canvas padding tightens; the
  Home two-column band and GitHub tiles reflow to a single/2-up column.

The current top-header + segmented-nav (`AppHeader`) is retired in favor of the sidebar.

## Design tokens

Reuse the existing tokens in `src/app/globals.css` verbatim — no palette change. For reference:

- **Neutrals/accent:** ground `#f4f3ee` / surface `#fdfcfa` / ink `#2a2823` / muted `#6b675e` /
  border `#e4e0d7` / accent pine `#2f7d6e` (dark-mode variants already defined).
- **Semantic status** (separate from the accent, each paired with a label, never color alone):
  amber, orange, red, rose, plus a green for "all clear."
- **Type roles:** Fraunces (serif display — greetings, section heads, briefing lead),
  Hanken Grotesk (body/UI), Geist Mono (numerics, repo slugs, counts). All already loaded via
  `next/font` in `layout.tsx`.

New shared primitives the redesign introduces (small additions, same token vocabulary): a soft
two-tier shadow (`--shadow`, `--shadow-lift`), and a severity left-stripe on priority rows.

## Page detail

### Home (`/`)

1. **Briefing masthead (signature).** Date eyebrow · `Good morning, chien.` · one serif *lead*
   sentence generated deterministically from focus data (e.g. *"Three things need you this
   morning. Every main branch is green — start with the review Dan's been waiting on."*) · a
   primary action button pointing at the single most urgent item · an "I'm caught up" secondary
   that collapses the briefing for the day. Below a hairline: a row of at-a-glance status pills
   (Waiting / Failing / Your review / Conflicts / Aging / Open PRs).
2. **Needs you today** — a priority queue. Each row = a severity stripe + kind chip + title +
   repo/why meta + an inline action button (Review / Open / Resolve). This is where the user acts
   without navigating. Sourced from ranked focus items; a "See all in GitHub" link drills in.
3. **Two-column band:**
   - **Your open work** — the user's in-progress PRs with day-counts.
   - **Today's standup** — draft Yesterday/Today bullets, a quick-add input, and
     "Open standup" / "Copy" actions.
4. **Meta footer** — "updated N ago · API points left" + a Refresh button.

### GitHub (`/github`)

The current dashboard, moved and reskinned into the shell. Stat tiles (`AnalysisPanel`) filter a
tabbed detail (`TabbedDetail`: Pull requests / Actions / Notifications). Behavior is unchanged;
only the surrounding chrome and spacing update. PR rows show branch, author, last activity, and
reason chips. Actions tab keeps the "all main branches green" empty state.

**Existing capabilities that MUST be preserved** (present in today's app — do not drop in the
reskin):

- **Text filter** — a live search box above the PR list, matching title / repo / branch. The
  Copy-all count reflects the filtered subset.
- **Sort control** — a dropdown (Most urgent / Newest / Oldest / Least active); default "Most
  urgent" uses the existing ranking score.
- **Copy** — a per-row Copy button (copies the PR URL) and a "Copy all (N)" button (copies the
  currently visible/filtered list). Both reuse the existing `CopyButton` component and its
  copied-state confirmation; N updates with the filter.

These carry over to the Home "Needs you today" rows and the standup mini as well: copy actions use
the same `CopyButton`, and the standup keeps its existing copy-the-prose action.

### Standup (`/standup`)

Existing standup flow, reskinned into the shell: facts grid, tracking list (meeting/review/task
with scheduled times and done toggles), generated prose (Yesterday/Today), mark-as-posted, and
history. Reuses the existing standup components; only presentation changes.

### Config (`/config`)

Watched-repo chips with add/remove, preferences (refresh interval, appearance, briefing on/off),
and account (signed-in identity + sign out). Reuses `ConfigManager`/`RepoPicker`.

## The briefing sentence

A **pure, deterministic** function — no LLM call — consistent with the codebase's ranking
convention (pure, `now` injected, unit-tested). It takes the already-computed focus items +
counts and composes one short sentence: a lead clause about how many things need attention, a
clause about main-branch health, and a pointer to the top-ranked item. Deterministic keeps Home
instant and testable; the standup page keeps the LLM prose generation it already has. Empty state:
a genuine "You're all clear — nothing needs you right now."

Lives in `src/lib/home/briefing.ts` with a `briefing.test.ts` beside it.

## States

Every page handles: **loading** (skeleton matching the final layout), **empty** (invitational
copy, e.g. no repos configured → link to Config; nothing waiting → all-clear), and **error** (one
bad repo never fails the page — it stays an `errors[]` entry rendered as a dismissible notice, per
the existing invariant).

## Accessibility & quality floor

- Status is never color-only — always a dot **and** a word (existing convention, kept).
- Visible keyboard focus on every interactive element; nav uses `aria-current`, tabs use
  `role="tab"`/`aria-selected`, tiles use `aria-pressed`.
- `prefers-reduced-motion` respected; motion limited to a page-load fade and hover lifts.
- Both light and dark themes designed to equal care; no-flash theme script kept.
- Responsive to mobile with a real bottom-nav pattern, not a squashed sidebar.

## Component inventory (implementation shape)

New:
- `src/components/layout/AppShell.tsx`, `Sidebar.tsx`, `MobileNav.tsx`
- `src/components/home/Briefing.tsx`, `NeedsYouQueue.tsx`, `OpenWork.tsx`, `StandupMini.tsx`,
  `GlancePills.tsx`
- `src/lib/home/briefing.ts` (+ test), plus a small selector that derives the Home view-model
  (needs-you items, open work) from `GithubData` + standup facts.

Changed / moved:
- `src/app/page.tsx` → Home overview; deep dashboard moves to `src/app/github/page.tsx`.
- `AppHeader` retired; `DashboardClient`, `AnalysisPanel`, `TabbedDetail` re-homed under the shell
  on `/github` (logic unchanged).
- Standup and Config pages re-parented into the shell (presentation only).

Server/client boundaries and the `SourceProvider`/ranking layers are untouched — this is a
presentation-and-routing change, so `server-only` modules and the pure ranking core stay put.

## Out of scope

- No changes to ranking thresholds (`rules.ts`), the GitHub/notifications fetch layer, the
  standup fact/prose logic, or auth.
- No new data sources (the Gmail module remains future work).
- No rename of the product.

## Verification

- `npm run typecheck && npm test && npm run build` stays green.
- New pure logic (`briefing.ts`, the Home view-model selector) is unit-tested.
- Manual: sign in, confirm Home briefing/queue reflect real data, drill into each page, exercise
  loading/empty/error states, toggle theme, and check the mobile bottom-nav layout.
- Regression check on preserved GitHub features: the PR filter narrows the list, the sort
  dropdown reorders, and per-row Copy + "Copy all (N)" copy the right content with N tracking the
  filter.

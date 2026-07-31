# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the app into a persistent-sidebar shell with a morning-briefing Home overview (glance-and-act), moving the current dashboard to `/github`, while preserving all existing GitHub features.

**Architecture:** This is a presentation-and-routing change. A new client `AppShell` (sidebar + mobile bottom-nav) wraps every route from the root layout. `/` becomes a new Home that composes small presentational components fed by pure selector/briefing functions derived from the existing `GithubData`. The deep dashboard moves verbatim to `/github`. Standup and Config are re-parented into the shell. No changes to the fetch layer, ranking rules, standup logic, or auth.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · SWR · Vitest · lucide-react.

## Global Constraints

- **Next.js 16 App Router is not the Next.js you know.** Before writing route/layout code, read the relevant guide under `node_modules/next/dist/docs/` (per `AGENTS.md`).
- Reuse the existing design tokens in `src/app/globals.css` verbatim — **no palette change**. Product name stays **"Productivity Dashboard"**.
- Status is shown by a **dot AND a word**, never color alone (existing convention).
- Ranking is pure with `now` injected; **do not change** `src/lib/ranking/rules.ts`.
- Server-only modules import `"server-only"` and are never imported into client components.
- One bad repo must never fail the page — it stays an `errors[]` entry.
- Data routes are `export const dynamic = "force-dynamic"`.
- All copy-to-clipboard uses the existing `src/components/ui/CopyButton.tsx`.
- **Preserve** the PR text filter, sort dropdown, per-row Copy, and "Copy all (N)" — they already exist in `src/components/dashboard/PullRequestsWidget.tsx` and must keep working on `/github`.
- Respect `prefers-reduced-motion`; every interactive element has a visible keyboard focus state.
- **Testing note:** the repo has Vitest but **no React component testing library**. Pure logic (Tasks 1–3) is unit-tested with Vitest. UI tasks (4–6) are verified with `npm run typecheck && npm run build` plus the manual checklist in Task 7; do not invent a component-test harness.
- Verify gate for the whole plan: `npm run typecheck && npm test && npm run build`.

---

### Task 1: Shared glance-count logic

Extract the at-a-glance counts (today computed privately inside `AnalysisPanel`) into a pure, tested module both the GitHub tiles and the new Home pills can use.

**Files:**
- Create: `src/lib/github/glance.ts`
- Test: `src/lib/github/glance.test.ts`
- Modify: `src/components/dashboard/AnalysisPanel.tsx` (consume the new function; keep tile kinds/labels/tones/order in the component)

**Interfaces:**
- Produces: `interface GlanceCounts { waiting: number; failing: number; review: number; conflicts: number; aging: number; stale: number; openPrs: number }` and `function computeGlanceCounts(data: GithubData, now: number): GlanceCounts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/glance.test.ts
import { describe, expect, it } from "vitest";
import { computeGlanceCounts } from "./glance";
import type { GithubData, PullRequestItem, NotificationItem } from "./types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-30T09:00:00Z");

function pr(over: Partial<PullRequestItem>): PullRequestItem {
  return {
    repo: "acme/api", number: 1, title: "t", url: "u", isDraft: false,
    createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
    author: "you", mergeable: "MERGEABLE", headRef: "h", baseRef: "main",
    reviewRequestedForMe: false,
    lastActivity: { author: "you", at: new Date(NOW).toISOString(), isBot: false, kind: "commit" },
    ageMs: 0, score: 0, focusReasons: [], ...over,
  };
}
function notif(over: Partial<NotificationItem>): NotificationItem {
  return {
    id: "1", repo: "acme/api", repoUrl: "u", reason: "mention", reasonLabel: "mention",
    tier: "act", subjectType: "PullRequest", title: "t", url: "u", unread: true,
    updatedAt: new Date(NOW).toISOString(), ageMs: 0, score: 0, ...over,
  };
}
function data(over: Partial<GithubData>): GithubData {
  return {
    generatedAt: new Date(NOW).toISOString(), cached: false, viewer: "you", rateLimit: null,
    repoCount: 1, reposWithOpenPrs: 1, prs: [], actions: [], notifications: [],
    notificationsTruncated: false, focus: [], errors: [], ...over,
  };
}

describe("computeGlanceCounts", () => {
  it("counts review, conflicts, aging, stale, open PRs, ignoring drafts where the app does", () => {
    const prs = [
      pr({ reviewRequestedForMe: true }),
      pr({ mergeable: "CONFLICTING" }),
      pr({ createdAt: new Date(NOW - 4 * DAY).toISOString() }), // aging 3d+
      pr({ lastActivity: { author: "you", at: new Date(NOW - 3 * DAY).toISOString(), isBot: false, kind: "commit" } }), // stale 2d+
      pr({ isDraft: true, reviewRequestedForMe: true }), // draft: excluded from review/aging/stale
    ];
    const c = computeGlanceCounts(data({ prs }), NOW);
    expect(c.review).toBe(1);
    expect(c.conflicts).toBe(1);
    expect(c.aging).toBe(1);
    expect(c.stale).toBe(1);
    expect(c.openPrs).toBe(5);
  });

  it("counts waiting notifications (act + involved tiers) and failing actions", () => {
    const c = computeGlanceCounts(
      data({
        notifications: [notif({ tier: "act" }), notif({ id: "2", tier: "involved" }), notif({ id: "3", tier: "fyi" })],
        actions: [{ repo: "acme/api", repoUrl: "u", defaultBranch: "main", workflowName: null, runUrl: null, failingSince: null, failingForMs: null, score: 0 }],
      }),
      NOW,
    );
    expect(c.waiting).toBe(2);
    expect(c.failing).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/glance.test.ts`
Expected: FAIL — `computeGlanceCounts` is not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/glance.ts
import type { GithubData } from "./types";

const DAY = 86_400_000;

export interface GlanceCounts {
  waiting: number;
  failing: number;
  review: number;
  conflicts: number;
  aging: number;
  stale: number;
  openPrs: number;
}

/** At-a-glance counts for the GitHub tiles and the Home pills. Pure: `now` injected. */
export function computeGlanceCounts(data: GithubData, now: number): GlanceCounts {
  const active = data.prs.filter((p) => !p.isDraft);
  return {
    waiting: data.notifications.filter((n) => n.tier === "act" || n.tier === "involved").length,
    failing: data.actions.length,
    review: active.filter((p) => p.reviewRequestedForMe).length,
    conflicts: data.prs.filter((p) => p.mergeable === "CONFLICTING").length,
    aging: active.filter((p) => now - Date.parse(p.createdAt) >= 3 * DAY).length,
    stale: active.filter((p) => now - Date.parse(p.lastActivity.at ?? p.createdAt) >= 2 * DAY).length,
    openPrs: data.prs.length,
  };
}
```

- [ ] **Step 4: Refactor `AnalysisPanel` to consume it**

In `src/components/dashboard/AnalysisPanel.tsx`, replace the body of `computeTiles` so counts come from the shared function (keep the tile array shape, kinds, labels, tones, and order exactly as they are). Remove the now-unused `ACTIONABLE_REASONS`/`RULES` import if nothing else uses them in the file.

```ts
import { computeGlanceCounts } from "@/lib/github/glance";
// ...
function computeTiles(data: GithubData): Tile[] {
  const c = computeGlanceCounts(data, Date.now());
  return [
    { kind: "waiting", label: "Waiting on you", value: c.waiting, tone: c.waiting ? "orange" : "neutral" },
    { kind: "failing", label: "Failing main", value: c.failing, tone: c.failing ? "red" : "neutral" },
    { kind: "review", label: "Your review", value: c.review, tone: c.review ? "amber" : "neutral" },
    { kind: "conflicts", label: "Conflicts", value: c.conflicts, tone: c.conflicts ? "rose" : "neutral" },
    { kind: "aging", label: "Aging 3d+", value: c.aging, tone: c.aging ? "orange" : "neutral" },
    { kind: "stale", label: "Stale 2d+", value: c.stale, tone: c.stale ? "amber" : "neutral" },
    { kind: "open", label: "Open PRs", value: c.openPrs, tone: "neutral" },
  ];
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/lib/github/glance.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/github/glance.ts src/lib/github/glance.test.ts src/components/dashboard/AnalysisPanel.tsx
git commit -m "refactor(github): extract shared computeGlanceCounts"
```

---

### Task 2: Home selectors — needs-you queue and open work

Pure functions that turn `GithubData` into the two Home lists.

**Files:**
- Create: `src/lib/home/select.ts`
- Test: `src/lib/home/select.test.ts`

**Interfaces:**
- Produces:
  - `type NeedKind = "failing" | "waiting" | "review" | "conflict"`
  - `interface NeedItem { kind: NeedKind; title: string; repo: string; url: string; why: string }`
  - `function selectNeedsYou(data: GithubData, now: number): NeedItem[]`
  - `interface OpenWorkItem { title: string; repo: string; number: number; url: string; dayCount: number }`
  - `function selectOpenWork(data: GithubData, now: number): OpenWorkItem[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/home/select.test.ts
import { describe, expect, it } from "vitest";
import { selectNeedsYou, selectOpenWork } from "./select";
import type { GithubData, PullRequestItem } from "@/lib/github/types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-30T09:00:00Z");

function pr(over: Partial<PullRequestItem>): PullRequestItem {
  return {
    repo: "acme/api", number: 7, title: "PR title", url: "https://gh/pr/7", isDraft: false,
    createdAt: new Date(NOW - 2 * DAY).toISOString(), updatedAt: new Date(NOW).toISOString(),
    author: "you", mergeable: "MERGEABLE", headRef: "h", baseRef: "main",
    reviewRequestedForMe: false,
    lastActivity: { author: "you", at: new Date(NOW).toISOString(), isBot: false, kind: "commit" },
    ageMs: 0, score: 0, focusReasons: [], ...over,
  };
}
function data(over: Partial<GithubData>): GithubData {
  return {
    generatedAt: new Date(NOW).toISOString(), cached: false, viewer: "you", rateLimit: null,
    repoCount: 1, reposWithOpenPrs: 1, prs: [], actions: [], notifications: [],
    notificationsTruncated: false, focus: [], errors: [], ...over,
  };
}

describe("selectNeedsYou", () => {
  it("orders failing → waiting → review → conflict and fills each item's fields", () => {
    const items = selectNeedsYou(
      data({
        actions: [{ repo: "acme/api", repoUrl: "https://gh/api", defaultBranch: "main", workflowName: "CI", runUrl: "https://gh/run", failingSince: new Date(NOW - DAY).toISOString(), failingForMs: DAY, score: 0 }],
        notifications: [{ id: "1", repo: "acme/web", repoUrl: "u", reason: "mention", reasonLabel: "mention", tier: "act", subjectType: "PullRequest", title: "weigh in?", url: "https://gh/n1", unread: true, updatedAt: new Date(NOW).toISOString(), ageMs: 0, score: 0 }],
        prs: [pr({ reviewRequestedForMe: true, number: 10, url: "https://gh/pr/10" }), pr({ mergeable: "CONFLICTING", number: 11, url: "https://gh/pr/11" })],
      }),
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual(["failing", "waiting", "review", "conflict"]);
    expect(items[0].url).toBe("https://gh/run");
    expect(items[2].why.toLowerCase()).toContain("review");
  });

  it("excludes drafts from review/conflict and returns empty when nothing needs you", () => {
    expect(selectNeedsYou(data({ prs: [pr({ isDraft: true, reviewRequestedForMe: true })] }), NOW)).toEqual([]);
  });
});

describe("selectOpenWork", () => {
  it("returns the viewer's non-draft open PRs with day counts", () => {
    const items = selectOpenWork(
      data({ viewer: "you", prs: [pr({ author: "you", createdAt: new Date(NOW - 3 * DAY).toISOString() }), pr({ author: "someone", number: 99 }), pr({ author: "you", isDraft: true })] }),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].dayCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/home/select.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/home/select.ts
import type { GithubData } from "@/lib/github/types";

const DAY = 86_400_000;

export type NeedKind = "failing" | "waiting" | "review" | "conflict";

export interface NeedItem {
  kind: NeedKind;
  title: string;
  repo: string;
  url: string;
  why: string;
}

export interface OpenWorkItem {
  title: string;
  repo: string;
  number: number;
  url: string;
  dayCount: number;
}

function daysAgo(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
}

/** The prioritized "act now" queue for Home: failing → waiting → review → conflict. Pure. */
export function selectNeedsYou(data: GithubData, now: number): NeedItem[] {
  const items: NeedItem[] = [];

  for (const a of data.actions) {
    const d = daysAgo(a.failingSince, now);
    items.push({
      kind: "failing",
      title: `${a.defaultBranch} is failing on ${a.repo.split("/")[1] ?? a.repo}`,
      repo: a.repo,
      url: a.runUrl ?? a.repoUrl,
      why: d > 0 ? `failing for ${d}d` : "just started failing",
    });
  }

  for (const n of data.notifications.filter((x) => x.tier === "act" || x.tier === "involved")) {
    items.push({
      kind: "waiting",
      title: n.title,
      repo: n.repo,
      url: n.url,
      why: n.reasonLabel,
    });
  }

  const active = data.prs.filter((p) => !p.isDraft);
  for (const p of active.filter((p) => p.reviewRequestedForMe)) {
    items.push({
      kind: "review",
      title: p.title,
      repo: `${p.repo} #${p.number}`,
      url: p.url,
      why: "your review requested",
    });
  }
  for (const p of active.filter((p) => p.mergeable === "CONFLICTING")) {
    items.push({
      kind: "conflict",
      title: p.title,
      repo: `${p.repo} #${p.number}`,
      url: p.url,
      why: "merge conflicts — needs a rebase",
    });
  }

  return items.slice(0, 8);
}

/** The viewer's own in-progress (non-draft) open PRs. Pure. */
export function selectOpenWork(data: GithubData, now: number): OpenWorkItem[] {
  const viewer = data.viewer;
  return data.prs
    .filter((p) => !p.isDraft && (!viewer || p.author === viewer))
    .map((p) => ({
      title: p.title,
      repo: p.repo,
      number: p.number,
      url: p.url,
      dayCount: daysAgo(p.createdAt, now),
    }));
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/home/select.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/home/select.ts src/lib/home/select.test.ts
git commit -m "feat(home): pure selectors for needs-you queue and open work"
```

---

### Task 3: Briefing sentence

The signature morning-briefing text. Pure and deterministic (no LLM).

**Files:**
- Create: `src/lib/home/briefing.ts`
- Test: `src/lib/home/briefing.test.ts`

**Interfaces:**
- Consumes: `NeedItem` from `src/lib/home/select.ts`.
- Produces:
  - `interface Briefing { greeting: string; lead: string; primary: { label: string; href: string } | null; allClear: boolean }`
  - `function buildBriefing(needs: NeedItem[], failingCount: number, now: number, name: string | null): Briefing`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/home/briefing.test.ts
import { describe, expect, it } from "vitest";
import { buildBriefing } from "./briefing";
import type { NeedItem } from "./select";

// 09:00 UTC → deterministic morning; pass a fixed epoch.
const MORNING = Date.parse("2026-07-30T09:00:00");
const need = (over: Partial<NeedItem> = {}): NeedItem => ({
  kind: "review", title: "Add rate limiting", repo: "acme/api #482", url: "https://gh/482", why: "your review requested", ...over,
});

describe("buildBriefing", () => {
  it("is all-clear with no needs", () => {
    const b = buildBriefing([], 0, MORNING, "chien");
    expect(b.allClear).toBe(true);
    expect(b.primary).toBeNull();
    expect(b.lead.toLowerCase()).toContain("all clear");
  });

  it("summarizes count + green main + a pointer to the top need", () => {
    const b = buildBriefing([need(), need({ kind: "waiting" })], 0, MORNING, "chien");
    expect(b.greeting).toContain("chien");
    expect(b.lead.toLowerCase()).toContain("two things");
    expect(b.lead.toLowerCase()).toContain("green");
    expect(b.primary?.href).toBe("https://gh/482");
  });

  it("reports failing branches when present", () => {
    const b = buildBriefing([need({ kind: "failing", url: "https://gh/run" })], 1, MORNING, null);
    expect(b.lead.toLowerCase()).toMatch(/1 main branch/);
    expect(b.primary?.label.toLowerCase()).toContain("failing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/home/briefing.test.ts`
Expected: FAIL — `buildBriefing` undefined.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/home/briefing.ts
import type { NeedItem, NeedKind } from "./select";

export interface Briefing {
  greeting: string;
  lead: string;
  primary: { label: string; href: string } | null;
  allClear: boolean;
}

const COUNT_WORDS = ["nothing", "One thing", "Two things", "Three things", "Four things", "Five things"];

const PRIMARY_LABEL: Record<NeedKind, string> = {
  failing: "Look at the failing branch",
  waiting: "Jump to what's waiting",
  review: "Start with that review",
  conflict: "Resolve the conflict",
};

function timeOfDay(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function countPhrase(n: number): string {
  return n < COUNT_WORDS.length ? COUNT_WORDS[n] : `${n} things`;
}

/** Compose the Home briefing from the needs queue + failing count. Pure: `now` injected. */
export function buildBriefing(needs: NeedItem[], failingCount: number, now: number, name: string | null): Briefing {
  const tod = timeOfDay(now);
  const greeting = `Good ${tod}${name ? `, ${name}` : ""}.`;

  if (needs.length === 0) {
    return {
      greeting,
      lead: "You're all clear — nothing needs you right now. Enjoy the quiet.",
      primary: null,
      allClear: true,
    };
  }

  const count = countPhrase(needs.length);
  const mainClause =
    failingCount === 0
      ? "Every main branch is green"
      : `${failingCount} main branch${failingCount === 1 ? " is" : "es are"} failing`;
  const top = needs[0];
  const lead = `${count} need you this ${tod}. ${mainClause} — start with ${top.title}.`;

  return {
    greeting,
    lead,
    primary: { label: PRIMARY_LABEL[top.kind], href: top.url },
    allClear: false,
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/home/briefing.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/home/briefing.ts src/lib/home/briefing.test.ts
git commit -m "feat(home): deterministic morning-briefing sentence"
```

---

### Task 4: App shell — sidebar + mobile nav, wired into the root layout

Introduce the persistent shell and remove the per-page headers so there's exactly one chrome. After this task, `/` still shows the current dashboard, but inside the new shell.

**Files:**
- Create: `src/components/layout/AppShell.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/MobileNav.tsx`, `src/components/layout/navItems.ts`
- Modify: `src/app/layout.tsx` (wrap children in `AppShell`)
- Modify: `src/app/page.tsx`, `src/app/standup/page.tsx`, `src/app/config/page.tsx` (strip their headers/`AppHeader`; keep auth gating + content)
- Delete: `src/components/ui/AppHeader.tsx`

**Interfaces:**
- Consumes: `SignInOut` (`src/components/auth/SignInOut.tsx`), `ThemeToggle` (`src/components/ui/ThemeToggle.tsx`), `useGithubData` (`src/hooks/useGithubData.ts`), `computeGlanceCounts` (Task 1).
- Produces: `AppShell` (client) with props `{ signInSlot: React.ReactNode; viewer: string | null; children: React.ReactNode }`; nav config `NAV_ITEMS`.

- [ ] **Step 1: Read the Next.js layout guide**

Run: `ls node_modules/next/dist/docs/` and read the routing/layout guide it lists (per `AGENTS.md`). Confirm how a Server Component root layout may render a Client Component and pass a Server Component (`<SignInOut />`) as a prop/slot.

- [ ] **Step 2: Add the nav config**

```ts
// src/components/layout/navItems.ts
export interface NavItem {
  href: string;
  label: string;
  /** lucide-react icon name used by the sidebar/mobile nav. */
  icon: "home" | "github" | "calendar" | "settings";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/github", label: "GitHub", icon: "github" },
  { href: "/standup", label: "Standup", icon: "calendar" },
  { href: "/config", label: "Configure", icon: "settings" },
];
```

- [ ] **Step 3: Build the sidebar**

Derive Tailwind classes from the mock (`docs/superpowers/specs/2026-07-30-dashboard-redesign-design.md` links the artifact). Active state via `usePathname()` with `aria-current="page"`. The GitHub badge reads the SWR-cached github data (deduped with Home's fetch) and shows the `waiting` count; it degrades to nothing when there's no data.

```tsx
// src/components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Github, Home, Settings } from "lucide-react";
import { useGithubData } from "@/hooks/useGithubData";
import { computeGlanceCounts } from "@/lib/github/glance";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NAV_ITEMS, type NavItem } from "./navItems";

const ICONS = { home: Home, github: Github, calendar: Calendar, settings: Settings };

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({ signInSlot }: { signInSlot: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useGithubData();
  const waiting = data ? computeGlanceCounts(data, Date.now()).waiting : 0;

  return (
    <aside className="sticky top-0 flex h-screen flex-col gap-1 border-r border-border bg-surface/60 px-4 py-5">
      <div className="flex items-center gap-2.5 px-2.5 pb-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-serif text-lg font-bold text-background shadow-sm">P</span>
        <span className="font-serif text-sm font-semibold leading-tight">
          Productivity
          <span className="block font-sans text-[11px] font-medium text-muted">what needs your attention</span>
        </span>
      </div>

      <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Workspace</p>
      {NAV_ITEMS.map((item: NavItem) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-popover-hover hover:text-foreground"
            }`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.9} aria-hidden />
            {item.label}
            {item.icon === "github" && waiting > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 font-mono text-[11px] font-semibold text-white">
                {waiting}
              </span>
            )}
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted">Theme</span>
          <ThemeToggle />
        </div>
        <div className="px-1">{signInSlot}</div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Build the mobile bottom nav**

```tsx
// src/components/layout/MobileNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Github, Home, Settings } from "lucide-react";
import { NAV_ITEMS } from "./navItems";

const ICONS = { home: Home, github: Github, calendar: Calendar, settings: Settings };

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface/90 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10.5px] font-semibold transition-colors ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Build the shell**

```tsx
// src/components/layout/AppShell.tsx
"use client";

import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

/** Persistent app chrome: sidebar (md+) / bottom nav (mobile) around the page canvas. */
export function AppShell({ signInSlot, children }: { signInSlot: React.ReactNode; viewer: string | null; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <div className="hidden md:block">
        <Sidebar signInSlot={signInSlot} />
      </div>
      <main className="min-w-0">
        <div className="mx-auto max-w-[1080px] px-5 pb-28 pt-8 sm:px-10 md:pb-16">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
```

- [ ] **Step 6: Wire the shell into the root layout**

In `src/app/layout.tsx`: keep the font setup, `<html>`, no-flash theme `<script>`. Make the component `async`, call `auth()`, and wrap `children`:

```tsx
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { SignInOut } from "@/components/auth/SignInOut";
// ...
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const viewer = session?.user?.name ?? session?.user?.email ?? null;
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AppShell signInSlot={<SignInOut />} viewer={viewer}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Strip per-page headers**

- `src/app/page.tsx`: remove `<AppHeader active="dashboard" />` and the outer `mx-auto max-w-5xl …` wrapper (the shell now provides width/padding). Return `session?.accessToken ? <DashboardClient … /> : <SignInPrompt />` directly (keep the `readConfig()` call and `refreshIntervalMs`).
- `src/app/standup/page.tsx`: remove `<AppHeader active="standup" />` and the outer wrapper; return the gated `StandupClient`/`SignInPrompt`.
- `src/app/config/page.tsx`: remove the custom `<header>` (back-link + `ThemeToggle`) and outer wrapper; keep a plain page title if desired, then the gated `ConfigManager`/`SignInPrompt`.

- [ ] **Step 8: Delete the retired header**

```bash
git rm src/components/ui/AppHeader.tsx
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run build`
Expected: PASS, no references to `AppHeader` remain (`grep -r AppHeader src` returns nothing).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(layout): persistent sidebar shell; retire per-page headers"
```

---

### Task 5: Move the deep dashboard to /github

Create the `/github` route hosting the existing dashboard (tiles + tabbed detail + PR filter/sort/copy) unchanged.

**Files:**
- Create: `src/app/github/page.tsx`

**Interfaces:**
- Consumes: `DashboardClient` (`src/components/dashboard/DashboardClient.tsx`), `readConfig`, `auth`, `SignInPrompt`.

- [ ] **Step 1: Create the route**

```tsx
// src/app/github/page.tsx
import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function GithubPage() {
  const session = await auth();
  const config = await readConfig();
  return session?.accessToken ? (
    <DashboardClient refreshIntervalMs={config.settings.refreshIntervalMs} />
  ) : (
    <SignInPrompt />
  );
}
```

- [ ] **Step 2: Verify the preserved features**

Run: `npm run build`, then `npm run dev`, sign in, open `/github`. Confirm: the PR **filter** input narrows the list, the **sort** dropdown (Most urgent / Oldest first / Recently active) reorders, each row's **Copy** works, and **Copy all (N)** copies the visible set with N tracking the filter. (These come from the untouched `PullRequestsWidget`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/github/page.tsx
git commit -m "feat(github): host the deep dashboard at /github"
```

---

### Task 6: Home overview page

Replace `/` with the briefing + needs-you queue + open work + standup mini, composed from the Task 1–3 functions.

**Files:**
- Create: `src/components/home/HomeClient.tsx`, `Briefing.tsx`, `GlancePills.tsx`, `NeedsYouQueue.tsx`, `OpenWork.tsx`, `StandupMini.tsx`
- Modify: `src/app/page.tsx` (render `HomeClient` when signed in)

**Interfaces:**
- Consumes: `useGithubData`, `useStandup`, `computeGlanceCounts`, `selectNeedsYou`, `selectOpenWork`, `buildBriefing`, `CopyButton`, `RelativeTime`.
- Produces: `HomeClient` (client) taking `{ viewer: string | null }`.

- [ ] **Step 1: Build the presentational pieces**

`Briefing.tsx` — renders `greeting` (serif), `lead` (serif), a primary `<a href={primary.href} target="_blank" rel="noreferrer">` button + an "I'm caught up" button that hides the briefing via local `useState` (resets next load — good enough; no persistence in v1).

`GlancePills.tsx` — takes `GlanceCounts`; renders the six pills (Waiting / Failing / Your review / Conflicts / Aging / Open PRs) each as dot **+** number **+** label; dims the pill when its value is 0. Tones mirror the mock (waiting=orange, failing=green-when-zero/red, review=amber, conflict=rose, aging=orange, open=neutral).

`NeedsYouQueue.tsx` — takes `NeedItem[]`; each row = a left severity stripe (color by `kind`), a kind chip (dot + word), title, `repo`/`why` meta, and an action link (`Review`/`Open`/`Resolve`/`View`) to `item.url` plus a `CopyButton value={item.url}`. Empty → an invitational all-clear card.

`OpenWork.tsx` — takes `OpenWorkItem[]`; a card listing each PR (title, `repo #number`, `dayCount` as a mono age chip) linking to `url`.

`StandupMini.tsx` — takes the standup SWR data; shows the `today` generated text (or first Yesterday/Today lines), a quick-add input wired to `mutateOp({ op: "add", text })`, a `CopyButton` for the prose, and a `Link href="/standup"` "Open standup". Reuse existing standup text rendering where practical.

Use Tailwind classes consistent with the mock and existing components (`rounded-xl border border-border bg-surface shadow-sm`, `text-muted`, `font-serif`, `font-mono tabular-nums`).

- [ ] **Step 2: Compose HomeClient**

```tsx
// src/components/home/HomeClient.tsx
"use client";

import { useGithubData } from "@/hooks/useGithubData";
import { useStandup } from "@/hooks/useStandup";
import { computeGlanceCounts } from "@/lib/github/glance";
import { selectNeedsYou, selectOpenWork } from "@/lib/home/select";
import { buildBriefing } from "@/lib/home/briefing";
import { Briefing } from "./Briefing";
import { GlancePills } from "./GlancePills";
import { NeedsYouQueue } from "./NeedsYouQueue";
import { OpenWork } from "./OpenWork";
import { StandupMini } from "./StandupMini";

export function HomeClient({ viewer }: { viewer: string | null }) {
  const { data, isLoading, error, refresh } = useGithubData();
  const standup = useStandup();

  if (isLoading && !data) return <HomeSkeleton />;
  if (error && !data) return <HomeError onRetry={refresh} message={error.message} />;
  if (!data) return null;

  const now = Date.now();
  const counts = computeGlanceCounts(data, now);
  const needs = selectNeedsYou(data, now);
  const openWork = selectOpenWork(data, now);
  const briefing = buildBriefing(needs, counts.failing, now, viewer);

  return (
    <div className="flex flex-col gap-9">
      <Briefing briefing={briefing} counts={counts} />
      <GlancePills counts={counts} />
      <NeedsYouQueue items={needs} />
      <div className="grid gap-5 lg:grid-cols-2">
        <OpenWork items={openWork} />
        <StandupMini standup={standup} />
      </div>
    </div>
  );
}
```

Include `HomeSkeleton` (pulse blocks matching the layout) and `HomeError` (message + retry button) in this file, mirroring the existing `DashboardSkeleton`/error card styles in `DashboardClient.tsx`.

- [ ] **Step 3: Update the Home route**

```tsx
// src/app/page.tsx
import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { HomeClient } from "@/components/home/HomeClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.accessToken) return <SignInPrompt />;

  const config = await readConfig();
  const viewer = session.user?.name ?? session.user?.email ?? null;
  if (config.repos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
        <h2 className="font-serif text-xl font-semibold">No repos configured yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">Add repositories to start seeing what needs your attention.</p>
        <Link href="/config" className="mt-4 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">Configure repos</Link>
      </div>
    );
  }
  return <HomeClient viewer={viewer} />;
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build`, then `npm run dev`: sign in, confirm the briefing sentence, pills, needs-you queue (with working action links + copy), open-work list, and standup mini (quick-add adds an item) all render from live data. Toggle theme; check the mobile bottom-nav layout at a narrow width.

- [ ] **Step 5: Commit**

```bash
git add src/components/home src/app/page.tsx
git commit -m "feat(home): morning-briefing overview with needs-you queue"
```

---

### Task 7: Full verification + polish pass

**Files:** none new — a review/verify task.

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 2: Manual walkthrough (signed in)**

- Home `/`: briefing greeting matches time of day; "I'm caught up" hides the briefing; primary action opens the top item; pills dim at 0; all-clear state shows when nothing is waiting (verify by filtering to a quiet moment or with a stubbed empty response).
- `/github`: tiles filter the tabbed list; **PR filter, sort, per-row Copy, and Copy all (N) all work**; "all main branches green" empty state renders.
- `/standup`: builder + history render inside the shell with no leftover header.
- `/config`: repos + settings render; theme control still reachable (now in the sidebar).
- Not signed in: every route shows `SignInPrompt` inside the shell; sidebar shows "Sign in with GitHub".
- Responsive: at ≤`md` the sidebar is replaced by the bottom nav; no horizontal body scroll; tiles reflow to 2-up.
- Accessibility: keyboard-tab through nav/tiles/tabs shows visible focus; `aria-current` on the active nav item.

- [ ] **Step 3: Commit any fixes, then finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR / merge.

---

## Self-Review

**Spec coverage:**
- Sidebar shell + mobile nav → Task 4. ✓
- Morning-briefing masthead (deterministic) → Task 3 + Task 6. ✓
- Needs-you action queue + open work + standup mini on Home → Task 2 + Task 6. ✓
- `/` → `/github` route move → Task 5; new Home → Task 6. ✓
- Preserved PR filter/sort/copy → Global Constraints + Task 5 Step 2 + Task 7 Step 2. ✓
- Reuse existing tokens/type; dot+label status → Global Constraints, enforced in Task 1/6 UI. ✓
- Standup + config re-parented into shell → Task 4 Step 7. ✓
- States (loading/empty/error) → Task 6 (`HomeSkeleton`/`HomeError`/no-repos/all-clear). ✓
- Accessibility + reduced motion → Global Constraints + Task 7 Step 2. ✓
- Glance counts shared (DRY) → Task 1. ✓
- Out of scope (no ranking/fetch/auth/standup-logic changes, no rename, no Gmail) → honored; no task touches `rules.ts`, the provider, or `auth.ts`. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" left; pure-logic tasks carry full test + impl code; UI tasks carry component code with build-based verification (no component-test harness exists in the repo).

**Type consistency:** `computeGlanceCounts`/`GlanceCounts`, `selectNeedsYou`/`selectOpenWork`/`NeedItem`/`NeedKind`/`OpenWorkItem`, and `buildBriefing`/`Briefing` are referenced with identical names/signatures across Tasks 1–6. `AppShell` prop names (`signInSlot`, `viewer`) match between Task 4's definition and the layout wiring.

# Daily Standup Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/standup` page that gathers the user's GitHub activity + typed/tracked manual items and has Claude turn them into an editable Yesterday/Today standup, with scheduling, screenshot-to-items, and a browsable history with roll-ups.

**Architecture:** A new `src/lib/standup/` module of pure, `now`-injected logic (window, classify, item transitions, fact assembly, prompt building) behind two `server-only` wrappers (an fs store and a Claude Code subprocess caller), exposed via `/api/standup` and a client `/standup` page. Facts are gathered deterministically; Claude only phrases them, so the page degrades to plain bullets if the AI is unavailable.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · zod v4 · Vitest · `@octokit/graphql` · **chrono-node** (new) · Claude Code CLI (headless, via the user's Max subscription).

**Spec:** `docs/superpowers/specs/2026-07-29-daily-standup-assistant-design.md`
**Visual reference (exact markup/styling to port):** https://claude.ai/code/artifact/c9353f39-9716-41d6-bc08-f6fe1c958d26

## Global Constraints

- **Read the Next docs first.** Per `AGENTS.md`, before writing any Next.js code read the relevant guide under `node_modules/next/dist/docs/`. This is a modified Next 16 — do not assume APIs from training.
- **Pure logic in `src/lib`, inject `now` (ms).** No `Date.now()` in a function you unit-test; pass `now`. No `Date.now()`/`Math.random()` in React render bodies (react-hooks/purity lint).
- **Server-only modules import `"server-only"`** (`store.ts`, `generate.ts`) and are never imported into client components.
- **One bad source never fails the whole response** — a failed GitHub fetch or AI call becomes a flagged field, not a thrown request. Data routes set `export const dynamic = "force-dynamic"`.
- **AI auth:** use the user's Max subscription via Claude Code headless. **Never set `ANTHROPIC_API_KEY`** (it overrides subscription auth). Auth via `CLAUDE_CODE_OAUTH_TOKEN` from `.env`. Pass prompt/data over **stdin** (text) or a **temp file path** (images) — never string-interpolate untrusted text into a shell. Use `execFile`, not `exec`.
- **Default model** `claude-sonnet-5`, read from `settings.standup.model`.
- **Persistence** lives under `data/` (already gitignored); atomic writes like `src/lib/config/store.ts`.
- **Every commit message ends with:**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Base branch:** work on `feat/standup-assistant` (already stacks on the waiting-on-you branch, which this feature reuses).
- **Verify command:** `npm run typecheck && npm test && npm run lint && npm run build`.

---

### Task 1: Dependencies + standup settings

**Files:**
- Modify: `package.json` (add `chrono-node`)
- Modify: `src/lib/config/schema.ts` (add `standupSettingsSchema`, extend `settingsSchema`)
- Test: `src/lib/config/schema.test.ts` (create)

**Interfaces:**
- Produces: `settingsSchema` now includes `standup: { model: string; workingDays: number[] }` with defaults `{ model: "claude-sonnet-5", workingDays: [1,2,3,4,5] }`.

- [ ] **Step 1: Install chrono-node**

Run: `npm install chrono-node`
Expected: `chrono-node` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `src/lib/config/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { configSchema } from "./schema";

describe("config standup settings", () => {
  it("defaults standup settings when absent", () => {
    const cfg = configSchema.parse({});
    expect(cfg.settings.standup).toEqual({ model: "claude-sonnet-5", workingDays: [1, 2, 3, 4, 5] });
  });

  it("accepts an overridden model and working days", () => {
    const cfg = configSchema.parse({ settings: { standup: { model: "claude-haiku-4-5", workingDays: [1, 2, 3, 4] } } });
    expect(cfg.settings.standup.model).toBe("claude-haiku-4-5");
    expect(cfg.settings.standup.workingDays).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/config/schema.test.ts`
Expected: FAIL (`settings.standup` is undefined).

- [ ] **Step 4: Extend the schema**

In `src/lib/config/schema.ts`, add before `settingsSchema`:
```ts
export const standupSettingsSchema = z.object({
  model: z.string().min(1).default("claude-sonnet-5"),
  // ISO weekday numbers (0=Sun … 6=Sat) that count as working days.
  workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
});
```
Then add to `settingsSchema`'s object:
```ts
  standup: standupSettingsSchema.default({ model: "claude-sonnet-5", workingDays: [1, 2, 3, 4, 5] }),
```
And extend `DEFAULT_CONFIG.settings` with `standup: { model: "claude-sonnet-5", workingDays: [1, 2, 3, 4, 5] }`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/lib/config/schema.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/config/schema.ts src/lib/config/schema.test.ts
git commit -m "feat(standup): add chrono-node dep and standup settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Standup types

**Files:**
- Create: `src/lib/standup/types.ts`

**Interfaces:**
- Produces: `ItemType`, `ItemStatus`, `TrackedItem`, `StandupFacts`, `StandupDay`, `StandupState` — consumed by every later task.

- [ ] **Step 1: Create the types**

Create `src/lib/standup/types.ts`:
```ts
export type ItemType = "meeting" | "review" | "task";
export type ItemStatus = "open" | "done" | "dropped";

/** A manual item the user tracks across days (persisted until resolved). */
export interface TrackedItem {
  id: string;
  text: string;
  type: ItemType;
  status: ItemStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Scheduled datetime (from natural-language parsing), if any. */
  scheduledFor: string | null; // ISO
  /** Links a follow-up ("2nd meeting") to its parent item. */
  parentId: string | null;
}

/** A single PR or issue reference for the facts panel. */
export interface Ref {
  repo: string; // "owner/name"
  number: number;
  title: string;
  url: string;
}

/** Deterministic facts assembled for a standup window. */
export interface StandupFacts {
  mergedPrs: Ref[];
  openedPrs: Ref[];
  reviewedPrs: Ref[];
  openedIssues: Ref[];
  closedIssues: Ref[];
  commitsByRepo: { repo: string; count: number }[];
  /** "Today" candidates reused from the dashboard. */
  needsReview: number;
  waitingOnYou: number;
  failingMain: string[]; // repo names
  inProgress: { title: string; url: string; number: number; repo: string; dayCount: number }[];
}

/** One saved day record. */
export interface StandupDay {
  date: string; // "YYYY-MM-DD" (local)
  windowFrom: string; // ISO
  windowTo: string; // ISO
  facts: StandupFacts;
  manualNotes: string;
  doneItemIds: string[];
  generatedText: string; // editable prose (Yesterday/Today)
}

/** Live cross-day state. */
export interface StandupState {
  items: TrackedItem[];
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/standup/types.ts
git commit -m "feat(standup): add core types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Standup window (weekend-aware)

**Files:**
- Create: `src/lib/standup/window.ts`
- Test: `src/lib/standup/window.test.ts`

**Interfaces:**
- Produces: `computeWindow(now: number, workingDays?: number[]): { from: string; to: string; label: string }` — `from` is the start (00:00 local) of the most recent working day strictly before today.

- [ ] **Step 1: Write the failing test**

Create `src/lib/standup/window.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { computeWindow } from "./window";

describe("computeWindow", () => {
  it("covers Friday from a Monday standup (weekend rule)", () => {
    const mon = new Date(2026, 6, 27, 9, 0, 0).getTime(); // Mon Jul 27 2026, 09:00 local
    const w = computeWindow(mon);
    const from = new Date(w.from);
    expect(from.getDay()).toBe(5); // Friday
    expect(from.getDate()).toBe(24); // Jul 24
    expect(from.getHours()).toBe(0);
    expect(w.label).toBe("Since Fri, Jul 24");
  });

  it("covers the previous day on a mid-week standup", () => {
    const wed = new Date(2026, 6, 29, 9, 0, 0).getTime(); // Wed Jul 29
    const from = new Date(computeWindow(wed).from);
    expect(from.getDate()).toBe(28); // Tue Jul 28
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/standup/window.test.ts`
Expected: FAIL (`computeWindow` not defined).

- [ ] **Step 3: Implement**

Create `src/lib/standup/window.ts`:
```ts
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The standup window: from the start of the most recent working day strictly
 * before today, up to `now`. On Monday this spans Friday + the weekend.
 * Pure: `now` (ms) injected so it's testable.
 */
export function computeWindow(now: number, workingDays: number[] = [1, 2, 3, 4, 5]): {
  from: string;
  to: string;
  label: string;
} {
  const cur = new Date(now);
  cur.setHours(0, 0, 0, 0);
  do {
    cur.setDate(cur.getDate() - 1);
  } while (!workingDays.includes(cur.getDay()));

  return {
    from: cur.toISOString(),
    to: new Date(now).toISOString(),
    label: `Since ${DOW[cur.getDay()]}, ${MON[cur.getMonth()]} ${cur.getDate()}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/standup/window.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standup/window.ts src/lib/standup/window.test.ts
git commit -m "feat(standup): weekend-aware standup window

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Classify + schedule parsing

**Files:**
- Create: `src/lib/standup/classify.ts`
- Test: `src/lib/standup/classify.test.ts`

**Interfaces:**
- Consumes: `ItemType` from `types.ts`; `chrono-node`.
- Produces: `classifyType(text: string): ItemType`; `parseItem(text: string, now: number): { title: string; type: ItemType; scheduledFor: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/standup/classify.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { classifyType, parseItem } from "./classify";

const NOW = new Date(2026, 6, 27, 9, 0, 0).getTime(); // Mon Jul 27 09:00 local

describe("classifyType", () => {
  it("detects meetings, reviews, and defaults to task", () => {
    expect(classifyType("meeting with hck")).toBe("meeting");
    expect(classifyType("call the client")).toBe("meeting");
    expect(classifyType("review the RBAC PR")).toBe("review");
    expect(classifyType("refactor the scorer")).toBe("task");
  });
});

describe("parseItem", () => {
  it("parses 'tomorrow 3 pm' into a scheduled meeting with a clean title", () => {
    const r = parseItem("meeting with hck tomorrow 3 pm", NOW);
    expect(r.type).toBe("meeting");
    expect(r.title).toBe("meeting with hck");
    expect(r.scheduledFor).not.toBeNull();
    const d = new Date(r.scheduledFor as string);
    expect(d.getHours()).toBe(15);
    expect(d.getDate()).toBe(28); // tomorrow
  });

  it("leaves title intact and scheduledFor null when there is no time", () => {
    const r = parseItem("refactor the ranking module", NOW);
    expect(r.scheduledFor).toBeNull();
    expect(r.title).toBe("refactor the ranking module");
    expect(r.type).toBe("task");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/standup/classify.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/standup/classify.ts`:
```ts
import * as chrono from "chrono-node";
import type { ItemType } from "./types";

const MEETING = /\b(meeting|meet|call|sync|1:1|standup|catch\s?up|chat with|discuss)\b/i;
const REVIEW = /\breview(ed|ing)?\b/i;

/** Keyword type classifier (instant, offline). */
export function classifyType(text: string): ItemType {
  if (MEETING.test(text)) return "meeting";
  if (REVIEW.test(text)) return "review";
  return "task";
}

/**
 * Classify an item and extract a scheduled datetime from natural language
 * ("tomorrow 3 pm"), returning a cleaned title. Pure: `now` injected.
 */
export function parseItem(text: string, now: number): { title: string; type: ItemType; scheduledFor: string | null } {
  const type = classifyType(text);
  const results = chrono.parse(text, new Date(now), { forwardDate: true });

  if (results.length === 0) {
    return { title: text.trim(), type, scheduledFor: null };
  }

  const r = results[0];
  const stripped = (text.slice(0, r.index) + text.slice(r.index + r.text.length))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+(on|at|@)\s*$/i, "")
    .trim();

  return {
    title: stripped || text.trim(),
    type,
    scheduledFor: r.start.date().toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/standup/classify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standup/classify.ts src/lib/standup/classify.test.ts
git commit -m "feat(standup): keyword classify + chrono schedule parsing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Item state transitions

**Files:**
- Create: `src/lib/standup/items.ts`
- Test: `src/lib/standup/items.test.ts`

**Interfaces:**
- Consumes: `TrackedItem`, `ItemType` from `types.ts`; `parseItem` from `classify.ts`.
- Produces (all pure, `now` injected, return **new** arrays/objects — never mutate input):
  - `createItem(text: string, now: number, id: string): TrackedItem`
  - `resolveItem(items: TrackedItem[], id: string, status: "done" | "dropped", now: number): TrackedItem[]`
  - `spawnFollowUp(items: TrackedItem[], parentId: string, now: number, id: string): TrackedItem[]`
  - `dayCount(item: TrackedItem, now: number): number`
  - `openItems(items: TrackedItem[]): TrackedItem[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/standup/items.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createItem, dayCount, openItems, resolveItem, spawnFollowUp } from "./items";

const DAY = 86_400_000;
const NOW = new Date(2026, 6, 27, 9, 0, 0).getTime();

describe("items", () => {
  it("creates a typed item, parsing schedule from text", () => {
    const it0 = createItem("meeting with hck tomorrow 3 pm", NOW, "a");
    expect(it0.type).toBe("meeting");
    expect(it0.text).toBe("meeting with hck");
    expect(it0.status).toBe("open");
    expect(it0.scheduledFor).not.toBeNull();
  });

  it("resolves an item without mutating the input array", () => {
    const list = [createItem("refactor", NOW, "a")];
    const next = resolveItem(list, "a", "done", NOW);
    expect(next[0].status).toBe("done");
    expect(list[0].status).toBe("open"); // original untouched
  });

  it("spawns a linked follow-up meeting", () => {
    const list = [createItem("meeting with hck", NOW, "a")];
    const next = spawnFollowUp(list, "a", NOW, "b");
    const child = next.find((i) => i.id === "b")!;
    expect(child.parentId).toBe("a");
    expect(child.type).toBe("meeting");
    expect(child.text).toBe("meeting with hck (2nd)");
  });

  it("computes day count from createdAt", () => {
    const it0 = { ...createItem("x", NOW - 2 * DAY, "a") };
    expect(dayCount(it0, NOW)).toBe(2);
  });

  it("filters to open items only", () => {
    const list = [createItem("a", NOW, "a"), { ...createItem("b", NOW, "b"), status: "done" as const }];
    expect(openItems(list).map((i) => i.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/standup/items.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/standup/items.ts`:
```ts
import type { TrackedItem } from "./types";
import { parseItem } from "./classify";

const DAY = 86_400_000;

export function createItem(text: string, now: number, id: string): TrackedItem {
  const { title, type, scheduledFor } = parseItem(text, now);
  const iso = new Date(now).toISOString();
  return { id, text: title, type, status: "open", createdAt: iso, updatedAt: iso, scheduledFor, parentId: null };
}

export function resolveItem(
  items: TrackedItem[],
  id: string,
  status: "done" | "dropped",
  now: number,
): TrackedItem[] {
  return items.map((i) => (i.id === id ? { ...i, status, updatedAt: new Date(now).toISOString() } : i));
}

export function spawnFollowUp(items: TrackedItem[], parentId: string, now: number, id: string): TrackedItem[] {
  const parent = items.find((i) => i.id === parentId);
  if (!parent) return items;
  const iso = new Date(now).toISOString();
  const child: TrackedItem = {
    id,
    text: `${parent.text} (2nd)`,
    type: parent.type,
    status: "open",
    createdAt: iso,
    updatedAt: iso,
    scheduledFor: null,
    parentId,
  };
  return [...items, child];
}

export function dayCount(item: TrackedItem, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(item.createdAt)) / DAY));
}

export function openItems(items: TrackedItem[]): TrackedItem[] {
  return items.filter((i) => i.status === "open");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/standup/items.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standup/items.ts src/lib/standup/items.test.ts
git commit -m "feat(standup): pure item state transitions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: GitHub contributions fetch + parse

**Files:**
- Create: `src/lib/github/contributions.ts`
- Test: `src/lib/github/contributions.test.ts`

**Interfaces:**
- Consumes: `githubClient` from `src/lib/github/client.ts`; `Ref` from `src/lib/standup/types.ts`.
- Produces:
  - `CONTRIBUTIONS_QUERY: string`, raw response types `RawContributions`.
  - `parseContributions(data: RawContributions): { viewer: string | null; mergedPrs: Ref[]; openedPrs: Ref[]; reviewedPrs: Ref[]; openedIssues: Ref[]; closedIssues: Ref[]; commitsByRepo: { repo: string; count: number }[] }` — **pure**, defensive against nulls.
  - `fetchContributions(token: string, fromISO: string, toISO: string): Promise<ReturnType<typeof parseContributions>>` — runs the query; on failure throws (the API route catches and flags it).

Notes for the implementer: `viewer.contributionsCollection(from,to)` gives PRs **opened**, PRs **reviewed**, issues **opened**, and commit counts per repo — all bounded to the window. "Merged" and "closed" are **not** contribution events, so fetch them with two `search` aliases using `merged:>=<date>` / `closed:>=<date>` (date = `fromISO`, `YYYY-MM-DD` slice).

- [ ] **Step 1: Write the failing test**

Create `src/lib/github/contributions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseContributions, type RawContributions } from "./contributions";

const raw: RawContributions = {
  viewer: {
    login: "me",
    contributionsCollection: {
      pullRequestContributions: {
        nodes: [
          { pullRequest: { number: 76, title: "commission scope", url: "u/76", repository: { nameWithOwner: "o/core" } } },
        ],
      },
      pullRequestReviewContributions: {
        nodes: [
          { pullRequest: { number: 88, title: "board fix", url: "u/88", repository: { nameWithOwner: "o/wms" } } },
        ],
      },
      issueContributions: {
        nodes: [{ issue: { number: 5, title: "bug", url: "u/i5", repository: { nameWithOwner: "o/core" } } }],
      },
      commitContributionsByRepository: [
        { repository: { nameWithOwner: "o/web" }, contributions: { totalCount: 9 } },
        { repository: { nameWithOwner: "o/core" }, contributions: { totalCount: 2 } },
      ],
    },
  },
  merged: {
    nodes: [{ number: 158, title: "RBAC", url: "u/158", repository: { nameWithOwner: "o/web" } }],
  },
  closed: {
    nodes: [{ number: 152, title: "old bug", url: "u/i152", repository: { nameWithOwner: "o/web" } }],
  },
};

describe("parseContributions", () => {
  it("splits opened/merged/reviewed and sums commits", () => {
    const c = parseContributions(raw);
    expect(c.viewer).toBe("me");
    expect(c.mergedPrs.map((p) => p.number)).toEqual([158]);
    expect(c.openedPrs.map((p) => p.number)).toEqual([76]);
    expect(c.reviewedPrs.map((p) => p.number)).toEqual([88]);
    expect(c.openedIssues.map((p) => p.number)).toEqual([5]);
    expect(c.closedIssues.map((p) => p.number)).toEqual([152]);
    expect(c.commitsByRepo).toEqual([
      { repo: "o/web", count: 9 },
      { repo: "o/core", count: 2 },
    ]);
  });

  it("tolerates null/empty node lists", () => {
    const c = parseContributions({ viewer: { login: null, contributionsCollection: {} }, merged: null, closed: null } as unknown as RawContributions);
    expect(c.mergedPrs).toEqual([]);
    expect(c.commitsByRepo).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/contributions.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/github/contributions.ts`:
```ts
import { githubClient } from "./client";
import type { Ref } from "@/lib/standup/types";

export const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query($from: DateTime!, $to: DateTime!, $mergedQ: String!, $closedQ: String!) {
    viewer {
      login
      contributionsCollection(from: $from, to: $to) {
        pullRequestContributions(first: 100) {
          nodes { pullRequest { number title url repository { nameWithOwner } } }
        }
        pullRequestReviewContributions(first: 100) {
          nodes { pullRequest { number title url repository { nameWithOwner } } }
        }
        issueContributions(first: 100) {
          nodes { issue { number title url repository { nameWithOwner } } }
        }
        commitContributionsByRepository(maxRepositories: 50) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
      }
    }
    merged: search(query: $mergedQ, type: ISSUE, first: 50) {
      nodes { ... on PullRequest { number title url repository { nameWithOwner } } }
    }
    closed: search(query: $closedQ, type: ISSUE, first: 50) {
      nodes { ... on Issue { number title url repository { nameWithOwner } } }
    }
  }
`;

interface RawRef { number: number; title: string; url: string; repository: { nameWithOwner: string } | null }
export interface RawContributions {
  viewer: {
    login: string | null;
    contributionsCollection: {
      pullRequestContributions?: { nodes: ({ pullRequest: RawRef } | null)[] | null } | null;
      pullRequestReviewContributions?: { nodes: ({ pullRequest: RawRef } | null)[] | null } | null;
      issueContributions?: { nodes: ({ issue: RawRef } | null)[] | null } | null;
      commitContributionsByRepository?: ({ repository: { nameWithOwner: string }; contributions: { totalCount: number } } | null)[] | null;
    };
  };
  merged: { nodes: (RawRef | null)[] | null } | null;
  closed: { nodes: (RawRef | null)[] | null } | null;
}

function toRef(r: RawRef | null | undefined): Ref | null {
  if (!r || !r.repository) return null;
  return { repo: r.repository.nameWithOwner, number: r.number, title: r.title, url: r.url };
}

export function parseContributions(data: RawContributions) {
  const cc = data.viewer?.contributionsCollection ?? {};
  const prNodes = (cc.pullRequestContributions?.nodes ?? []).map((n) => toRef(n?.pullRequest)).filter(Boolean) as Ref[];
  const reviewNodes = (cc.pullRequestReviewContributions?.nodes ?? []).map((n) => toRef(n?.pullRequest)).filter(Boolean) as Ref[];
  const issueNodes = (cc.issueContributions?.nodes ?? []).map((n) => toRef(n?.issue)).filter(Boolean) as Ref[];
  const commitsByRepo = (cc.commitContributionsByRepository ?? [])
    .filter(Boolean)
    .map((n) => ({ repo: n!.repository.nameWithOwner, count: n!.contributions.totalCount }));

  return {
    viewer: data.viewer?.login ?? null,
    mergedPrs: (data.merged?.nodes ?? []).map(toRef).filter(Boolean) as Ref[],
    openedPrs: prNodes,
    reviewedPrs: reviewNodes,
    openedIssues: issueNodes,
    closedIssues: (data.closed?.nodes ?? []).map(toRef).filter(Boolean) as Ref[],
    commitsByRepo,
  };
}

/** Runs the contributions query for a window. Throws on failure (caller flags it). */
export async function fetchContributions(token: string, fromISO: string, toISO: string) {
  const day = fromISO.slice(0, 10);
  const data = (await githubClient(token)(CONTRIBUTIONS_QUERY, {
    from: fromISO,
    to: toISO,
    mergedQ: `author:@me is:pr is:merged merged:>=${day}`,
    closedQ: `author:@me is:issue is:closed closed:>=${day}`,
  })) as RawContributions;
  return parseContributions(data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/contributions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/contributions.ts src/lib/github/contributions.test.ts
git commit -m "feat(standup): GitHub contributions fetch + defensive parse

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Assemble standup facts

**Files:**
- Create: `src/lib/standup/collect.ts`
- Test: `src/lib/standup/collect.test.ts`

**Interfaces:**
- Consumes: `parseContributions` return type; `GithubData` from `src/lib/github/types.ts`; `TrackedItem`, `StandupFacts` from `types.ts`; `dayCount` from `items.ts`.
- Produces: `assembleFacts(contrib, github: GithubData | null, items: TrackedItem[], now: number): StandupFacts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/standup/collect.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { assembleFacts } from "./collect";
import type { GithubData } from "@/lib/github/types";

const NOW = new Date(2026, 6, 27, 9, 0, 0).getTime();
const DAY = 86_400_000;

const contrib = {
  viewer: "me",
  mergedPrs: [{ repo: "o/web", number: 158, title: "RBAC", url: "u" }],
  openedPrs: [], reviewedPrs: [], openedIssues: [], closedIssues: [],
  commitsByRepo: [{ repo: "o/web", count: 9 }],
};

const github = {
  prs: [
    { repo: "o/web", number: 158, title: "RBAC", url: "u", author: "me", createdAt: new Date(NOW - 3 * DAY).toISOString(),
      isDraft: false, reviewRequestedForMe: false, mergeable: "MERGEABLE", updatedAt: "", ageMs: 0, score: 0, focusReasons: [],
      headRef: "f", baseRef: "main", lastActivity: { author: "me", at: null, isBot: false, kind: "opened" } },
    { repo: "o/api", number: 9, title: "fix", url: "u2", author: "them", createdAt: "", isDraft: false, reviewRequestedForMe: true,
      mergeable: "MERGEABLE", updatedAt: "", ageMs: 0, score: 0, focusReasons: [], headRef: "f", baseRef: "main",
      lastActivity: { author: "x", at: null, isBot: false, kind: "opened" } },
  ],
  notifications: [{ reason: "review_requested" }, { reason: "mention" }],
  actions: [{ repo: "o/job" }],
} as unknown as GithubData;

describe("assembleFacts", () => {
  it("carries merged PRs, dashboard counts, and my in-progress PRs with day counts", () => {
    const f = assembleFacts(contrib, github, [], NOW, "me");
    expect(f.mergedPrs).toHaveLength(1);
    expect(f.needsReview).toBe(1);
    expect(f.waitingOnYou).toBe(2);
    expect(f.failingMain).toEqual(["o/job"]);
    // only my own non-draft open PRs are "in progress"
    expect(f.inProgress.map((p) => p.number)).toEqual([158]);
    expect(f.inProgress[0].dayCount).toBe(3);
  });

  it("works with no github data (AI/GitHub unavailable)", () => {
    const f = assembleFacts(contrib, null, [], NOW, "me");
    expect(f.needsReview).toBe(0);
    expect(f.inProgress).toEqual([]);
    expect(f.mergedPrs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/standup/collect.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/standup/collect.ts`:
```ts
import type { GithubData } from "@/lib/github/types";
import type { StandupFacts } from "./types";
import type { parseContributions } from "@/lib/github/contributions";

const DAY = 86_400_000;
type Contrib = ReturnType<typeof parseContributions>;

/** Combine GitHub contributions + dashboard data + tracked items into facts. */
export function assembleFacts(
  contrib: Contrib,
  github: GithubData | null,
  _items: unknown,
  now: number,
  viewer: string | null,
): StandupFacts {
  const prs = github?.prs ?? [];
  const myOpen = prs.filter((p) => !p.isDraft && (!viewer || p.author === viewer));
  const inProgress = myOpen.map((p) => ({
    title: p.title,
    url: p.url,
    number: p.number,
    repo: p.repo,
    dayCount: Math.max(0, Math.floor((now - Date.parse(p.createdAt)) / DAY)),
  }));

  return {
    mergedPrs: contrib.mergedPrs,
    openedPrs: contrib.openedPrs,
    reviewedPrs: contrib.reviewedPrs,
    openedIssues: contrib.openedIssues,
    closedIssues: contrib.closedIssues,
    commitsByRepo: contrib.commitsByRepo,
    needsReview: prs.filter((p) => p.reviewRequestedForMe && !p.isDraft).length,
    waitingOnYou: github?.notifications?.length ?? 0,
    failingMain: (github?.actions ?? []).map((a) => a.repo),
    inProgress,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/standup/collect.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standup/collect.ts src/lib/standup/collect.test.ts
git commit -m "feat(standup): assemble deterministic standup facts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Prompt builders

**Files:**
- Create: `src/lib/standup/prompt.ts`
- Test: `src/lib/standup/prompt.test.ts`

**Interfaces:**
- Consumes: `StandupFacts`, `TrackedItem` from `types.ts`.
- Produces:
  - `buildGeneratePrompt(facts: StandupFacts, doneItems: TrackedItem[], openItems: TrackedItem[], notes: string): string`
  - `buildRollupPrompt(days: { date: string; facts: StandupFacts }[], range: "week" | "month"): string`
  - `IMAGE_EXTRACT_PROMPT: string`
  - `parseImageItems(raw: string): string[]` — pull an array of item strings out of the model's JSON reply, defensively.

- [ ] **Step 1: Write the failing test**

Create `src/lib/standup/prompt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildGeneratePrompt, parseImageItems } from "./prompt";
import type { StandupFacts } from "./types";

const facts: StandupFacts = {
  mergedPrs: [{ repo: "o/web", number: 158, title: "RBAC", url: "u" }],
  openedPrs: [], reviewedPrs: [], openedIssues: [], closedIssues: [],
  commitsByRepo: [{ repo: "o/web", count: 9 }],
  needsReview: 4, waitingOnYou: 2, failingMain: ["o/job"], inProgress: [],
};

describe("buildGeneratePrompt", () => {
  it("includes the facts and instructs the model to use only them", () => {
    const p = buildGeneratePrompt(facts, [], [], "met with hck");
    expect(p).toContain("RBAC");
    expect(p).toContain("o/job");
    expect(p).toContain("met with hck");
    expect(p.toLowerCase()).toContain("only");
  });
});

describe("parseImageItems", () => {
  it("extracts items from a JSON reply", () => {
    expect(parseImageItems('{"items":["a","b"]}')).toEqual(["a", "b"]);
  });
  it("extracts from fenced JSON and ignores prose", () => {
    expect(parseImageItems('here you go:\n```json\n{"items":["x"]}\n```')).toEqual(["x"]);
  });
  it("returns [] on garbage", () => {
    expect(parseImageItems("no json here")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/standup/prompt.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/standup/prompt.ts`:
```ts
import type { StandupFacts, TrackedItem } from "./types";

function refLines(label: string, refs: { repo: string; number: number; title: string }[]): string {
  if (refs.length === 0) return "";
  return `${label}:\n` + refs.map((r) => `  - ${r.title} (${r.repo} #${r.number})`).join("\n") + "\n";
}

export function buildGeneratePrompt(
  facts: StandupFacts,
  doneItems: TrackedItem[],
  openItems: TrackedItem[],
  notes: string,
): string {
  const parts = [
    "You are writing a developer's daily standup. Use ONLY the facts below — do not invent work.",
    "Write two short sections, 'Yesterday' and 'Today', as tight bullet points suitable to read aloud.",
    "Group related items; be concise; no preamble.",
    "",
    "FACTS — yesterday:",
    refLines("Merged PRs", facts.mergedPrs),
    refLines("Opened PRs", facts.openedPrs),
    refLines("Reviewed PRs", facts.reviewedPrs),
    facts.commitsByRepo.length ? `Commits: ${facts.commitsByRepo.map((c) => `${c.count} in ${c.repo}`).join(", ")}\n` : "",
    doneItems.length ? "Also did:\n" + doneItems.map((i) => `  - ${i.text}`).join("\n") + "\n" : "",
    notes.trim() ? `Notes: ${notes.trim()}\n` : "",
    "",
    "FACTS — today:",
    facts.needsReview ? `- ${facts.needsReview} PR(s) need my review\n` : "",
    facts.waitingOnYou ? `- ${facts.waitingOnYou} notification(s) waiting on me\n` : "",
    facts.failingMain.length ? `- failing main: ${facts.failingMain.join(", ")}\n` : "",
    facts.inProgress.length ? "In progress:\n" + facts.inProgress.map((p) => `  - ${p.title} (${p.repo} #${p.number}, day ${p.dayCount})`).join("\n") + "\n" : "",
    openItems.length ? "Planned:\n" + openItems.map((i) => `  - ${i.text}${i.scheduledFor ? ` @ ${i.scheduledFor}` : ""}`).join("\n") + "\n" : "",
  ];
  return parts.filter(Boolean).join("\n");
}

export function buildRollupPrompt(days: { date: string; facts: StandupFacts }[], range: "week" | "month"): string {
  const lines = days.map((d) => {
    const f = d.facts;
    return `${d.date}: merged ${f.mergedPrs.length}, opened ${f.openedPrs.length}, reviewed ${f.reviewedPrs.length}, commits ${f.commitsByRepo.reduce((s, c) => s + c.count, 0)}`;
  });
  return [
    `Summarize this developer's ${range} in 3-4 sentences for a retro. Use ONLY these daily facts; be specific about themes and totals.`,
    "",
    ...lines,
  ].join("\n");
}

export const IMAGE_EXTRACT_PROMPT =
  'Look at this screenshot (a Slack thread, Jira board, or meeting notes). Extract the concrete action items, tasks, and meetings for the viewer. Reply with ONLY JSON: {"items": ["short item 1", "short item 2"]}. No prose.';

export function parseImageItems(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]);
    return Array.isArray(obj.items) ? obj.items.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/standup/prompt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standup/prompt.ts src/lib/standup/prompt.test.ts
git commit -m "feat(standup): prompt builders + image-reply parser

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Claude Code caller

**Files:**
- Create: `src/lib/standup/generate.ts`
- Test: `src/lib/standup/generate.test.ts`

**Interfaces:**
- Consumes: `IMAGE_EXTRACT_PROMPT` from `prompt.ts`.
- Produces:
  - `buildClaudeArgs(model: string, imagePath?: string): string[]` — **pure**, tested.
  - `runClaude(prompt: string, model: string, imagePath?: string): Promise<string>` — `server-only`; spawns `claude`, prompt on stdin, image (if any) as a temp-file path argument; parses `--output-format json`'s `.result`; throws a typed `ClaudeUnavailableError` if the binary is missing / not logged in.

Notes: use `execFile("claude", args, { input: prompt })` is NOT available (execFile has no stdin) — use `child_process.spawn`, write `prompt` to stdin, read stdout. Never interpolate `prompt` into a shell string.

- [ ] **Step 1: Write the failing test (pure arg builder)**

Create `src/lib/standup/generate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildClaudeArgs } from "./generate";

describe("buildClaudeArgs", () => {
  it("builds bare headless JSON args with a model", () => {
    const a = buildClaudeArgs("claude-sonnet-5");
    expect(a).toEqual(["--bare", "-p", "--output-format", "json", "--model", "claude-sonnet-5"]);
  });
  it("appends the image path and Read tool when given an image", () => {
    const a = buildClaudeArgs("claude-sonnet-5", "/tmp/x.png");
    expect(a).toContain("--allowedTools");
    expect(a).toContain("Read");
    expect(a[a.length - 1]).toBe("/tmp/x.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/standup/generate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/standup/generate.ts`:
```ts
import "server-only";
import { spawn } from "node:child_process";

export class ClaudeUnavailableError extends Error {}

/** Pure: the headless CLI args. Image goes last so Claude reads it via the Read tool. */
export function buildClaudeArgs(model: string, imagePath?: string): string[] {
  const args = ["--bare", "-p", "--output-format", "json", "--model", model];
  if (imagePath) args.push("--allowedTools", "Read", imagePath);
  return args;
}

/**
 * Run Claude Code headless on the user's Max subscription. Prompt goes on stdin
 * (no shell interpolation). Returns the `.result` text. Throws
 * ClaudeUnavailableError if the CLI is missing or not authenticated.
 */
export function runClaude(prompt: string, model: string, imagePath?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", buildClaudeArgs(model, imagePath), {
      env: { ...process.env }, // CLAUDE_CODE_OAUTH_TOKEN from .env; ANTHROPIC_API_KEY must be unset
    });
    let out = "";
    let err = "";
    child.on("error", (e) => reject(new ClaudeUnavailableError(`Claude Code not runnable: ${e.message}`)));
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      if (code !== 0) return reject(new ClaudeUnavailableError(err.slice(0, 300) || `claude exited ${code}`));
      try {
        resolve(JSON.parse(out).result ?? "");
      } catch {
        reject(new ClaudeUnavailableError("could not parse claude output"));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/standup/generate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/standup/generate.ts src/lib/standup/generate.test.ts
git commit -m "feat(standup): Claude Code headless caller (subscription auth)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Persistence store

**Files:**
- Create: `src/lib/standup/store.ts`
- Test: `src/lib/standup/store.test.ts`

**Interfaces:**
- Consumes: `StandupState`, `StandupDay` from `types.ts`.
- Produces (all take an optional `baseDir` defaulting to `path.join(process.cwd(), "data")`, for testability):
  - `readState(baseDir?): Promise<StandupState>` (default `{ items: [] }`)
  - `writeState(state, baseDir?): Promise<void>` (atomic)
  - `writeDay(day, baseDir?): Promise<void>` → `data/standups/<date>.json`
  - `readDay(date, baseDir?): Promise<StandupDay | null>`
  - `listDays(baseDir?): Promise<string[]>` (dates, newest first)

Mirror the atomic-write pattern in `src/lib/config/store.ts` (write to a temp file, then `rename`). If Vitest errors on the `"server-only"` import, add `test: { server: { deps: { inline: ["server-only"] } } }` or alias `server-only` to an empty module in `vitest.config`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/standup/store.test.ts`:
```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDays, readDay, readState, writeDay, writeState } from "./store";

const dirs: string[] = [];
function tmp() { const d = mkdtempSync(join(tmpdir(), "standup-")); dirs.push(d); return d; }
afterEach(() => { dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });

describe("store", () => {
  it("round-trips state", async () => {
    const d = tmp();
    expect(await readState(d)).toEqual({ items: [] });
    await writeState({ items: [{ id: "a", text: "x", type: "task", status: "open", createdAt: "", updatedAt: "", scheduledFor: null, parentId: null }] }, d);
    expect((await readState(d)).items).toHaveLength(1);
  });

  it("round-trips a day and lists newest first", async () => {
    const d = tmp();
    const day = (date: string) => ({ date, windowFrom: "", windowTo: "", facts: {} as never, manualNotes: "", doneItemIds: [], generatedText: "" });
    await writeDay(day("2026-07-24"), d);
    await writeDay(day("2026-07-25"), d);
    expect(await listDays(d)).toEqual(["2026-07-25", "2026-07-24"]);
    expect((await readDay("2026-07-24", d))?.date).toBe("2026-07-24");
    expect(await readDay("2026-01-01", d)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/standup/store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/standup/store.ts`:
```ts
import "server-only";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StandupDay, StandupState } from "./types";

const DEFAULT_DIR = join(process.cwd(), "data");
const daysDir = (base: string) => join(base, "standups");

async function atomicWrite(file: string, data: unknown): Promise<void> {
  await mkdir(join(file, ".."), { recursive: true });
  const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file);
}

export async function readState(baseDir: string = DEFAULT_DIR): Promise<StandupState> {
  try {
    return JSON.parse(await readFile(join(baseDir, "standup-state.json"), "utf8")) as StandupState;
  } catch {
    return { items: [] };
  }
}

export async function writeState(state: StandupState, baseDir: string = DEFAULT_DIR): Promise<void> {
  await atomicWrite(join(baseDir, "standup-state.json"), state);
}

export async function writeDay(day: StandupDay, baseDir: string = DEFAULT_DIR): Promise<void> {
  await atomicWrite(join(daysDir(baseDir), `${day.date}.json`), day);
}

export async function readDay(date: string, baseDir: string = DEFAULT_DIR): Promise<StandupDay | null> {
  try {
    return JSON.parse(await readFile(join(daysDir(baseDir), `${date}.json`), "utf8")) as StandupDay;
  } catch {
    return null;
  }
}

export async function listDays(baseDir: string = DEFAULT_DIR): Promise<string[]> {
  try {
    return (await readdir(daysDir(baseDir)))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/standup/store.test.ts`
Expected: PASS (2 tests). If it fails on the `server-only` import, apply the `vitest.config` note above, then re-run.

- [ ] **Step 5: Ignore the data dir**

Confirm `data/` is gitignored (it already is for `config.json`). If only `data/config.json` is ignored, add `data/standups/` and `data/standup-state.json` to `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/standup/store.ts src/lib/standup/store.test.ts .gitignore
git commit -m "feat(standup): atomic fs persistence for days + state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: API route

**Files:**
- Create: `src/app/api/standup/route.ts`
- Modify: reuse `getGithubData` from `src/lib/github/provider.ts` (already exported).

**Interfaces:**
- Consumes: everything above + `auth()` from `src/auth.ts`, `readConfig` from `src/lib/config/store.ts`, `getGithubData`.
- Produces HTTP contract:
  - `GET /api/standup` → `{ window, items, facts, today: StandupDay | null, days: string[] }`
  - `POST /api/standup` body `{ action: "generate" | "rollup" | "deriveImage", ... }` → `{ text }` or `{ items }` (+ `aiError?: string`)
  - `PUT /api/standup` body `{ op: "add" | "resolve" | "followup" | "notes" | "saveText", ... }` → `{ items }` or `{ ok: true }`

- [ ] **Step 1: Read the Next route docs**

Run: `ls node_modules/next/dist/docs/` and read the route-handler guide.
Expected: understand the `GET/POST/PUT` handler signature and `NextResponse` usage for this Next version.

- [ ] **Step 2: Implement the route**

Create `src/app/api/standup/route.ts`:
```ts
import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { getGithubData } from "@/lib/github/provider";
import { fetchContributions } from "@/lib/github/contributions";
import { computeWindow } from "@/lib/standup/window";
import { assembleFacts } from "@/lib/standup/collect";
import { createItem, openItems, resolveItem, spawnFollowUp } from "@/lib/standup/items";
import { buildGeneratePrompt, buildRollupPrompt, IMAGE_EXTRACT_PROMPT, parseImageItems } from "@/lib/standup/prompt";
import { ClaudeUnavailableError, runClaude } from "@/lib/standup/generate";
import { listDays, readDay, readState, writeDay, writeState } from "@/lib/standup/store";
import type { StandupFacts } from "@/lib/standup/types";

export const dynamic = "force-dynamic";

function todayDate(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function newId(now: number): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
async function requireToken() {
  const session = await auth();
  return session?.accessToken ?? null;
}

export async function GET() {
  const token = await requireToken();
  if (!token) return NextResponse.json({ error: "Not signed in to GitHub" }, { status: 401 });

  const now = Date.now();
  const cfg = await readConfig();
  const win = computeWindow(now, cfg.settings.standup.workingDays);
  const state = await readState();

  let facts: StandupFacts | null = null;
  try {
    const [contrib, github] = await Promise.all([
      fetchContributions(token, win.from, win.to),
      getGithubData(token).catch(() => null),
    ]);
    facts = assembleFacts(contrib, github, state.items, now, contrib.viewer);
  } catch {
    facts = null; // GitHub unavailable — page still renders items + history
  }

  return NextResponse.json({
    window: win,
    items: state.items,
    facts,
    today: await readDay(todayDate(now), null as never), // baseDir default
    days: await listDays(),
  });
}

export async function PUT(request: Request) {
  const token = await requireToken();
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const now = Date.now();
  const body = await request.json();
  const state = await readState();

  switch (body.op) {
    case "add":
      state.items = [...state.items, createItem(String(body.text ?? ""), now, newId(now))];
      break;
    case "resolve":
      state.items = resolveItem(state.items, String(body.id), body.status === "dropped" ? "dropped" : "done", now);
      break;
    case "followup":
      state.items = spawnFollowUp(state.items, String(body.id), now, newId(now));
      break;
    case "notes": {
      const date = todayDate(now);
      const day = (await readDay(date)) ?? emptyDay(date, now);
      day.manualNotes = String(body.notes ?? "");
      await writeDay(day);
      return NextResponse.json({ ok: true });
    }
    case "saveText": {
      const date = todayDate(now);
      const day = (await readDay(date)) ?? emptyDay(date, now);
      day.generatedText = String(body.text ?? "");
      await writeDay(day);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }

  await writeState(state);
  return NextResponse.json({ items: state.items });
}

export async function POST(request: Request) {
  const token = await requireToken();
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const now = Date.now();
  const cfg = await readConfig();
  const model = cfg.settings.standup.model;
  const body = await request.json();

  try {
    if (body.action === "generate") {
      const win = computeWindow(now, cfg.settings.standup.workingDays);
      const state = await readState();
      const [contrib, github] = await Promise.all([
        fetchContributions(token, win.from, win.to),
        getGithubData(token).catch(() => null),
      ]);
      const facts = assembleFacts(contrib, github, state.items, now, contrib.viewer);
      const done = state.items.filter((i) => i.status === "done");
      const prompt = buildGeneratePrompt(facts, done, openItems(state.items), body.notes ?? "");
      const text = await runClaude(prompt, model);
      const date = todayDate(now);
      const day = (await readDay(date)) ?? emptyDay(date, now);
      Object.assign(day, { facts, generatedText: text, windowFrom: win.from, windowTo: win.to });
      await writeDay(day);
      return NextResponse.json({ text });
    }

    if (body.action === "rollup") {
      const dates = (await listDays()).slice(0, body.range === "month" ? 31 : 7);
      const days = (await Promise.all(dates.map((d) => readDay(d)))).filter(Boolean).map((d) => ({ date: d!.date, facts: d!.facts }));
      const text = await runClaude(buildRollupPrompt(days, body.range === "month" ? "month" : "week"), model);
      return NextResponse.json({ text });
    }

    if (body.action === "deriveImage") {
      // body.dataUrl = "data:image/png;base64,...."
      const base64 = String(body.dataUrl ?? "").split(",")[1] ?? "";
      const dir = join(tmpdir(), "standup-shots");
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${newId(now)}.png`);
      await writeFile(path, Buffer.from(base64, "base64"));
      try {
        const raw = await runClaude(IMAGE_EXTRACT_PROMPT, model, path);
        return NextResponse.json({ items: parseImageItems(raw) });
      } finally {
        await unlink(path).catch(() => {});
      }
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    if (err instanceof ClaudeUnavailableError) {
      return NextResponse.json({ aiError: err.message }, { status: 200 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function emptyDay(date: string, now: number) {
  return {
    date,
    windowFrom: new Date(now).toISOString(),
    windowTo: new Date(now).toISOString(),
    facts: { mergedPrs: [], openedPrs: [], reviewedPrs: [], openedIssues: [], closedIssues: [], commitsByRepo: [], needsReview: 0, waitingOnYou: 0, failingMain: [], inProgress: [] } as StandupFacts,
    manualNotes: "",
    doneItemIds: [],
    generatedText: "",
  };
}
```

Note: fix the `readDay(todayDate(now), null as never)` call to `readDay(todayDate(now))` (default baseDir) — shown wrong here on purpose to catch during typecheck; use the default-arg form.

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. Fix the `readDay` default-arg call and any import issues surfaced.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/standup/route.ts
git commit -m "feat(standup): /api/standup GET/POST/PUT

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Standup page — Today

**Files:**
- Create: `src/app/standup/page.tsx` (server component; `auth()` gate, renders client)
- Create: `src/components/standup/StandupClient.tsx` (`"use client"`, SWR to `/api/standup`)
- Create: `src/components/standup/TodayPanel.tsx`, `FollowUps.tsx`, `AddItem.tsx`, `GenerateBlock.tsx`, `FactsPanel.tsx`
- Create: `src/hooks/useStandup.ts` (SWR wrapper)

**Interfaces:**
- Consumes: the `/api/standup` HTTP contract from Task 11.
- Produces: the `/standup` route.

**Port the exact markup + Tailwind classes from the mockup** (artifact `c9353f39-9716-41d6-bc08-f6fe1c958d26`, "Standup → Today"): follow-ups list with type-aware actions, the add box with the live type/⏰ preview, the paste/derive affordance, the Generate button + editable prose + Copy, and the Yesterday/Today facts grid. Wire each control to the API.

- [ ] **Step 1: Read the Next docs for pages + client components**

Run: read `node_modules/next/dist/docs/` guides for App Router pages and `"use client"`.

- [ ] **Step 2: SWR hook**

Create `src/hooks/useStandup.ts`:
```ts
"use client";
import useSWR from "swr";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function useStandup() {
  const swr = useSWR("/api/standup", fetcher, { revalidateOnFocus: false });
  async function mutateOp(body: unknown) {
    await fetch("/api/standup", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await swr.mutate();
  }
  async function action(body: unknown): Promise<{ text?: string; items?: string[]; aiError?: string }> {
    const res = await fetch("/api/standup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }
  return { data: swr.data, isLoading: swr.isLoading, reload: swr.mutate, mutateOp, action };
}
```

- [ ] **Step 3: Page shell**

Create `src/app/standup/page.tsx`:
```tsx
import { auth } from "@/auth";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { StandupClient } from "@/components/standup/StandupClient";

export const dynamic = "force-dynamic";

export default async function StandupPage() {
  const session = await auth();
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      {session?.accessToken ? <StandupClient /> : <SignInPrompt />}
    </div>
  );
}
```

- [ ] **Step 4: Build the client subtree**

Create `StandupClient.tsx` (holds `today`/`history` sub-nav state), `TodayPanel.tsx`, `FollowUps.tsx`, `AddItem.tsx`, `GenerateBlock.tsx`, `FactsPanel.tsx`, porting the mockup's markup/classes and wiring:
- `AddItem`: local input; on submit → `mutateOp({ op: "add", text })`; on image paste → read file as data URL → `action({ action: "deriveImage", dataUrl })` → for each returned string `mutateOp({ op: "add", text })`. Show the live type/⏰ preview by calling a client copy of `classifyType`/`parseItem` (import from `@/lib/standup/classify` — it's pure, safe in the client bundle).
- `FollowUps`: render `openItems(data.items)`; buttons → `mutateOp({ op: "resolve", id, status })`, `mutateOp({ op: "followup", id })`.
- `GenerateBlock`: button → `action({ action: "generate" })`; put `text` in an editable `contenteditable`/`textarea`; on blur → `mutateOp({ op: "saveText", text })`; Copy button uses `navigator.clipboard`. If `aiError`, show a one-line hint: "Claude Code unavailable — run `claude setup-token`. Facts are below."
- `FactsPanel`: render `data.facts` (merged/opened/reviewed/commits + Today counts + inProgress with `day N`). Always visible.

(Use the existing `Badge`, `CopyButton`, `RelativeTime` primitives.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Manual smoke**

Start dev (or use the running server), sign in, visit `/standup`. Add "meeting with hck tomorrow 3 pm" → item appears typed + scheduled. Click Generate → prose appears (or the AI-unavailable hint). Confirm the facts panel shows real GitHub activity.

- [ ] **Step 7: Commit**

```bash
git add src/app/standup/page.tsx src/components/standup/ src/hooks/useStandup.ts
git commit -m "feat(standup): Today page (follow-ups, add, generate, facts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Standup page — History + roll-ups

**Files:**
- Create: `src/components/standup/HistoryPanel.tsx`
- Modify: `src/components/standup/StandupClient.tsx` (wire the `history` sub-nav)

**Interfaces:**
- Consumes: `data.days` (dates) from GET; `GET /api/standup?date=<d>`... — add a small day-fetch. Simplest: add a `dayText` fetch via a new GET query param, or reuse `today`. For history detail, add `readDay` lookup: extend the route `GET` to accept `?date=YYYY-MM-DD` returning that day. (Add to Task 11's GET: if `?date` present, return `{ day }`.)

- [ ] **Step 1: Extend GET for a specific day**

In `src/app/api/standup/route.ts` `GET`, near the top:
```ts
const url = new URL(request.url);
const date = url.searchParams.get("date");
if (date) return NextResponse.json({ day: await readDay(date) });
```
(Change `GET()` to `GET(request: Request)`.)

- [ ] **Step 2: Build HistoryPanel**

Create `HistoryPanel.tsx`, porting the mockup's History markup: week/month roll-up buttons → `action({ action: "rollup", range })` → show returned `text`; a day list from `data.days` → clicking fetches `/api/standup?date=<d>` and shows `day.generatedText` in a read-only panel.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/standup/route.ts src/components/standup/HistoryPanel.tsx src/components/standup/StandupClient.tsx
git commit -m "feat(standup): history browsing + week/month roll-ups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Nav link + final verification

**Files:**
- Modify: `src/app/page.tsx` (add a "Standup" link next to "Configure")

- [ ] **Step 1: Add the nav link**

In `src/app/page.tsx`, in the header's link row, add before/after the Configure link:
```tsx
<Link href="/standup" className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted">
  Standup
</Link>
```

- [ ] **Step 2: Full verification**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: PASS. All standup unit suites green (config, window, classify, items, contributions, collect, prompt, generate, store).

- [ ] **Step 3: Manual end-to-end (needs real login + Claude Code logged in)**

- `/standup` loads; facts reflect real GitHub activity for the window.
- Add typed + scheduled items; follow-up chain works; done resolves.
- Generate produces prose; edit + Copy works; reload shows the saved text.
- Paste a screenshot → derived items appear as drafts.
- History: pick a past day; week/month roll-up generates.
- Turn off / log out of Claude Code → Generate shows the setup hint, facts still render.

- [ ] **Step 4: Commit + update CLAUDE.md**

Add a `src/lib/standup/` line and a `/standup` note to `CLAUDE.md` Layout, then:
```bash
git add src/app/page.tsx CLAUDE.md
git commit -m "feat(standup): add Standup nav link; document module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** GitHub facts (Task 6/7) · days-on-task (Task 7 `inProgress.dayCount`) · AI prose via subscription (Task 9/11) · Sonnet 5 configurable (Task 1) · tracked items + follow-ups (Task 5) · scheduling (Task 4) · screenshot→items (Task 9/11 `deriveImage`) · history + roll-ups (Task 13) · local persistence, keep-all (Task 10) · window weekend rule (Task 3) · graceful AI fallback (Task 9 `ClaudeUnavailableError` → Task 11 `aiError` → Task 12 hint). All covered.

**Placeholder scan:** No "TBD"/"handle edge cases"/"write tests for the above" — every code step shows code, every test shows assertions. The one intentional wrong line (`readDay(..., null as never)`) is flagged in-step with the fix.

**Type consistency:** `TrackedItem`/`StandupFacts`/`StandupDay`/`StandupState` (Task 2) are used with the same field names in Tasks 5–13. `parseContributions` return type is consumed as `Contrib` in Task 7. `runClaude(prompt, model, imagePath?)` and `buildClaudeArgs(model, imagePath?)` signatures match between Task 9 and Task 11. `computeWindow(now, workingDays)` matches Task 3 ↔ Task 11.

**Open items (from spec):** vision-under-Max billing and exact model id — surfaced at Task 9/11; default `claude-sonnet-5` is configurable via Task 1 settings.

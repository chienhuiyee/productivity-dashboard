# Vercel Deployment (Anthropic API + MongoDB Atlas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard deployable to Vercel by replacing the two things that tie it to the local machine — the `claude` CLI subprocess and the `data/` JSON file store — and adding a login allowlist.

**Architecture:** Both swaps happen *inside* existing modules. `src/lib/config/store.ts` and `src/lib/standup/store.ts` keep their function names and return types but talk to MongoDB Atlas; `src/lib/standup/generate.ts` keeps its error type but calls the Anthropic API. A cached `MongoClient` promise on `globalThis` survives dev HMR and warm lambda invocations. Access is gated by a pure `isAllowedLogin` helper wired into the NextAuth `signIn` callback.

**Tech Stack:** Next.js 16, TypeScript, Vitest, `mongodb` 7.5, `@anthropic-ai/sdk` 0.120, NextAuth v5.

**Spec:** `docs/superpowers/specs/2026-08-20-vercel-deployment-design.md`

## Global Constraints

- Local and production share **one cluster and one database**. Default database name is `dashboard`; resolution order is `MONGODB_DB` env var → database path in `MONGODB_URI` → `"dashboard"`. The current `MONGODB_URI` has **no** database in its path.
- Store modules keep their existing exported names and return types. The optional trailing `baseDir` parameter (test-isolation hook) becomes an optional trailing **database-name** parameter serving the same purpose.
- `ClaudeUnavailableError` keeps its name and is still what `route.ts:186` catches to produce a soft `{ aiError }` at HTTP 200.
- The allowlist **fails closed**: `ALLOWED_GITHUB_LOGIN` unset means no login succeeds.
- Server-only modules (`db/client.ts`, both stores, `generate.ts`) import `"server-only"`. Vitest aliases that to an empty module — do not remove the import to make a test pass.
- Never commit `secrets.local.md`, `.env.local`, or `data/`. All three are gitignored; keep it that way.
- Verification gate for every task: the commands in that task, plus `npm run typecheck` before commit.

---

### Task 1: MongoDB client + config store

**Files:**
- Create: `src/lib/db/client.ts`
- Create: `src/lib/db/testing.ts`
- Create: `vitest.setup.ts`
- Modify: `vitest.config.ts`
- Rewrite: `src/lib/config/store.ts`
- Create: `src/lib/config/store.test.ts`
- Modify: `.env.local` (create if absent — gitignored, never committed)

**Interfaces:**
- Consumes: `configSchema`, `DEFAULT_CONFIG`, `AppConfig` from `src/lib/config/schema.ts` (already exist).
- Produces:
  - `getDb(name?: string): Promise<Db>` — cached connection.
  - `dbName(): string` — resolved database name.
  - `withTestDb(fn: (db: string) => Promise<void>): Promise<void>` — runs `fn` against a unique throwaway database, drops it after.
  - `readConfig(db?: string): Promise<AppConfig>` and `writeConfig(input: unknown, db?: string): Promise<AppConfig>` — unchanged signatures apart from the renamed optional trailing parameter.

- [ ] **Step 1: Put the Mongo URI into `.env.local`**

`secrets.local.md` wraps its values in double quotes. Strip them — a quoted value becomes part of the hostname and fails with `MongoParseError: Invalid scheme`.

```bash
cd /Users/chienhuiyee/Developer/productivity-dashboard
touch .env.local
grep -q '^MONGODB_URI=' .env.local || \
  grep '^MONGODB_URI=' secrets.local.md | sed -E 's/=[[:space:]]*"?/=/; s/"$//' >> .env.local
grep -q '^ANTHROPIC_API_KEY=' .env.local || \
  grep '^ANTHROPIC_KEY=' secrets.local.md | sed -E 's/^ANTHROPIC_KEY=[[:space:]]*"?/ANTHROPIC_API_KEY=/; s/"$//' >> .env.local
# Confirm without printing values:
grep -oE '^[A-Z_]+=' .env.local
```

Expected output includes `MONGODB_URI=` and `ANTHROPIC_API_KEY=`. Note the rename: the secrets file calls it `ANTHROPIC_KEY`; the SDK reads `ANTHROPIC_API_KEY`.

- [ ] **Step 2: Make Vitest load `.env.local`**

Vitest does not read `.env.local` on its own, so database tests would see no URI.

Create `vitest.setup.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";

// Vitest doesn't load .env.local the way `next dev` does. Parse it here so
// database-backed tests can reach Atlas; tests skip themselves when it's absent.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
    }
  }
}
```

In `vitest.config.ts`, add `setupFiles` inside the existing `test` block:

```typescript
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
```

- [ ] **Step 3: Write the failing test for the config store**

Create `src/lib/config/store.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/lib/db/testing";
import { DEFAULT_CONFIG } from "./schema";
import { readConfig, writeConfig } from "./store";

const hasDb = !!process.env.MONGODB_URI;

describe.skipIf(!hasDb)("config store", () => {
  it("returns defaults when nothing has been written", async () => {
    await withTestDb(async (db) => {
      expect(await readConfig(db)).toEqual(DEFAULT_CONFIG);
    });
  });

  it("round-trips a config", async () => {
    await withTestDb(async (db) => {
      const saved = await writeConfig(
        { repos: [{ owner: "acme", name: "api" }], settings: DEFAULT_CONFIG.settings },
        db,
      );
      expect(saved.repos).toHaveLength(1);
      const read = await readConfig(db);
      expect(read.repos).toEqual([{ owner: "acme", name: "api" }]);
      expect(read.settings.standup.model).toBe("claude-sonnet-5");
    });
  });

  it("overwrites rather than appending on repeat writes", async () => {
    await withTestDb(async (db) => {
      await writeConfig({ repos: [{ owner: "a", name: "one" }] }, db);
      await writeConfig({ repos: [{ owner: "b", name: "two" }] }, db);
      const read = await readConfig(db);
      expect(read.repos).toEqual([{ owner: "b", name: "two" }]);
    });
  });

  it("rejects an invalid repo name instead of persisting it", async () => {
    await withTestDb(async (db) => {
      await expect(writeConfig({ repos: [{ owner: "a", name: "bad name!" }] }, db)).rejects.toThrow();
    });
  });

  it("falls back to defaults when the stored document is malformed", async () => {
    await withTestDb(async (db) => {
      const { getDb } = await import("@/lib/db/client");
      await (await getDb(db)).collection("config").insertOne({ _id: "app", repos: "not-an-array" } as never);
      expect(await readConfig(db)).toEqual(DEFAULT_CONFIG);
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/config/store.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/testing`.

- [ ] **Step 5: Write the client module**

Create `src/lib/db/client.ts`:

```typescript
import "server-only";
import { MongoClient, type Db } from "mongodb";

const DEFAULT_DB = "dashboard";

// Cached on globalThis, not a module local: Next.js dev HMR re-evaluates modules
// on every edit, and each serverless cold start gets a fresh module registry.
// Without this we'd open a new connection per request and exhaust the M0 pool.
const globalForMongo = globalThis as typeof globalThis & {
  __mongoClientPromise?: Promise<MongoClient>;
};

function connectionUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  return uri;
}

/** Explicit env var wins, then a database in the URI path, then the default. */
export function dbName(): string {
  const explicit = process.env.MONGODB_DB?.trim();
  if (explicit) return explicit;
  const afterCredentials = connectionUri().split("@")[1] ?? "";
  const fromUri = (afterCredentials.split("/")[1] ?? "").split("?")[0];
  return fromUri || DEFAULT_DB;
}

export function getClient(): Promise<MongoClient> {
  globalForMongo.__mongoClientPromise ??= new MongoClient(connectionUri()).connect();
  return globalForMongo.__mongoClientPromise;
}

export async function getDb(name: string = dbName()): Promise<Db> {
  return (await getClient()).db(name);
}
```

- [ ] **Step 6: Write the test helper**

Create `src/lib/db/testing.ts`. It is imported only by tests, so it does not import `server-only`.

```typescript
import { getClient } from "./client";

/**
 * Run `fn` against a uniquely-named throwaway database, then drop it.
 * Keeps tests off the shared `dashboard` database, which holds real history.
 */
export async function withTestDb(fn: (db: string) => Promise<void>): Promise<void> {
  const name = `dashboard_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fn(name);
  } finally {
    const client = await getClient();
    await client.db(name).dropDatabase().catch(() => {});
  }
}
```

- [ ] **Step 7: Rewrite the config store**

Replace the whole of `src/lib/config/store.ts`:

```typescript
import "server-only";
import { getDb } from "@/lib/db/client";
import { configSchema, DEFAULT_CONFIG, type AppConfig } from "./schema";

/** Single-document collection: one config per deployment. */
const CONFIG_ID = "app";

type ConfigDoc = { _id: string } & AppConfig;

async function configCollection(db?: string) {
  return (await getDb(db)).collection<ConfigDoc>("config");
}

/** Read the monitored-repo config. Missing or invalid document falls back to defaults. */
export async function readConfig(db?: string): Promise<AppConfig> {
  const doc = await (await configCollection(db)).findOne({ _id: CONFIG_ID });
  if (!doc) return DEFAULT_CONFIG;
  const { _id: _ignored, ...stored } = doc;
  const parsed = configSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}

/** Validate and persist config as a single upserted document. Returns the saved value. */
export async function writeConfig(input: unknown, db?: string): Promise<AppConfig> {
  const config = configSchema.parse(input);
  await (await configCollection(db)).replaceOne(
    { _id: CONFIG_ID },
    { _id: CONFIG_ID, ...config },
    { upsert: true },
  );
  return config;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/config/store.test.ts`
Expected: PASS, 5 tests.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/client.ts src/lib/db/testing.ts src/lib/config/store.ts \
        src/lib/config/store.test.ts vitest.setup.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(db): back the config store with MongoDB Atlas

Adds a globalThis-cached MongoClient so dev HMR and warm serverless
invocations reuse one connection instead of opening one per request."
```

---

### Task 2: Standup store on Mongo, with the day-list N+1 removed

**Files:**
- Rewrite: `src/lib/standup/store.ts`
- Rewrite: `src/lib/standup/store.test.ts`
- Modify: `src/app/api/standup/route.ts` (delete the local `listDaysWithPosted`, import it instead)

**Interfaces:**
- Consumes: `getDb` from `src/lib/db/client.ts`, `withTestDb` from `src/lib/db/testing.ts` (Task 1).
- Produces:
  - `readState(db?: string): Promise<StandupState>`
  - `writeState(state: StandupState, db?: string): Promise<void>`
  - `readDay(date: string, db?: string): Promise<StandupDay | null>`
  - `writeDay(day: StandupDay, db?: string): Promise<void>`
  - `listDaysWithPosted(db?: string): Promise<{ date: string; posted: boolean }[]>` — newest first
  - `recentDays(limit: number, db?: string): Promise<StandupDay[]>` — newest first, full documents
- Removed: `listDays` — every caller now wants either the posted flags or the documents themselves, so a bare date list has no remaining consumer.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/lib/standup/store.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/lib/db/testing";
import { listDaysWithPosted, readDay, readState, recentDays, writeDay, writeState } from "./store";
import type { StandupDay } from "./types";

const hasDb = !!process.env.MONGODB_URI;

function day(date: string, extra: Partial<StandupDay> = {}): StandupDay {
  return {
    date,
    windowFrom: "",
    windowTo: "",
    facts: {} as never,
    manualNotes: "",
    doneItemIds: [],
    generatedText: "",
    ...extra,
  };
}

describe.skipIf(!hasDb)("standup store", () => {
  it("returns empty state before anything is written", async () => {
    await withTestDb(async (db) => {
      expect(await readState(db)).toEqual({ items: [] });
    });
  });

  it("round-trips state", async () => {
    await withTestDb(async (db) => {
      await writeState(
        {
          items: [
            { id: "a", text: "x", type: "task", status: "open", createdAt: "", updatedAt: "", scheduledFor: null, parentId: null },
          ],
        },
        db,
      );
      expect((await readState(db)).items).toHaveLength(1);
      expect((await readState(db)).items[0].id).toBe("a");
    });
  });

  it("round-trips a day and lists newest first", async () => {
    await withTestDb(async (db) => {
      await writeDay(day("2026-07-24"), db);
      await writeDay(day("2026-07-25"), db);
      expect((await listDaysWithPosted(db)).map((d) => d.date)).toEqual(["2026-07-25", "2026-07-24"]);
      expect((await readDay("2026-07-24", db))?.date).toBe("2026-07-24");
      expect(await readDay("2026-01-01", db)).toBeNull();
    });
  });

  it("overwrites a day rather than creating a duplicate", async () => {
    await withTestDb(async (db) => {
      await writeDay(day("2026-07-24", { generatedText: "first" }), db);
      await writeDay(day("2026-07-24", { generatedText: "second" }), db);
      expect(await listDaysWithPosted(db)).toEqual([{ date: "2026-07-24", posted: false }]);
      expect((await readDay("2026-07-24", db))?.generatedText).toBe("second");
    });
  });

  it("tags each day with whether it was posted", async () => {
    await withTestDb(async (db) => {
      await writeDay(day("2026-07-24", { postedAt: "2026-07-24T09:00:00Z" }), db);
      await writeDay(day("2026-07-25"), db);
      expect(await listDaysWithPosted(db)).toEqual([
        { date: "2026-07-25", posted: false },
        { date: "2026-07-24", posted: true },
      ]);
    });
  });

  it("returns whole recent days newest first, capped at the limit", async () => {
    await withTestDb(async (db) => {
      await writeDay(day("2026-07-23", { generatedText: "oldest" }), db);
      await writeDay(day("2026-07-24", { generatedText: "middle" }), db);
      await writeDay(day("2026-07-25", { generatedText: "newest" }), db);
      const recent = await recentDays(2, db);
      expect(recent.map((d) => d.date)).toEqual(["2026-07-25", "2026-07-24"]);
      expect(recent[0].generatedText).toBe("newest");
    });
  });

  it("returns every day when the limit exceeds the document count", async () => {
    await withTestDb(async (db) => {
      await writeDay(day("2026-07-24"), db);
      expect(await recentDays(31, db)).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/standup/store.test.ts`
Expected: FAIL — `listDaysWithPosted` is not exported from `./store`.

- [ ] **Step 3: Rewrite the store**

Replace the whole of `src/lib/standup/store.ts`:

```typescript
import "server-only";
import { getDb } from "@/lib/db/client";
import type { StandupDay, StandupState } from "./types";

/** Single-document collection: one live cross-day state per deployment. */
const STATE_ID = "state";

type StateDoc = { _id: string } & StandupState;
/** `_id` is the "YYYY-MM-DD" date, so range queries and sorting work on it directly. */
type DayDoc = { _id: string } & StandupDay;

async function stateCollection(db?: string) {
  return (await getDb(db)).collection<StateDoc>("standupState");
}
async function daysCollection(db?: string) {
  return (await getDb(db)).collection<DayDoc>("standupDays");
}

export async function readState(db?: string): Promise<StandupState> {
  const doc = await (await stateCollection(db)).findOne({ _id: STATE_ID });
  return doc ? { items: doc.items ?? [] } : { items: [] };
}

export async function writeState(state: StandupState, db?: string): Promise<void> {
  await (await stateCollection(db)).replaceOne(
    { _id: STATE_ID },
    { _id: STATE_ID, ...state },
    { upsert: true },
  );
}

export async function readDay(date: string, db?: string): Promise<StandupDay | null> {
  const doc = await (await daysCollection(db)).findOne({ _id: date });
  if (!doc) return null;
  const { _id: _ignored, ...day } = doc;
  return day;
}

export async function writeDay(day: StandupDay, db?: string): Promise<void> {
  await (await daysCollection(db)).replaceOne(
    { _id: day.date },
    { _id: day.date, ...day },
    { upsert: true },
  );
}

/**
 * Day dates (newest first) tagged with whether each was marked posted.
 * One projection instead of a read per day — this used to be an N+1 in the route.
 */
export async function listDaysWithPosted(db?: string): Promise<{ date: string; posted: boolean }[]> {
  const docs = await (await daysCollection(db))
    .find({}, { projection: { _id: 1, postedAt: 1 }, sort: { _id: -1 } })
    .toArray();
  return docs.map((d) => ({ date: d._id, posted: !!d.postedAt }));
}

/**
 * The `limit` most recent days as whole documents, newest first.
 * One query for the rollup, which previously listed dates and then issued a
 * separate read per date.
 */
export async function recentDays(limit: number, db?: string): Promise<StandupDay[]> {
  const docs = await (await daysCollection(db))
    .find({}, { sort: { _id: -1 }, limit })
    .toArray();
  return docs.map(({ _id: _ignored, ...day }) => day);
}
```

- [ ] **Step 4: Point the route at the shared helper**

Three edits in `src/app/api/standup/route.ts`.

**(a)** Replace the store import:

```typescript
import { listDaysWithPosted, readDay, readState, recentDays, writeDay, writeState } from "@/lib/standup/store";
```

**(b)** Delete the local `listDaysWithPosted` definition at the bottom of the file, along with its doc comment. Its call site inside `GET` is unchanged — it now resolves to the imported version.

**(c)** In `POST`, replace the first two lines of the `rollup` branch, which listed dates and then issued a read per date:

```typescript
      const days = (await recentDays(body.range === "month" ? 31 : 7)).map((d) => ({ date: d.date, facts: d.facts }));
```

This replaces both the `const dates = ...` and `const days = ...` lines. The `generateText` call below them is unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/standup/store.test.ts`
Expected: PASS, 5 tests.

Run: `npm run typecheck`
Expected: no errors. A `listDaysWithPosted is declared but never read` error means the local copy in `route.ts` was not deleted.

- [ ] **Step 6: Commit**

```bash
git add src/lib/standup/store.ts src/lib/standup/store.test.ts src/app/api/standup/route.ts
git commit -m "feat(standup): back the standup store with MongoDB Atlas

Day documents are keyed by date, so listing and range queries run on _id.
listDaysWithPosted moves into the store as a single projection, replacing
a read-per-day N+1 in the route."
```

---

### Task 3: Migration script

**Files:**
- Create: `scripts/migrate-to-atlas.mjs`
- Modify: `package.json` (add the `migrate:atlas` script)

**Interfaces:**
- Consumes: `MONGODB_URI` from `.env.local`; the existing `data/` tree.
- Produces: populated `config`, `standupState`, `standupDays` collections. No exported code interface.

Plain `.mjs` run through Node's `--env-file`, so the project gains no TypeScript-runner dependency for a script that runs once.

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-to-atlas.mjs`:

```javascript
// One-off import of the local data/ JSON files into MongoDB Atlas.
// Idempotent: every write is an upsert keyed by a stable _id, so re-running
// is safe. data/ is left untouched as a backup.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MongoClient } from "mongodb";

const DATA_DIR = join(process.cwd(), "data");
const DEFAULT_DB = "dashboard";

function resolveDbName(uri) {
  if (process.env.MONGODB_DB?.trim()) return process.env.MONGODB_DB.trim();
  const afterCredentials = uri.split("@")[1] ?? "";
  const fromUri = (afterCredentials.split("/")[1] ?? "").split("?")[0];
  return fromUri || DEFAULT_DB;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`could not parse ${path}: ${err.message}`);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (expected in .env.local)");

  const dbName = resolveDbName(uri);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`migrating data/ -> database "${dbName}"`);

  try {
    const config = await readJson(join(DATA_DIR, "config.json"));
    if (config) {
      await db.collection("config").replaceOne({ _id: "app" }, { _id: "app", ...config }, { upsert: true });
      console.log(`  config:       ${config.repos?.length ?? 0} repos`);
    } else {
      console.log("  config:       (no data/config.json — skipped)");
    }

    const state = await readJson(join(DATA_DIR, "standup-state.json"));
    if (state) {
      await db.collection("standupState").replaceOne({ _id: "state" }, { _id: "state", ...state }, { upsert: true });
      console.log(`  standupState: ${state.items?.length ?? 0} tracked items`);
    } else {
      console.log("  standupState: (no data/standup-state.json — skipped)");
    }

    let dayCount = 0;
    const dayFiles = await readdir(join(DATA_DIR, "standups")).catch(() => []);
    for (const file of dayFiles.filter((f) => f.endsWith(".json"))) {
      const day = await readJson(join(DATA_DIR, "standups", file));
      if (!day) continue;
      const id = day.date ?? file.replace(/\.json$/, "");
      await db.collection("standupDays").replaceOne({ _id: id }, { _id: id, ...day }, { upsert: true });
      dayCount += 1;
    }
    console.log(`  standupDays:  ${dayCount} days`);

    console.log("\nverifying:");
    for (const name of ["config", "standupState", "standupDays"]) {
      console.log(`  ${name}: ${await db.collection(name).countDocuments()} document(s)`);
    }
    console.log("\ndone. data/ left in place as a backup.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`migration failed: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, inside `"scripts"`, after `"test:watch"`:

```json
    "migrate:atlas": "node --env-file=.env.local scripts/migrate-to-atlas.mjs"
```

Remember the comma on the preceding line.

- [ ] **Step 3: Run the migration**

Run: `npm run migrate:atlas`

Expected — matching the volume counted during design:

```
migrating data/ -> database "dashboard"
  config:       33 repos
  standupState: 21 tracked items
  standupDays:  4 days

verifying:
  config: 1 document(s)
  standupState: 1 document(s)
  standupDays: 4 document(s)

done. data/ left in place as a backup.
```

If the repo/item counts differ from 33/21/4, stop and report — it means `data/` changed since the design was written, not that the script is wrong.

- [ ] **Step 4: Verify the data reads back through the app's own store**

Run:

```bash
npx vitest run src/lib/config/store.test.ts src/lib/standup/store.test.ts
```

Expected: PASS (these use throwaway databases and do not touch the migrated data).

Then confirm the real database reads correctly:

```bash
node --env-file=.env.local --input-type=module <<'JS'
import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || "dashboard");
const config = await db.collection("config").findOne({ _id: "app" });
const state = await db.collection("standupState").findOne({ _id: "state" });
const days = await db.collection("standupDays").find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).toArray();
console.log("repos:", config?.repos?.length, "items:", state?.items?.length, "days:", days.map(d => d._id).join(", "));
await client.close();
JS
```

Expected: `repos: 33 items: 21 days: 2026-08-19, 2026-08-03, 2026-07-31, 2026-07-30`

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-to-atlas.mjs package.json
git commit -m "feat(scripts): one-off data/ -> Atlas migration

Idempotent upserts keyed by stable _id. Leaves data/ in place as a backup."
```

---

### Task 4: GitHub login allowlist

**Files:**
- Create: `src/lib/auth/allowlist.ts`
- Create: `src/lib/auth/allowlist.test.ts`
- Modify: `src/auth.ts`

**Interfaces:**
- Produces: `isAllowedLogin(login: unknown, allowed: string | undefined): boolean`.

The comparison lives in a pure function so it is testable without standing up NextAuth; `src/auth.ts` only wires it to the callback.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/allowlist.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isAllowedLogin } from "./allowlist";

describe("isAllowedLogin", () => {
  it("allows the configured login", () => {
    expect(isAllowedLogin("octocat", "octocat")).toBe(true);
  });

  it("ignores case, since GitHub logins are case-insensitive", () => {
    expect(isAllowedLogin("OctoCat", "octocat")).toBe(true);
  });

  it("tolerates surrounding whitespace in the env var", () => {
    expect(isAllowedLogin("octocat", "  octocat  ")).toBe(true);
  });

  it("rejects a different login", () => {
    expect(isAllowedLogin("someone-else", "octocat")).toBe(false);
  });

  it("fails closed when the allowlist is unset", () => {
    expect(isAllowedLogin("octocat", undefined)).toBe(false);
  });

  it("fails closed when the allowlist is empty or blank", () => {
    expect(isAllowedLogin("octocat", "")).toBe(false);
    expect(isAllowedLogin("octocat", "   ")).toBe(false);
  });

  it("rejects a missing or non-string login", () => {
    expect(isAllowedLogin(undefined, "octocat")).toBe(false);
    expect(isAllowedLogin(42, "octocat")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/allowlist.test.ts`
Expected: FAIL — cannot resolve `./allowlist`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/allowlist.ts`:

```typescript
/**
 * Single-user gate for a publicly-reachable deployment: without this, the GitHub
 * OAuth flow accepts any GitHub account. Fails closed — an unset or blank
 * allowlist denies every login rather than admitting everyone.
 */
export function isAllowedLogin(login: unknown, allowed: string | undefined): boolean {
  const expected = allowed?.trim().toLowerCase();
  if (!expected) return false;
  if (typeof login !== "string" || !login.trim()) return false;
  return login.trim().toLowerCase() === expected;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth/allowlist.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire it into NextAuth**

In `src/auth.ts`, add the import below the existing ones:

```typescript
import { isAllowedLogin } from "@/lib/auth/allowlist";
```

Then add `signIn` as the first entry in the existing `callbacks` object, above `jwt`:

```typescript
    async signIn({ profile }) {
      return isAllowedLogin(profile?.login, process.env.ALLOWED_GITHUB_LOGIN);
    },
```

- [ ] **Step 6: Set the allowlist locally**

The git user on this machine is `chienhuiyee`. Confirm it matches the GitHub login used to sign in, then:

```bash
grep -q '^ALLOWED_GITHUB_LOGIN=' .env.local || echo 'ALLOWED_GITHUB_LOGIN=chienhuiyee' >> .env.local
grep -oE '^[A-Z_]+=' .env.local
```

If the GitHub login differs from the git username, use the GitHub login — that is what `profile.login` carries.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npx vitest run src/lib/auth/allowlist.test.ts`
Expected: no type errors; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/allowlist.ts src/lib/auth/allowlist.test.ts src/auth.ts
git commit -m "feat(auth): restrict sign-in to one GitHub login

A public deployment would otherwise accept any GitHub account. Fails
closed: an unset ALLOWED_GITHUB_LOGIN denies every login."
```

---

### Task 5: Anthropic API replaces the Claude CLI

**Files:**
- Rewrite: `src/lib/standup/generate.ts`
- Rewrite: `src/lib/standup/generate.test.ts`
- Modify: `src/app/api/standup/route.ts` (image path, imports, `maxDuration`)

**Interfaces:**
- Consumes: `@anthropic-ai/sdk` (already installed at 0.120.0).
- Produces:
  - `ClaudeUnavailableError` — unchanged name, still what `route.ts` catches.
  - `generateText(prompt: string, model: string, imageBase64?: string): Promise<string>` — replaces `runClaude`.
  - `extractText(content: unknown[]): string` — pure, exported for testing.
- Removed: `buildClaudeArgs` and `runClaude`.

- [ ] **Step 1: Write the failing test**

Replace the whole of `src/lib/standup/generate.test.ts`. The network call itself is not unit-tested; the pure block-extraction is, since that is where a model change could silently break output.

```typescript
import { describe, expect, it } from "vitest";
import { ClaudeUnavailableError, extractText } from "./generate";

describe("extractText", () => {
  it("returns the text of a single text block", () => {
    expect(extractText([{ type: "text", text: "Yesterday: shipped X" }])).toBe("Yesterday: shipped X");
  });

  it("concatenates multiple text blocks in order", () => {
    expect(extractText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("ab");
  });

  it("skips thinking blocks, which adaptive thinking emits alongside text", () => {
    expect(
      extractText([
        { type: "thinking", thinking: "internal reasoning" },
        { type: "text", text: "the answer" },
      ]),
    ).toBe("the answer");
  });

  it("returns an empty string when there is no text block", () => {
    expect(extractText([{ type: "thinking", thinking: "only reasoning" }])).toBe("");
    expect(extractText([])).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(extractText([{ type: "text", text: "  padded  " }])).toBe("padded");
  });
});

describe("ClaudeUnavailableError", () => {
  it("is an Error, so the route's instanceof check still routes it to aiError", () => {
    const err = new ClaudeUnavailableError("nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("nope");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/standup/generate.test.ts`
Expected: FAIL — `extractText` is not exported.

- [ ] **Step 3: Rewrite the module**

Replace the whole of `src/lib/standup/generate.ts`:

```typescript
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export class ClaudeUnavailableError extends Error {}

/**
 * Below the route's maxDuration (60s) on purpose: a slow call should surface as a
 * soft aiError the UI can render, not as a platform function kill with no body.
 */
const REQUEST_TIMEOUT_MS = 50_000;
const MAX_TOKENS = 16_000;

let client: Anthropic | undefined;

function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeUnavailableError("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });
  return client;
}

/**
 * Pure: pull the assistant's prose out of a response's content blocks.
 * Adaptive thinking is on by default, so responses interleave thinking blocks
 * with text — only the text blocks are the standup output.
 */
export function extractText(content: unknown[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => {
      const b = block as { type?: unknown; text?: unknown };
      return b?.type === "text" && typeof b.text === "string";
    })
    .map((block) => block.text)
    .join("")
    .trim();
}

/** Map SDK failures onto ClaudeUnavailableError so the route degrades softly. */
function asUnavailable(err: unknown): ClaudeUnavailableError | null {
  if (err instanceof ClaudeUnavailableError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new ClaudeUnavailableError("Anthropic API key rejected");
  if (err instanceof Anthropic.RateLimitError) return new ClaudeUnavailableError("Anthropic rate limit reached — try again shortly");
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ClaudeUnavailableError("Anthropic request timed out");
  if (err instanceof Anthropic.APIConnectionError) return new ClaudeUnavailableError("could not reach the Anthropic API");
  if (err instanceof Anthropic.APIError) return new ClaudeUnavailableError(`Anthropic API error ${err.status ?? ""}`.trim());
  return null;
}

/**
 * Ask Claude to phrase the standup. `imageBase64` is the raw base64 payload of a
 * PNG (no data: prefix) for the screenshot-to-items flow.
 * Throws ClaudeUnavailableError when the model is unreachable or declines.
 */
export async function generateText(prompt: string, model: string, imageBase64?: string): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = imageBase64
    ? [
        { type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } },
        { type: "text", text: prompt },
      ]
    : [{ type: "text", text: prompt }];

  try {
    const response = await anthropic().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content }],
    });

    // stop_reason before content: on a refusal, content can be empty and
    // indexing it would throw a 500 where the UI expects a soft aiError.
    if (response.stop_reason === "refusal") {
      throw new ClaudeUnavailableError("the model declined this request");
    }

    const text = extractText(response.content);
    if (!text) throw new ClaudeUnavailableError(`empty response (stop_reason: ${response.stop_reason})`);
    return text;
  } catch (err) {
    const unavailable = asUnavailable(err);
    if (unavailable) throw unavailable;
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/standup/generate.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Update the route**

Three edits in `src/app/api/standup/route.ts`.

**(a)** Replace the generate import:

```typescript
import { ClaudeUnavailableError, generateText } from "@/lib/standup/generate";
```

**(b)** Replace both `runClaude(...)` calls in `POST`:

```typescript
      const text = await generateText(prompt, model);
```

```typescript
      const text = await generateText(buildRollupPrompt(days, body.range === "month" ? "month" : "week"), model);
```

**(c)** Replace the whole `deriveImage` branch. The temp file existed only so the CLI's Read tool could open it; the API takes the base64 directly.

```typescript
    if (body.action === "deriveImage") {
      // body.dataUrl = "data:image/png;base64,...."
      const base64 = String(body.dataUrl ?? "").split(",")[1] ?? "";
      if (!base64) return NextResponse.json({ error: "no image data" }, { status: 400 });
      const raw = await generateText(IMAGE_EXTRACT_PROMPT, model, base64);
      return NextResponse.json({ items: parseImageItems(raw) });
    }
```

**(d)** Delete the now-unused Node imports at the top of the file:

```typescript
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

**(e)** Add `maxDuration` beside the existing `dynamic` export:

```typescript
export const dynamic = "force-dynamic";
// Anthropic calls can outlast the default function timeout. 60s is the Hobby
// ceiling; raise if the Vercel account is on Pro.
export const maxDuration = 60;
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: no errors. Errors naming `writeFile`, `tmpdir`, or `join` mean step (d) was skipped.

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 7: Smoke-test a real generation**

```bash
node --env-file=.env.local --input-type=module <<'JS'
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 50_000 });
const res = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 16_000,
  messages: [{ role: "user", content: [{ type: "text", text: "In one sentence: what is a standup?" }] }],
});
console.log("stop_reason:", res.stop_reason);
console.log("text blocks:", res.content.filter(b => b.type === "text").length);
console.log("tokens in/out:", res.usage.input_tokens, res.usage.output_tokens);
JS
```

Expected: `stop_reason: end_turn`, at least one text block.

- [ ] **Step 8: Commit**

```bash
git add src/lib/standup/generate.ts src/lib/standup/generate.test.ts src/app/api/standup/route.ts
git commit -m "feat(standup): generate via the Anthropic API instead of the Claude CLI

The CLI subprocess authenticated against a personal Max subscription and
has no binary in a serverless runtime. Screenshots now pass base64 inline
rather than via a temp file for the CLI's Read tool.

Errors map onto ClaudeUnavailableError so the route still degrades to a
soft aiError; stop_reason is checked before content, since a refusal can
carry an empty content array."
```

---

### Task 6: Environment wiring and documentation

**Files:**
- Rewrite: `.env.example`
- Modify: `README.md` (setup + a new deployment section)
- Modify: `CLAUDE.md` (Layout and Verify sections)

**Interfaces:** none — documentation and example configuration only.

- [ ] **Step 1: Rewrite `.env.example`**

Replace the file's contents with the following. Note the added quote warning: Vercel's env var UI takes a pasted value literally, so a quoted string becomes part of the value.

```
# Copy this file to .env.local and fill in the values.
# In Vercel, set the same variables in Project Settings -> Environment Variables.
# Paste values there WITHOUT surrounding quotes - a quoted value is taken literally.
#
# 1. Generate a session-encryption secret:
#      npx auth secret
#    (this can also write AUTH_SECRET into .env.local for you)
#
# 2. Register a *classic* GitHub OAuth App (NOT a "GitHub App"):
#      https://github.com/settings/developers  ->  "OAuth Apps"  ->  "New OAuth App"
#        - Homepage URL:               http://localhost:3000
#        - Authorization callback URL: http://localhost:3000/api/auth/callback/github
#    For the deployed app, register the Vercel URL the same way.

AUTH_SECRET=

AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

# Base URL of the app. Leave unset for plain http://localhost:3000.
# Set this when you reach the app from another origin (Vercel, or Tailscale HTTPS)
# so the OAuth callback and session cookies use the right host. It MUST match the
# Authorization callback URL registered in GitHub, minus the /api/auth/... path.
#   Vercel example:     AUTH_URL=https://your-app.vercel.app
#   Tailscale example:  AUTH_URL=https://your-machine.your-tailnet.ts.net
# AUTH_URL=

# Your GitHub login. Only this account may sign in. REQUIRED - if it is unset,
# every sign-in is rejected (fails closed, so a public URL is never wide open).
ALLOWED_GITHUB_LOGIN=

# MongoDB Atlas connection string. Local and deployed share one database.
# If the URI has no database in its path, "dashboard" is used.
MONGODB_URI=

# Optional override for the database name.
# MONGODB_DB=dashboard

# Anthropic API key for standup generation (https://console.anthropic.com/).
ANTHROPIC_API_KEY=
```

Verify with `grep -oE '^[A-Z_]+=' .env.example` — expect `AUTH_SECRET=`, `AUTH_GITHUB_ID=`, `AUTH_GITHUB_SECRET=`, `ALLOWED_GITHUB_LOGIN=`, `MONGODB_URI=`, `ANTHROPIC_API_KEY=`.

- [ ] **Step 2: Update the README setup section**

In the `### 3. Create .env.local` section, replace the variable list with the full set from `.env.example` above, and add these two notes beneath it:

```markdown
`ALLOWED_GITHUB_LOGIN` is required. It is the only thing stopping another
GitHub account from signing in once the app is reachable on a public URL —
and if it is unset, every sign-in is rejected rather than allowed.

`MONGODB_URI` points at a MongoDB Atlas cluster (the free M0 tier is enough).
Local development and the deployed app share one database, so a standup
generated locally shows up on the deployed app and vice versa.
```

- [ ] **Step 3: Add a deployment section to the README**

Append after the existing setup steps:

```markdown
## Deploying to Vercel

1. **MongoDB Atlas** — create a cluster (M0 is enough) and a database user.
   Under *Network Access*, allow `0.0.0.0/0`: Vercel has no static egress IP
   on Hobby/Pro, so the connection string plus a strong database password is
   what protects the data.

2. **Migrate existing local data** (once, from your machine):

   ```bash
   npm run migrate:atlas
   ```

   Upserts `data/config.json`, `data/standup-state.json`, and
   `data/standups/*.json` into Atlas. Safe to re-run; `data/` is left as a backup.

3. **GitHub OAuth App** — add the deployed callback URL:
   `https://<your-app>.vercel.app/api/auth/callback/github`. Preview
   deployments get their own URLs; either register them too or sign in only
   on production.

4. **Vercel environment variables** — set every variable from `.env.example`,
   with `AUTH_URL` pointing at the deployed URL. Mark `ANTHROPIC_API_KEY`,
   `MONGODB_URI`, `AUTH_SECRET`, and `AUTH_GITHUB_SECRET` as Sensitive.
   **Paste values without surrounding quotes.**

5. **Deploy** — `vercel deploy --prod`, or push to the connected branch.

### Cost note

Standup generation moves from a Claude Max subscription to per-token API
billing. Usage is a handful of short prompts a day; the model is
configurable in Settings if you want to trade quality for cost.
```

- [ ] **Step 4: Update `CLAUDE.md`**

In the **Layout** section, replace the `src/lib/config/` bullet and add a database bullet:

```markdown
- `src/lib/db/` — `client.ts` (cached `MongoClient` on `globalThis`; `getDb`/`dbName`), `testing.ts` (`withTestDb` throwaway-database helper for tests).
- `src/lib/config/` — `schema.ts` (zod) + `store.ts` (MongoDB, `server-only`); persisted to the `config` collection.
- `src/lib/auth/allowlist.ts` — pure `isAllowedLogin`, wired into the NextAuth `signIn` callback. Fails closed.
```

In the **Conventions** section, add:

```markdown
- Storage is MongoDB Atlas; local and deployed share one database. Store modules take an optional trailing database-name argument used only by tests (`withTestDb`) — never pass it from application code.
- AI generation goes through the Anthropic API (`ANTHROPIC_API_KEY`). Every failure path must surface as `ClaudeUnavailableError` so `/api/standup` degrades to `{ aiError }` at HTTP 200 rather than a 500.
```

Replace the **Verify** section:

```markdown
## Verify
`npm run typecheck && npm test && npm run build`. Unit tests cover ranking,
GraphQL/notification parsing, the login allowlist, response-block extraction,
and store round-trips. Store tests need `MONGODB_URI` in `.env.local` (loaded
by `vitest.setup.ts`) and run against throwaway databases; they skip
themselves when it is absent. Full GitHub data flow needs a real OAuth login.
```

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: no type errors; all suites PASS; build completes.

- [ ] **Step 6: Confirm no secrets are staged**

```bash
git status --porcelain
git check-ignore -q .env.local secrets.local.md data && echo "secrets ignored: OK"
```

Expected: neither `.env.local`, `secrets.local.md`, nor `data/` appears in `git status`.

- [ ] **Step 7: Commit**

```bash
git add .env.example README.md CLAUDE.md
git commit -m "docs: env and deployment setup for Vercel + Atlas

Documents the new required vars (ALLOWED_GITHUB_LOGIN, MONGODB_URI,
ANTHROPIC_API_KEY), the one-off migration, and the unquoted-value
requirement for Vercel's env var UI."
```

---

## Done when

- `npm run typecheck && npm test && npm run build` all pass.
- The dashboard reads its 33 repos from Atlas, not `data/`.
- Standup generation and screenshot extraction work through the Anthropic API.
- A GitHub login other than `ALLOWED_GITHUB_LOGIN` is rejected at sign-in.
- `data/` is untouched and still gitignored, as a backup.

## Left to the user

- Atlas *Network Access* `0.0.0.0/0`.
- Adding environment variables in the Vercel dashboard.
- Registering the deployed OAuth callback URL.
- Running `vercel deploy`.

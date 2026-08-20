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

  it("does not leak _id into returned documents", async () => {
    await withTestDb(async (db) => {
      await writeDay(day("2026-07-24"), db);
      expect(await readDay("2026-07-24", db)).not.toHaveProperty("_id");
      expect((await recentDays(1, db))[0]).not.toHaveProperty("_id");
    });
  });
});

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

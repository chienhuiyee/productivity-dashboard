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

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

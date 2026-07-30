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

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

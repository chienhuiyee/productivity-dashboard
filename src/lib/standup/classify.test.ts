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

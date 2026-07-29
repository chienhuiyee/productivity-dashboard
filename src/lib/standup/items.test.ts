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

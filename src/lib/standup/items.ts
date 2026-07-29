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

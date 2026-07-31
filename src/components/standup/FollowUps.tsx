"use client";

import type { ReactNode } from "react";
import type { StandupOp } from "@/hooks/useStandup";
import { dayCount, openItems } from "@/lib/standup/items";
import type { ItemType, TrackedItem } from "@/lib/standup/types";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

/** Shared type -> badge color mapping (also used by AddItem's live preview). */
export const TYPE_VARIANT: Record<ItemType, BadgeVariant> = {
  meeting: "blue",
  task: "amber",
  review: "orange",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The small "day 3" / "⏰ Tue, 3:00 PM" chip that ages a tracked item. */
function dueBadge(item: TrackedItem): string {
  if (item.scheduledFor) return `⏰ ${formatWhen(item.scheduledFor)}`;
  const days = dayCount(item, Date.now());
  return days === 0 ? "added today" : `day ${days}`;
}

/** The question we nudge the user with, tailored to type + whether it was scheduled. */
function promptFor(item: TrackedItem): string {
  if (item.scheduledFor) return `Scheduled for ${formatWhen(item.scheduledFor)} — I’ll ask you after it happens.`;
  if (item.type === "meeting") return "Did it happen? Any follow-up scheduled?";
  if (item.type === "review") return "Finished reviewing?";
  return "Finished, or still on it?";
}

function ActionButton({
  onClick,
  subtle,
  children,
}: {
  onClick: () => void;
  subtle?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        subtle
          ? "text-muted hover:bg-surface-muted hover:text-foreground"
          : "border border-border hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** Header + list of still-open tracked items, with type-aware resolve/follow-up/drop actions. */
export function FollowUps({
  items,
  mutateOp,
}: {
  items: TrackedItem[];
  mutateOp: (body: StandupOp) => Promise<void>;
}) {
  const open = openItems(items);

  return (
    <>
      <header className="flex items-center justify-between px-5 py-3">
        <h2 className="text-sm font-semibold">Follow-ups — still open from before</h2>
        <Badge variant={open.length > 0 ? "amber" : "gray"}>{open.length}</Badge>
      </header>

      {open.length === 0 ? (
        <p className="border-t border-border px-5 py-6 text-center text-sm text-muted">
          Nothing open — you’re all caught up.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {open.map((item) => (
            <li key={item.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Badge variant={TYPE_VARIANT[item.type]}>{item.type}</Badge>
                <span>{item.text}</span>
                <Badge variant="gray">{dueBadge(item)}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted">{promptFor(item)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ActionButton onClick={() => mutateOp({ op: "resolve", id: item.id, status: "done" })}>
                  Done
                </ActionButton>
                {item.type === "meeting" && (
                  <ActionButton onClick={() => mutateOp({ op: "followup", id: item.id })}>
                    + Follow-up
                  </ActionButton>
                )}
                <ActionButton subtle onClick={() => mutateOp({ op: "resolve", id: item.id, status: "dropped" })}>
                  Drop
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

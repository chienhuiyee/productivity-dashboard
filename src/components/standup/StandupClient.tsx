"use client";

import { useState, type ReactNode } from "react";
import { useStandup } from "@/hooks/useStandup";
import { HistoryPanel } from "./HistoryPanel";
import { TodayPanel } from "./TodayPanel";

type SubView = "today" | "history";

function SubNavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** The /standup client subtree: SWR-backed data + the Today/History sub-nav. */
export function StandupClient() {
  const { data, isLoading, error, mutateOp, action } = useStandup();
  const [sub, setSub] = useState<SubView>("today");

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Standup sections"
        className="inline-flex w-fit items-center gap-0.5 rounded-full border border-border bg-surface p-1"
      >
        <SubNavButton active={sub === "today"} onClick={() => setSub("today")}>
          Today’s standup
        </SubNavButton>
        <SubNavButton active={sub === "history"} onClick={() => setSub("history")}>
          History
        </SubNavButton>
      </div>

      {sub === "today" ? (
        <TodayPanel data={data} isLoading={isLoading} error={error} mutateOp={mutateOp} action={action} />
      ) : (
        <HistoryPanel data={data} action={action} />
      )}
    </div>
  );
}

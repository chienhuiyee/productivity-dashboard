"use client";

import { RefreshCw } from "lucide-react";

export function RefreshButton({
  onRefresh,
  isRefreshing,
}: {
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <RefreshCw
        className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
        strokeWidth={1.75}
        aria-hidden
      />
      {isRefreshing ? "Refreshing" : "Refresh"}
    </button>
  );
}

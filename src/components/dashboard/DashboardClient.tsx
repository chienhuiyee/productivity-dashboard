"use client";

import Link from "next/link";
import { useState } from "react";
import { useGithubData } from "@/hooks/useGithubData";
import type { RepoError } from "@/lib/github/types";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { AnalysisPanel } from "./AnalysisPanel";
import type { DetailTab, PrFocus, TileKind } from "./focusFilter";
import { RefreshButton } from "./RefreshButton";
import { TabbedDetail } from "./TabbedDetail";

export function DashboardClient({ refreshIntervalMs }: { refreshIntervalMs: number }) {
  const { data, error, isLoading, isRefreshing, refresh } = useGithubData(refreshIntervalMs);
  const [tab, setTab] = useState<DetailTab>("prs");
  const [prFocus, setPrFocus] = useState<PrFocus>("all");

  function selectTile(kind: TileKind) {
    if (kind === "failing") {
      setTab("actions");
      return;
    }
    if (kind === "waiting") {
      setTab("notifications");
      return;
    }
    setTab("prs");
    setPrFocus(kind === "open" ? "all" : kind);
  }

  const activeKind: TileKind =
    tab === "actions"
      ? "failing"
      : tab === "notifications"
        ? "waiting"
        : prFocus === "all"
          ? "open"
          : prFocus;

  if (isLoading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <p className="font-medium">Couldn’t load GitHub data.</p>
        <p className="mt-1">{error.message}</p>
        <button
          type="button"
          onClick={refresh}
          className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 font-medium transition-colors hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  if (data.repoCount === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
        <h2 className="font-serif text-xl font-semibold">No repos configured yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Add the repositories you want to monitor to start seeing open pull requests and failing
          Actions.
        </p>
        <Link
          href="/config"
          className="mt-4 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Configure repos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {data.cached ? "cached · " : ""}updated <RelativeTime iso={data.generatedAt} />
          {data.rateLimit ? ` · ${data.rateLimit.remaining} API points left` : ""}
          {error ? " · last refresh failed" : ""}
        </p>
        <RefreshButton onRefresh={refresh} isRefreshing={isRefreshing} />
      </div>

      <AnalysisPanel data={data} activeKind={activeKind} onSelectTile={selectTile} />

      <TabbedDetail
        data={data}
        tab={tab}
        onTabChange={setTab}
        prFocus={prFocus}
        onClearFocus={() => setPrFocus("all")}
      />

      {data.errors.length > 0 && <RepoErrors errors={data.errors} />}
    </div>
  );
}

function RepoErrors({ errors }: { errors: RepoError[] }) {
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <p className="font-medium text-amber-800 dark:text-amber-300">
        {errors.length} repo{errors.length === 1 ? "" : "s"} couldn’t be loaded
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-amber-700 dark:text-amber-300/90">
        {errors.map((e) => (
          <li key={e.repo}>
            <span className="font-mono">{e.repo}</span> — {e.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-5">
      <div className="h-28 rounded-xl border border-border bg-surface" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 rounded-xl border border-border bg-surface" />
        <div className="h-64 rounded-xl border border-border bg-surface" />
      </div>
    </div>
  );
}

"use client";

import { useGithubData } from "@/hooks/useGithubData";
import { useStandup } from "@/hooks/useStandup";
import { computeGlanceCounts } from "@/lib/github/glance";
import { selectNeedsYou, selectOpenWork } from "@/lib/home/select";
import { buildBriefing } from "@/lib/home/briefing";
import type { GithubData, RepoError } from "@/lib/github/types";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { RefreshButton } from "@/components/dashboard/RefreshButton";
import { Briefing } from "./Briefing";
import { GlancePills } from "./GlancePills";
import { NeedsYouQueue } from "./NeedsYouQueue";
import { OpenWork } from "./OpenWork";
import { StandupMini } from "./StandupMini";

// Same default the sidebar uses (matches the config schema default of 300_000ms); HomeClient
// doesn't receive the user's configured interval as a prop, so it mirrors Sidebar.tsx here.
const HOME_REFRESH_INTERVAL_MS = 300_000;

// Kept out of the component body so the Date.now() read isn't an impure render.
function computeHomeData(data: GithubData, viewer: string | null) {
  const now = Date.now();
  const counts = computeGlanceCounts(data, now);
  const needs = selectNeedsYou(data, now);
  const openWork = selectOpenWork(data, now);
  const briefing = buildBriefing(needs, counts.failing, now, viewer);
  return { counts, needs, openWork, briefing };
}

export function HomeClient({ viewer }: { viewer: string | null }) {
  const { data, isLoading, error, isRefreshing, refresh } = useGithubData(HOME_REFRESH_INTERVAL_MS);
  const standup = useStandup();

  if (isLoading && !data) return <HomeSkeleton />;
  if (error && !data) return <HomeError onRetry={refresh} message={error.message} />;
  if (!data) return null;

  const { counts, needs, openWork, briefing } = computeHomeData(data, viewer);

  return (
    <div className="flex flex-col gap-9">
      <div>
        <Briefing briefing={briefing} />
        <GlancePills counts={counts} />
      </div>

      <NeedsYouQueue items={needs} />

      <div className="grid gap-5 lg:grid-cols-2">
        <OpenWork items={openWork} />
        <StandupMini standup={standup} />
      </div>

      {data.errors.length > 0 && <RepoErrors errors={data.errors} />}

      <footer className="flex items-center gap-3 border-t border-border pt-4 text-xs text-muted">
        <span>
          {data.cached ? "cached · " : ""}updated <RelativeTime iso={data.generatedAt} />
          {data.rateLimit ? ` · ${data.rateLimit.remaining} API points left` : ""}
          {error ? " · last refresh failed" : ""}
        </span>
        <span className="ml-auto">
          <RefreshButton onRefresh={refresh} isRefreshing={isRefreshing} />
        </span>
      </footer>
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

function HomeError({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      <p className="font-medium">Couldn’t load your Home overview.</p>
      <p className="mt-1">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 font-medium transition-colors hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
      >
        Try again
      </button>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-9">
      <div className="h-40 rounded-xl border border-border bg-surface" />
      <div className="flex flex-col gap-2.5">
        <div className="h-16 rounded-xl border border-border bg-surface" />
        <div className="h-16 rounded-xl border border-border bg-surface" />
        <div className="h-16 rounded-xl border border-border bg-surface" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 rounded-xl border border-border bg-surface" />
        <div className="h-64 rounded-xl border border-border bg-surface" />
      </div>
    </div>
  );
}

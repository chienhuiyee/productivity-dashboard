"use client";

import type { StandupAction, StandupActionResult, StandupGetData, StandupOp } from "@/hooks/useStandup";
import { AddItem } from "./AddItem";
import { FactsPanel } from "./FactsPanel";
import { FollowUps } from "./FollowUps";
import { GenerateBlock } from "./GenerateBlock";

/** The "Today" sub-panel: window banner, follow-ups + add box, generate block, facts grid. */
export function TodayPanel({
  data,
  isLoading,
  error,
  mutateOp,
  action,
}: {
  data: StandupGetData | undefined;
  isLoading: boolean;
  error?: Error;
  mutateOp: (body: StandupOp) => Promise<void>;
  action: (body: StandupAction) => Promise<StandupActionResult>;
}) {
  if (isLoading && !data) return <TodaySkeleton />;

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <p className="font-medium">Couldn’t load standup — your GitHub session may have expired.</p>
        <p className="mt-1">Refresh the page.</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-muted">{data.window.label} → today</p>

      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <FollowUps items={data.items} mutateOp={mutateOp} />
        <AddItem mutateOp={mutateOp} action={action} />
      </section>

      <GenerateBlock initialText={data.today?.generatedText ?? ""} action={action} mutateOp={mutateOp} />

      <FactsPanel facts={data.facts} />

      <p className="text-center text-xs text-muted">
        Facts are pulled from GitHub automatically; prose is generated only when you click.
        <br />
        If Claude Code isn’t reachable, you still get the bullets above — just unpolished.
      </p>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-5">
      <div className="h-52 rounded-xl border border-border bg-surface" />
      <div className="h-40 rounded-xl border border-border bg-surface" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="h-40 rounded-xl border border-border bg-surface" />
        <div className="h-40 rounded-xl border border-border bg-surface" />
      </div>
    </div>
  );
}

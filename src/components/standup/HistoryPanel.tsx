"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { StandupAction, StandupActionResult, StandupGetData } from "@/hooks/useStandup";
import type { StandupDay } from "@/lib/standup/types";
import { CopyButton } from "@/components/ui/CopyButton";
import { renderStandup } from "./standupText";

type RollRange = "week" | "month";

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function postedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** Week/month AI roll-up + a browsable list of past days with a read-only saved-report panel. */
export function HistoryPanel({
  data,
  action,
}: {
  data: StandupGetData | undefined;
  action: (body: StandupAction) => Promise<StandupActionResult>;
}) {
  const [rollRange, setRollRange] = useState<RollRange | null>(null);
  const [rollText, setRollText] = useState("");
  const [rollLoading, setRollLoading] = useState(false);
  const [rollHint, setRollHint] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<StandupDay | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayHint, setDayHint] = useState<string | null>(null);

  async function runRollup(range: RollRange) {
    setRollRange(range);
    setRollLoading(true);
    setRollHint(null);
    try {
      const res = await action({ action: "rollup", range });
      if (res.aiError || res.error) {
        setRollHint(res.aiError ?? res.error ?? null);
        setRollText("");
      } else if (res.text !== undefined) {
        setRollText(res.text);
      }
    } catch {
      setRollHint("Couldn't generate the roll-up — try again.");
    } finally {
      setRollLoading(false);
    }
  }

  async function viewDay(date: string) {
    setSelectedDate(date);
    setSelectedDay(null);
    setDayLoading(true);
    setDayHint(null);
    try {
      const res = await fetch(`/api/standup?date=${encodeURIComponent(date)}`);
      if (!res.ok) {
        setDayHint("Couldn’t load that day.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      setSelectedDay(body.day ?? null);
    } catch {
      setDayHint("Couldn’t load that day.");
    } finally {
      setDayLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
        <p className="text-sm text-muted">Loading standup history…</p>
      </div>
    );
  }

  const days = data.days;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            {rollRange ? `${rollRange === "week" ? "This week" : "This month"} — AI roll-up` : "Roll-up"}
          </h2>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void runRollup("week")}
              disabled={rollLoading}
              className={`rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted disabled:opacity-60 ${
                rollRange === "week" ? "bg-surface-muted" : ""
              }`}
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => void runRollup("month")}
              disabled={rollLoading}
              className={`rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted disabled:opacity-60 ${
                rollRange === "month" ? "bg-surface-muted" : ""
              }`}
            >
              This month
            </button>
          </div>
        </header>

        {rollHint && (
          <p className="border-b border-border bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Claude Code unavailable — run <code className="font-mono">claude setup-token</code>. Try again once it’s
            set up.
          </p>
        )}

        {rollLoading ? (
          <p className="px-5 py-6 text-center text-sm text-muted">Summarizing…</p>
        ) : rollText ? (
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">{renderStandup(rollText)}</div>
            <CopyButton value={rollText} />
          </div>
        ) : (
          <p className="px-5 py-6 text-center text-sm text-muted">
            Pick a range above for an AI roll-up of merged PRs, reviews, and themes.
          </p>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Past standups</h2>
          </header>
          {days.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">No saved standups yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {days.map((d) => (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => void viewDay(d.date)}
                    aria-current={selectedDate === d.date}
                    className={`flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-sm font-medium transition-colors hover:bg-surface-muted ${
                      selectedDate === d.date ? "bg-surface-muted" : ""
                    }`}
                  >
                    <span>{formatDayLabel(d.date)}</span>
                    {d.posted && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                        <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        posted
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">
              {selectedDate ? `${formatDayLabel(selectedDate)} — saved report` : "Saved report"}
            </h2>
          </header>
          {!selectedDate ? (
            <p className="px-5 py-6 text-center text-sm text-muted">Pick a day on the left to view its report.</p>
          ) : dayLoading ? (
            <p className="px-5 py-6 text-center text-sm text-muted">Loading…</p>
          ) : dayHint ? (
            <p className="px-5 py-6 text-center text-sm text-muted">{dayHint}</p>
          ) : !(selectedDay?.postedText || selectedDay?.generatedText) ? (
            <p className="px-5 py-6 text-center text-sm text-muted">No standup was saved for this day.</p>
          ) : (
            <div className="px-5 py-4">
              {selectedDay?.postedAt && (
                <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Posted · {postedLabel(selectedDay.postedAt)}
                </p>
              )}
              {renderStandup((selectedDay?.postedText ?? selectedDay?.generatedText) as string)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

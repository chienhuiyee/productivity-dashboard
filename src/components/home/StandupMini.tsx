"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { UseStandupReturn } from "@/hooks/useStandup";
import { CopyButton } from "@/components/ui/CopyButton";
import { renderStandup } from "@/components/standup/standupText";

/** A compact "today's standup" card: generated prose, a quick-add box, and a link to the full page. */
export function StandupMini({ standup }: { standup: UseStandupReturn }) {
  const { data, isLoading, mutateOp } = standup;
  const [text, setText] = useState("");

  const generated = data?.today?.generatedText ?? "";
  const posted = Boolean(data?.today?.postedAt);
  const badge = posted ? "posted" : generated ? "draft" : "empty";

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    await mutateOp({ op: "add", text: value });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void submit();
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <h2 className="font-serif text-base font-semibold">Today’s standup</h2>
        <span className="ml-auto rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted">
          {badge}
        </span>
      </header>

      <div className="flex flex-col gap-4 px-5 py-4">
        {isLoading && !data ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : generated ? (
          renderStandup(generated)
        ) : (
          <p className="text-sm text-muted">
            Nothing generated yet — open standup to build today’s report from your GitHub activity.
          </p>
        )}

        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Add something you’re tracking…"
            aria-label="Add a tracked item"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim()}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Add
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/standup"
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Open standup
          </Link>
          {generated && <CopyButton value={generated} />}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, Copy, Pencil, Sparkles } from "lucide-react";
import type { StandupAction, StandupActionResult, StandupOp } from "@/hooks/useStandup";
import { renderStandup } from "./standupText";

/** "Posted · Thu, 9:52 AM" label for the reported timestamp. */
function postedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** Generate + rendered standup (Edit toggle) + Copy + Mark-as-posted. */
export function GenerateBlock({
  initialText,
  initialPostedAt,
  action,
  mutateOp,
}: {
  initialText: string;
  initialPostedAt: string | null;
  action: (body: StandupAction) => Promise<StandupActionResult>;
  mutateOp: (body: StandupOp) => Promise<void>;
}) {
  const [text, setText] = useState(initialText);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [postedAt, setPostedAt] = useState<string | null>(initialPostedAt);

  async function generate() {
    if (postedAt && !window.confirm("You marked today as posted. Generate a new draft? Your posted report stays as-is.")) {
      return;
    }
    setGenerating(true);
    setAiError(null);
    try {
      const res = await action({ action: "generate" });
      if (res.aiError || res.error) {
        setAiError(res.aiError ?? res.error ?? null);
      } else if (res.text !== undefined) {
        setText(res.text);
        setEditing(false);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function saveText() {
    await mutateOp({ op: "saveText", text });
  }

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked (e.g. non-secure context); fail silently.
    }
  }

  async function markPosted() {
    await mutateOp({ op: "post", text });
    setPostedAt(new Date().toISOString());
    setEditing(false);
  }

  async function reopen() {
    await mutateOp({ op: "unpost" });
    setPostedAt(null);
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-muted">
          Ready to post. <span className="font-medium text-foreground">Generate</span> turns the facts below
          into speakable prose you can edit.
        </p>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {generating ? "Generating…" : text ? "Regenerate" : "Generate standup"}
        </button>
      </div>

      {aiError && (
        <p className="border-t border-border bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Claude Code unavailable — run <code className="font-mono">claude setup-token</code>. Facts are below.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-muted px-5 py-2.5">
        {postedAt ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Posted · {postedLabel(postedAt)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Polished by Claude
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (editing) void saveText();
              setEditing((e) => !e);
            }}
            disabled={!text && !editing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {editing ? "Done" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!text}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface disabled:opacity-50"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          {postedAt ? (
            <button
              type="button"
              onClick={() => void reopen()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              Reopen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void markPosted()}
              disabled={!text}
              className="rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              Mark as posted
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void saveText()}
          placeholder="Write your own Yesterday / Today notes here."
          rows={14}
          spellCheck={false}
          aria-label="Edit standup text"
          className="w-full resize-y bg-transparent px-5 py-4 font-mono text-sm leading-relaxed outline-none placeholder:text-muted"
        />
      ) : text ? (
        <div className="px-5 py-4">{renderStandup(text)}</div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted">
          Click <span className="font-medium text-foreground">Generate standup</span> to create it, or
          <span className="font-medium text-foreground"> Edit</span> to write your own.
        </p>
      )}
    </section>
  );
}

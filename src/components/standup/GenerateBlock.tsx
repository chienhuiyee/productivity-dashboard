"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import type { StandupAction, StandupOp } from "@/hooks/useStandup";

/** Generate button + editable Yesterday/Today prose + Copy, with an AI-unavailable fallback hint. */
export function GenerateBlock({
  initialText,
  action,
  mutateOp,
}: {
  initialText: string;
  action: (body: StandupAction) => Promise<{ text?: string; items?: string[]; aiError?: string }>;
  mutateOp: (body: StandupOp) => Promise<void>;
}) {
  const [text, setText] = useState(initialText);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setAiError(null);
    try {
      const res = await action({ action: "generate" });
      if (res.aiError) {
        setAiError(res.aiError);
      } else if (res.text !== undefined) {
        setText(res.text);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function saveOnBlur() {
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

      <div className="flex items-center justify-between border-t border-border bg-surface-muted px-5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Polished by Claude · editable
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void saveOnBlur()}
        placeholder="Click Generate, or write your own Yesterday / Today notes here."
        rows={10}
        spellCheck={false}
        aria-label="Generated standup text"
        className="w-full resize-y bg-transparent px-5 py-4 text-sm leading-relaxed outline-none placeholder:text-muted"
      />
    </section>
  );
}

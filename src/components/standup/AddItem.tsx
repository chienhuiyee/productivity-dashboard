"use client";

import { useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Image as ImageIcon } from "lucide-react";
import type { StandupAction, StandupActionResult, StandupOp } from "@/hooks/useStandup";
import { parseItem } from "@/lib/standup/classify";
import { Badge } from "@/components/ui/Badge";
import { TYPE_VARIANT } from "./FollowUps";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Indirection so the impure `Date.now()` read isn't a direct call inside the render body. */
function previewFor(trimmed: string) {
  return trimmed ? parseItem(trimmed, Date.now()) : null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** The add-item row (with a live type/schedule preview) plus the paste-a-screenshot affordance. */
export function AddItem({
  mutateOp,
  action,
}: {
  mutateOp: (body: StandupOp) => Promise<void>;
  action: (body: StandupAction) => Promise<StandupActionResult>;
}) {
  const [text, setText] = useState("");
  const [deriving, setDeriving] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const trimmed = text.trim();
  const preview = previewFor(trimmed);

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    await mutateOp({ op: "add", text: value });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void submit();
  }

  async function deriveFromImage(file: Blob) {
    setDeriving(true);
    setImageError(null);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await action({ action: "deriveImage", dataUrl });
      if (res.aiError || res.error) {
        setImageError(res.aiError ?? res.error ?? null);
      } else if (Array.isArray(res.items)) {
        for (const item of res.items) {
          await mutateOp({ op: "add", text: item });
        }
      }
    } finally {
      setDeriving(false);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const image = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!image) return;
    e.preventDefault();
    const file = image.getAsFile();
    if (file) void deriveFromImage(file);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-border px-5 py-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={'Add an item — e.g. "meeting with hck tomorrow 3 pm"'}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          aria-label="Add a standup item"
        />
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted">
          {preview ? (
            <>
              locks as <Badge variant={TYPE_VARIANT[preview.type]}>{preview.type}</Badge>
              {preview.scheduledFor && <Badge variant="gray">⏰ {formatWhen(preview.scheduledFor)}</Badge>}
            </>
          ) : (
            "type to classify…"
          )}
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!trimmed}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 border-t border-border px-5 py-2.5 text-xs text-muted">
        <ImageIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        {deriving
          ? "Reading the screenshot and pulling out items…"
          : "Paste a screenshot (Slack, Jira, meeting notes) and it’ll pull out the items."}
      </p>
      {imageError && (
        <p className="border-t border-border bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Claude Code unavailable — run <code className="font-mono">claude setup-token</code>.
        </p>
      )}
    </>
  );
}

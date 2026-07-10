"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked (e.g. non-secure context); fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      aria-label={`Copy ${value} to clipboard`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

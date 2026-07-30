"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Briefing as BriefingData } from "@/lib/home/briefing";

// Kept out of the component body so the `new Date()` read isn't an impure render.
function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** The morning-briefing masthead: eyebrow date, greeting + plain-language lead, and the primary CTA. */
export function Briefing({ briefing }: { briefing: BriefingData }) {
  const [dismissed, setDismissed] = useState(false);

  return (
    <header className="flex flex-col">
      <div className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{todayLabel()}</span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>

      {dismissed ? (
        <p className="mt-4 font-serif text-xl text-muted">Nice — you’re set for now.</p>
      ) : (
        <>
          <h1 className="mt-3.5 font-serif text-[28px] font-semibold tracking-tight sm:text-[34px]">
            {briefing.greeting}
          </h1>
          <p className="mt-1 max-w-[30ch] text-balance font-serif text-xl leading-snug sm:text-2xl">
            {briefing.lead}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {briefing.primary && (
              <a
                href={briefing.primary.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {briefing.primary.label}
              </a>
            )}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-popover-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
              I’m caught up
            </button>
          </div>
        </>
      )}
    </header>
  );
}

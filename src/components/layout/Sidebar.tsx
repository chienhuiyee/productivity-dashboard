"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, GitPullRequest, Home, Settings } from "lucide-react";
import { useGithubData } from "@/hooks/useGithubData";
import { computeGlanceCounts } from "@/lib/github/glance";
import type { GithubData } from "@/lib/github/types";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NAV_ITEMS, type NavItem } from "./navItems";

// lucide-react v1 dropped brand icons (no `Github`); GitPullRequest reads well for the
// "GitHub" nav item since that module surfaces PRs/notifications waiting on you.
const ICONS = { home: Home, github: GitPullRequest, calendar: Calendar, settings: Settings };

// Matches the config default (src/lib/config/schema.ts); the SWR cache key ("/api/github")
// is what dedupes with the page's own fetch, not this interval.
const SIDEBAR_REFRESH_INTERVAL_MS = 300_000;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Kept out of the component body so the Date.now() read isn't an impure render.
function computeWaiting(data: GithubData | undefined): number {
  return data ? computeGlanceCounts(data, Date.now()).waiting : 0;
}

export function Sidebar({ signInSlot }: { signInSlot: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useGithubData(SIDEBAR_REFRESH_INTERVAL_MS);
  const waiting = computeWaiting(data);

  return (
    <aside className="sticky top-0 flex h-screen flex-col gap-1 border-r border-border bg-surface/60 px-4 py-5">
      <div className="flex items-center gap-2.5 px-2.5 pb-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-serif text-lg font-bold text-background shadow-sm">P</span>
        <span className="font-serif text-sm font-semibold leading-tight">
          Productivity
          <span className="block font-sans text-[11px] font-medium text-muted">what needs your attention</span>
        </span>
      </div>

      <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Workspace</p>
      {NAV_ITEMS.map((item: NavItem) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              active ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-popover-hover hover:text-foreground"
            }`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.9} aria-hidden />
            {item.label}
            {item.icon === "github" && waiting > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 font-mono text-[11px] font-semibold text-white">
                {waiting}
              </span>
            )}
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted">Theme</span>
          <ThemeToggle />
        </div>
        <div className="px-1">{signInSlot}</div>
      </div>
    </aside>
  );
}

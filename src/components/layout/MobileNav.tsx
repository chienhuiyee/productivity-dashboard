"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, GitPullRequest, Home, Settings } from "lucide-react";
import { NAV_ITEMS } from "./navItems";

// lucide-react v1 dropped brand icons (no `Github`); GitPullRequest reads well for the
// "GitHub" nav item since that module surfaces PRs/notifications waiting on you.
const ICONS = { home: Home, github: GitPullRequest, calendar: Calendar, settings: Settings };

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface/90 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

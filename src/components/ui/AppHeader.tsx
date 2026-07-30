import Link from "next/link";
import { SignInOut } from "@/components/auth/SignInOut";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

type Page = "dashboard" | "standup";

const TITLES: Record<Page, { title: string; subtitle: string }> = {
  dashboard: { title: "Productivity Dashboard", subtitle: "What needs your attention right now." },
  standup: { title: "Daily Standup", subtitle: "What you did, and what’s next." },
};

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * Shared header for the top-level pages: title + theme/config/sign-out controls,
 * and a Dashboard/Standup segmented nav so the two routes read as one product.
 */
export function AppHeader({ active }: { active: Page }) {
  const { title, subtitle } = TITLES[active];
  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/config"
            className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            Configure
          </Link>
          <SignInOut />
        </div>
      </header>
      <nav
        aria-label="Primary"
        className="mb-8 inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-1"
      >
        <NavLink href="/" label="Dashboard" active={active === "dashboard"} />
        <NavLink href="/standup" label="Standup" active={active === "standup"} />
      </nav>
    </>
  );
}

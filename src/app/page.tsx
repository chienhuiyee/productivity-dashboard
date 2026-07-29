import Link from "next/link";
import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInOut, SignInPrompt } from "@/components/auth/SignInOut";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const config = await readConfig();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Productivity Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted">What needs your attention right now.</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/standup"
            className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            Standup
          </Link>
          <Link
            href="/config"
            className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            Configure
          </Link>
          <SignInOut />
        </div>
      </header>

      {session?.accessToken ? (
        <DashboardClient refreshIntervalMs={config.settings.refreshIntervalMs} />
      ) : (
        <SignInPrompt />
      )}
    </div>
  );
}

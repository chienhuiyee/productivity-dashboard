import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { ConfigManager } from "@/components/config/ConfigManager";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const session = await auth();
  const config = await readConfig();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Dashboard
          </Link>
          <ThemeToggle />
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Configuration</h1>
        <p className="mt-1.5 text-sm text-muted">Choose which repositories to monitor.</p>
      </header>

      {session ? (
        <ConfigManager initialRepos={config.repos} initialSettings={config.settings} />
      ) : (
        <SignInPrompt />
      )}
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { HomeClient } from "@/components/home/HomeClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.accessToken) return <SignInPrompt />;

  const config = await readConfig();
  const viewer = session.user?.name ?? session.user?.email ?? null;

  if (config.repos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
        <h2 className="font-serif text-xl font-semibold">No repos configured yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Add repositories to start seeing what needs your attention.
        </p>
        <Link
          href="/config"
          className="mt-4 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Configure repos
        </Link>
      </div>
    );
  }

  return <HomeClient viewer={viewer} />;
}

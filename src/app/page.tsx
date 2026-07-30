import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { AppHeader } from "@/components/ui/AppHeader";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const config = await readConfig();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <AppHeader active="dashboard" />

      {session?.accessToken ? (
        <DashboardClient refreshIntervalMs={config.settings.refreshIntervalMs} />
      ) : (
        <SignInPrompt />
      )}
    </div>
  );
}

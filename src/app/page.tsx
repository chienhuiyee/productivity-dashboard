import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const config = await readConfig();

  return session?.accessToken ? (
    <DashboardClient refreshIntervalMs={config.settings.refreshIntervalMs} />
  ) : (
    <SignInPrompt />
  );
}

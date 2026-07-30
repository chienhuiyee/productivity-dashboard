import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { ConfigManager } from "@/components/config/ConfigManager";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const session = await auth();
  const config = await readConfig();

  return (
    <div>
      <header className="mb-10">
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

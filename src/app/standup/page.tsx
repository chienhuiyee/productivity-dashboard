import { auth } from "@/auth";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { StandupClient } from "@/components/standup/StandupClient";
import { AppHeader } from "@/components/ui/AppHeader";

export const dynamic = "force-dynamic";

export default async function StandupPage() {
  const session = await auth();
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <AppHeader active="standup" />
      {session?.accessToken ? <StandupClient /> : <SignInPrompt />}
    </div>
  );
}

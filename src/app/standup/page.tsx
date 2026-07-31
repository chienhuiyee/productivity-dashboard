import { auth } from "@/auth";
import { SignInPrompt } from "@/components/auth/SignInOut";
import { StandupClient } from "@/components/standup/StandupClient";

export const dynamic = "force-dynamic";

export default async function StandupPage() {
  const session = await auth();
  return session?.accessToken ? <StandupClient /> : <SignInPrompt />;
}

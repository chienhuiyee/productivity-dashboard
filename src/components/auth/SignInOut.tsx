import { auth, signIn, signOut } from "@/auth";

async function doSignIn() {
  "use server";
  await signIn("github", { redirectTo: "/" });
}

async function doSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

/** Header control: shows the signed-in user + sign-out, or a sign-in button. */
export async function SignInOut() {
  const session = await auth();

  if (!session?.user) {
    return (
      <form action={doSignIn}>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Sign in with GitHub
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted">{session.user.name ?? session.user.email}</span>
      <form action={doSignOut}>
        <button
          type="submit"
          className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

/** Full-width prompt shown in the page body when not signed in. */
export function SignInPrompt() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
      <h2 className="font-serif text-xl font-semibold">Sign in to get started</h2>
      <p className="max-w-md text-sm text-muted">
        Connect your GitHub account to see open pull requests and failing Actions across the repos you monitor.
      </p>
      <form action={doSignIn}>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Sign in with GitHub
        </button>
      </form>
    </div>
  );
}

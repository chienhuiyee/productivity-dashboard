import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGithubData } from "@/lib/github/provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in to GitHub" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

  try {
    const data = await getGithubData(session.accessToken, { force });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to load GitHub data" },
      { status: 500 },
    );
  }
}

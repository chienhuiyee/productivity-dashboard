import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCached, setCached } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface RepoOption {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
  pushedAt: string | null;
}

interface RestRepo {
  owner: { login: string };
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  pushed_at: string | null;
}

const CACHE_KEY = "repos:accessible:v2";
const CACHE_TTL_MS = 5 * 60_000;
const PER_PAGE = 100;
const MAX_PAGES = 20; // safety cap = up to 2000 repos

// Sort by full_name (stable) so parallel page fetches don't overlap or gap;
// the response is re-sorted by pushed_at for display.
function pageUrl(page: number): string {
  return `https://api.github.com/user/repos?per_page=${PER_PAGE}&page=${page}&affiliation=owner,collaborator,organization_member&sort=full_name`;
}

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Parse the `rel="last"` page number out of GitHub's Link header. Split on commas
 * (safe — commas inside the URLs are percent-encoded as %2C) and read `page=` from
 * the segment marked rel="last", regardless of where in the query string it sits.
 */
function lastPageFromLink(link: string | null): number {
  if (!link) return 1;
  for (const part of link.split(",")) {
    if (/rel="last"/.test(part)) {
      const m = part.match(/[?&]page=(\d+)/);
      if (m) return Number(m[1]);
    }
  }
  return 1;
}

function normalize(r: RestRepo): RepoOption {
  return {
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    archived: r.archived,
    pushedAt: r.pushed_at,
  };
}

/** Lists every repo the signed-in user can access (owner, collaborator, org member). */
export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in to GitHub" }, { status: 401 });
  }

  const cached = getCached<{ repos: RepoOption[]; owners: string[] }>(CACHE_KEY);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const headers = ghHeaders(session.accessToken);
  const byFullName = new Map<string, RepoOption>();

  try {
    // Page 1 tells us how many pages there are (via the Link header).
    const first = await fetch(pageUrl(1), { headers, cache: "no-store" });
    if (!first.ok) {
      const body = await first.text();
      return NextResponse.json(
        { error: `GitHub API ${first.status}: ${body.slice(0, 200)}` },
        { status: 502 },
      );
    }
    for (const r of (await first.json()) as RestRepo[]) {
      const n = normalize(r);
      byFullName.set(n.fullName, n);
    }

    const lastPage = Math.min(lastPageFromLink(first.headers.get("link")), MAX_PAGES);
    if (lastPage > 1) {
      const pages = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);
      // Bounded concurrency: faster than serial, but gentle enough to avoid
      // GitHub's secondary rate limit that a big parallel burst can trigger.
      const CONCURRENCY = 5;
      for (let i = 0; i < pages.length; i += CONCURRENCY) {
        const group = pages.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          group.map(async (p) => {
            const res = await fetch(pageUrl(p), { headers, cache: "no-store" });
            return res.ok ? ((await res.json()) as RestRepo[]) : [];
          }),
        );
        for (const batch of results) {
          for (const r of batch) {
            const n = normalize(r);
            byFullName.set(n.fullName, n);
          }
        }
      }
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const repos = [...byFullName.values()].sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
  const owners = [...new Set(repos.map((r) => r.owner))].sort((a, b) => a.localeCompare(b));

  const payload = { repos, owners };
  setCached(CACHE_KEY, payload, CACHE_TTL_MS);
  return NextResponse.json({ ...payload, cached: false });
}

"use client";

import { useState } from "react";
import useSWR from "swr";
import type { GithubData } from "@/lib/github/types";

async function fetcher(url: string): Promise<GithubData> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * SWR-backed GitHub data with auto-refresh + a `refresh()` that bypasses the
 * server-side TTL cache (via ?force=1) for an explicit manual refresh.
 */
export function useGithubData(refreshIntervalMs: number) {
  const swr = useSWR<GithubData, Error & { status?: number }>("/api/github", fetcher, {
    refreshInterval: refreshIntervalMs,
    dedupingInterval: 30_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = await fetcher("/api/github?force=1");
      await swr.mutate(fresh, { revalidate: false });
    } catch {
      // Surface the error through SWR's normal error channel.
      await swr.mutate();
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    data: swr.data,
    error: swr.error,
    isLoading: swr.isLoading,
    isRefreshing,
    refresh,
  };
}

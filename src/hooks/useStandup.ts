"use client";

import useSWR from "swr";
import type { StandupDay, StandupFacts, TrackedItem } from "@/lib/standup/types";

/** The from/to/label window the standup covers, as returned by `computeWindow`. */
export interface StandupWindow {
  from: string;
  to: string;
  label: string;
}

/** Shape of `GET /api/standup`. */
export interface StandupGetData {
  window: StandupWindow;
  items: TrackedItem[];
  facts: StandupFacts | null;
  today: StandupDay | null;
  days: string[];
}

/** `PUT /api/standup` bodies. */
export type StandupOp =
  | { op: "add"; text: string }
  | { op: "resolve"; id: string; status: "done" | "dropped" }
  | { op: "followup"; id: string }
  | { op: "notes"; notes: string }
  | { op: "saveText"; text: string };

/** `POST /api/standup` bodies. */
export type StandupAction =
  | { action: "generate"; notes?: string }
  | { action: "rollup"; range?: "week" | "month" }
  | { action: "deriveImage"; dataUrl: string };

export interface StandupActionResult {
  text?: string;
  items?: string[];
  aiError?: string;
  error?: string;
}

const fetcher = async (u: string): Promise<StandupGetData> => {
  const res = await fetch(u);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
};

/** SWR-backed standup state plus PUT/POST helpers for the /standup page. */
export function useStandup() {
  const swr = useSWR<StandupGetData>("/api/standup", fetcher, { revalidateOnFocus: false });

  async function mutateOp(body: StandupOp): Promise<void> {
    await fetch("/api/standup", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await swr.mutate();
  }

  async function action(body: StandupAction): Promise<StandupActionResult> {
    const res = await fetch("/api/standup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  return { data: swr.data, isLoading: swr.isLoading, error: swr.error, reload: swr.mutate, mutateOp, action };
}

export type UseStandupReturn = ReturnType<typeof useStandup>;

"use client";

import { useMemo, useState } from "react";
import { parseRepoSlug, repoKey, type AppSettings, type RepoRef } from "@/lib/config/schema";
import { RepoPicker } from "./RepoPicker";

const INTERVAL_OPTIONS = [
  { label: "1 minute", ms: 60_000 },
  { label: "2 minutes", ms: 120_000 },
  { label: "5 minutes", ms: 300_000 },
  { label: "10 minutes", ms: 600_000 },
  { label: "15 minutes", ms: 900_000 },
  { label: "30 minutes", ms: 1_800_000 },
];

export function ConfigManager({
  initialRepos,
  initialSettings,
}: {
  initialRepos: RepoRef[];
  initialSettings: AppSettings;
}) {
  const [repos, setRepos] = useState<RepoRef[]>(initialRepos);
  const [intervalMs, setIntervalMs] = useState<number>(initialSettings.refreshIntervalMs);
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const existingKeys = useMemo(
    () => new Set(repos.map((r) => repoKey(r).toLowerCase())),
    [repos],
  );

  /** Add one or more space/comma-separated slugs. Returns true if any were added. */
  function addFromText(text: string): boolean {
    setInputError(null);
    const tokens = text
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return false;

    const next = [...repos];
    const seen = new Set(repos.map(repoKey));
    let added = 0;
    let firstError: string | null = null;

    for (const token of tokens) {
      const ref = parseRepoSlug(token);
      if (!ref) {
        firstError = firstError ?? `"${token}" is not a valid owner/repo`;
        continue;
      }
      const key = repoKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(ref);
      added += 1;
    }

    if (added > 0) {
      setRepos(next);
      setStatus("idle");
    }
    if (firstError) setInputError(firstError);
    return added > 0;
  }

  function removeRepo(key: string) {
    setRepos(repos.filter((r) => repoKey(r) !== key));
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repos, settings: { refreshIntervalMs: intervalMs } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (e) {
      setStatus("error");
      setSaveError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Monitored repositories</h2>
        <p className="mt-1 text-sm text-muted">
          Search the repos you have access to and click to add — or type{" "}
          <span className="font-mono">owner/repo</span> (or paste a GitHub URL) for anything else.
        </p>

        <RepoPicker existing={existingKeys} onAdd={addFromText} />
        {inputError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{inputError}</p>}

        {repos.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No repositories yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {repos.map((r) => {
              const key = repoKey(r);
              return (
                <li key={key} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <span className="font-mono text-sm">{key}</span>
                  <button
                    type="button"
                    onClick={() => removeRepo(key)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-red-600 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Auto-refresh</h2>
        <p className="mt-1 text-sm text-muted">How often the dashboard refreshes on its own.</p>
        <select
          value={intervalMs}
          onChange={(e) => {
            setIntervalMs(Number(e.target.value));
            setStatus("idle");
          }}
          className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {INTERVAL_OPTIONS.map((o) => (
            <option key={o.ms} value={o.ms}>
              {o.label}
            </option>
          ))}
        </select>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600 dark:text-red-400">{saveError}</span>
        )}
      </div>
    </div>
  );
}

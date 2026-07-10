"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface RepoOption {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
  pushedAt: string | null;
}

const MAX_SHOWN = 50;
const LOAD_TIMEOUT_MS = 30_000;

/**
 * A searchable dropdown of the user's accessible repos, filterable by owner/org.
 * Clicking a suggestion adds it and keeps the list open (so you can add several in a
 * row); typing `owner/repo` + Enter / Add works for anything not listed.
 */
export function RepoPicker({
  existing,
  onAdd,
}: {
  existing: Set<string>;
  onAdd: (text: string) => boolean;
}) {
  const [options, setOptions] = useState<RepoOption[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, LOAD_TIMEOUT_MS);

    (async () => {
      try {
        const res = await fetch("/api/repos", { signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load repos (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setOptions(data.repos ?? []);
        setOwners(data.owners ?? []);
        setLoadError(null);
      } catch (e) {
        // Ignore aborts caused by Strict Mode unmount; only surface real failures.
        if (cancelled && !timedOut) return;
        setLoadError(timedOut ? "Timed out loading your repos — reload to retry." : (e as Error).message);
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const available = useMemo(
    () =>
      options.filter(
        (o) =>
          !existing.has(o.fullName.toLowerCase()) &&
          (ownerFilter === "" || o.owner === ownerFilter),
      ),
    [options, existing, ownerFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? available.filter((o) => o.fullName.toLowerCase().includes(q)) : available;
    return matched.slice(0, MAX_SHOWN);
  }, [available, query]);

  /** Add a suggestion but keep the search open so several can be added in a row. */
  function addSuggestion(fullName: string) {
    onAdd(fullName);
    setHighlight(0);
    inputRef.current?.focus();
  }

  /** Add whatever was typed (free-text repo), clearing the box afterward. */
  function addTyped() {
    const text = query.trim();
    if (!text) return;
    if (onAdd(text)) {
      setQuery("");
      setHighlight(0);
    }
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlight]) addSuggestion(filtered[highlight].fullName);
      else addTyped();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const hiddenCount = available.length - filtered.length;

  return (
    <div ref={boxRef} className="relative mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {owners.length > 1 && (
          <select
            value={ownerFilter}
            onChange={(e) => {
              setOwnerFilter(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-accent"
            aria-label="Filter by owner or organization"
          >
            <option value="">All owners ({owners.length})</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            loading ? "Loading your repos… (a few seconds the first time)" : "Search repos, or type owner/repo"
          }
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          role="combobox"
          aria-expanded={open}
          aria-controls="repo-listbox"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={addTyped}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Add
        </button>
      </div>

      {loadError ? (
        <p className="mt-2 text-xs text-muted">
          Couldn’t load your repo list ({loadError}). You can still type{" "}
          <span className="font-mono">owner/repo</span> manually.
        </p>
      ) : (
        !loading &&
        options.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            You can access {options.length} repos across {owners.length} owners. Click to add several
            in a row.
          </p>
        )
      )}

      {open && filtered.length > 0 && (
        <ul
          id="repo-listbox"
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover py-1 shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
        >
          {filtered.map((o, i) => (
            <li key={o.fullName} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => addSuggestion(o.fullName)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-popover-hover" : ""
                }`}
              >
                <span className={`min-w-0 truncate font-mono ${o.archived ? "opacity-50" : ""}`}>
                  {o.fullName}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {o.private && (
                    <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted dark:bg-white/10">
                      private
                    </span>
                  )}
                  {o.archived && (
                    <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted dark:bg-white/10">
                      archived
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="border-t border-border px-3 py-2 text-xs text-muted">
              Showing {filtered.length} of {available.length} — keep typing to filter.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

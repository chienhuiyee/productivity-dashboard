import type { GithubData } from "@/lib/github/types";
import type { TileKind } from "./focusFilter";

const DAY = 86_400_000;

type Tone = "neutral" | "amber" | "orange" | "red" | "rose";

// Status is carried by a dot + label (never color alone); the number stays in ink.
const DOT: Record<Tone, string> = {
  neutral: "bg-zinc-400 dark:bg-zinc-600",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  rose: "bg-rose-500",
};

interface Tile {
  kind: TileKind;
  label: string;
  value: number;
  tone: Tone;
}

// Kept out of the component body so the Date.now() read isn't an impure render.
function computeTiles(data: GithubData): Tile[] {
  const now = Date.now();
  const active = data.prs.filter((p) => !p.isDraft);
  const needsReview = active.filter((p) => p.reviewRequestedForMe).length;
  const conflicts = data.prs.filter((p) => p.mergeable === "CONFLICTING").length;
  const aging = active.filter((p) => now - Date.parse(p.createdAt) >= 3 * DAY).length;
  const stale = active.filter(
    (p) => now - Date.parse(p.lastActivity.at ?? p.createdAt) >= 2 * DAY,
  ).length;

  return [
    { kind: "failing", label: "Failing main", value: data.actions.length, tone: data.actions.length ? "red" : "neutral" },
    { kind: "conflicts", label: "Conflicts", value: conflicts, tone: conflicts ? "rose" : "neutral" },
    { kind: "review", label: "Your review", value: needsReview, tone: needsReview ? "amber" : "neutral" },
    { kind: "aging", label: "Aging 3d+", value: aging, tone: aging ? "orange" : "neutral" },
    { kind: "stale", label: "Stale 2d+", value: stale, tone: stale ? "amber" : "neutral" },
    { kind: "open", label: "Open PRs", value: data.prs.length, tone: "neutral" },
  ];
}

function StatTile({
  tile,
  active,
  onSelect,
}: {
  tile: Tile;
  active: boolean;
  onSelect: (k: TileKind) => void;
}) {
  // A filter tile with nothing to show isn't worth navigating to.
  const disabled = tile.value === 0 && tile.kind !== "open" && tile.kind !== "failing";

  return (
    <button
      type="button"
      onClick={() => onSelect(tile.kind)}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-xl border bg-surface p-4 text-left shadow-sm transition-colors ${
        active ? "border-accent ring-1 ring-accent" : "border-border"
      } ${disabled ? "cursor-default opacity-50" : "hover:border-accent/50"}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tile.tone]}`} aria-hidden />
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted">{tile.label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</p>
    </button>
  );
}

/** Top-of-dashboard "at a glance" metrics; click a tile to filter the list below. */
export function AnalysisPanel({
  data,
  activeKind,
  onSelectTile,
}: {
  data: GithubData;
  activeKind: TileKind;
  onSelectTile: (k: TileKind) => void;
}) {
  const tiles = computeTiles(data);

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Focus — click to filter
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <StatTile key={t.kind} tile={t} active={t.kind === activeKind} onSelect={onSelectTile} />
        ))}
      </div>
    </section>
  );
}

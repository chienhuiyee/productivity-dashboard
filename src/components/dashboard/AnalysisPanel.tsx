import type { GithubData } from "@/lib/github/types";
import { computeGlanceCounts } from "@/lib/github/glance";
import type { TileKind } from "./focusFilter";

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
  const c = computeGlanceCounts(data, Date.now());
  return [
    { kind: "waiting", label: "Waiting on you", value: c.waiting, tone: c.waiting ? "orange" : "neutral" },
    { kind: "failing", label: "Failing main", value: c.failing, tone: c.failing ? "red" : "neutral" },
    { kind: "review", label: "Your review", value: c.review, tone: c.review ? "amber" : "neutral" },
    { kind: "conflicts", label: "Conflicts", value: c.conflicts, tone: c.conflicts ? "rose" : "neutral" },
    { kind: "aging", label: "Aging 3d+", value: c.aging, tone: c.aging ? "orange" : "neutral" },
    { kind: "stale", label: "Stale 2d+", value: c.stale, tone: c.stale ? "amber" : "neutral" },
    { kind: "open", label: "Open PRs", value: c.openPrs, tone: "neutral" },
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <StatTile key={t.kind} tile={t} active={t.kind === activeKind} onSelect={onSelectTile} />
        ))}
      </div>
    </section>
  );
}

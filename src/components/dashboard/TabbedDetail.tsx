import type { GithubData } from "@/lib/github/types";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ActionsWidget } from "./ActionsWidget";
import type { PrFocus } from "./focusFilter";
import { PullRequestsWidget } from "./PullRequestsWidget";

type Tab = "prs" | "actions";

/** The detail lists as tabs (PRs first, then failing branches). Controlled by the parent
 *  so the Focus tiles can drive which tab and PR filter are active. */
export function TabbedDetail({
  data,
  tab,
  onTabChange,
  prFocus,
  onClearFocus,
}: {
  data: GithubData;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  prFocus: PrFocus;
  onClearFocus: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div role="tablist" aria-label="Dashboard sections" className="flex border-b border-border px-2">
        <TabButton
          active={tab === "prs"}
          onClick={() => onTabChange("prs")}
          label="Open pull requests"
          count={data.prs.length}
          variant="amber"
        />
        <TabButton
          active={tab === "actions"}
          onClick={() => onTabChange("actions")}
          label="Failing main branches"
          count={data.actions.length}
          variant="red"
        />
      </div>

      <div className="p-5">
        {tab === "prs" ? (
          <PullRequestsWidget prs={data.prs} focus={prFocus} onClearFocus={onClearFocus} />
        ) : (
          <ActionsWidget actions={data.actions} />
        )}
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  variant: BadgeVariant;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
        active ? "text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
      <Badge variant={count > 0 ? variant : "gray"}>{count}</Badge>
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-accent" aria-hidden />
      )}
    </button>
  );
}

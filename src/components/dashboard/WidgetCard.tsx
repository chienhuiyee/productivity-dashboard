import type { ReactNode } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

/** Generic card shell for a dashboard module: title, count badge, body. */
export function WidgetCard({
  title,
  count,
  countVariant = "gray",
  children,
}: {
  title: string;
  count?: number;
  countVariant?: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && <Badge variant={count > 0 ? countVariant : "gray"}>{count}</Badge>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

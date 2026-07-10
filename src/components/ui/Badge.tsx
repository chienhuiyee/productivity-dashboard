import type { ReactNode } from "react";

export type BadgeVariant = "red" | "amber" | "orange" | "yellow" | "green" | "blue" | "gray";

const VARIANTS: Record<BadgeVariant, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  gray: "bg-surface-muted text-muted",
};

export function Badge({
  variant = "gray",
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}

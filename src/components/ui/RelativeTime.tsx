"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";

/**
 * Renders a live "3 days ago" style label that refreshes every minute.
 * `addSuffix={false}` yields a bare duration ("3 days") for phrases like "failing for 3 days".
 */
export function RelativeTime({
  iso,
  addSuffix = true,
  className,
}: {
  iso: string | null;
  addSuffix?: boolean;
  className?: string;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!iso) return <span className={className}>unknown</span>;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span className={className}>unknown</span>;

  return (
    <span className={className} title={date.toLocaleString()}>
      {formatDistanceToNowStrict(date, { addSuffix })}
    </span>
  );
}

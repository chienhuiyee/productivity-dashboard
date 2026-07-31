const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The standup window: from the start of the most recent working day strictly
 * before today, up to `now`. On Monday this spans Friday + the weekend.
 * Pure: `now` (ms) injected so it's testable.
 */
export function computeWindow(now: number, workingDays: number[] = [1, 2, 3, 4, 5]): {
  from: string;
  to: string;
  label: string;
} {
  // Guard against empty workingDays to prevent infinite loop.
  const days = workingDays.length > 0 ? workingDays : [1, 2, 3, 4, 5];
  const cur = new Date(now);
  cur.setHours(0, 0, 0, 0);
  do {
    cur.setDate(cur.getDate() - 1);
  } while (!days.includes(cur.getDay()));

  return {
    from: cur.toISOString(),
    to: new Date(now).toISOString(),
    label: `Since ${DOW[cur.getDay()]}, ${MON[cur.getMonth()]} ${cur.getDate()}`,
  };
}

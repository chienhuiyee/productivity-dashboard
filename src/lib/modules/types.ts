/**
 * A dashboard "module" (GitHub today; email / tasks / calendar later) contributes
 * FocusItems to the global focus summary and exposes its own data for a widget.
 *
 * The GitHub module is the first concrete implementation. Future modules implement
 * SourceProvider and register in modules/registry.ts; a generalized aggregator can
 * then merge every module's FocusItems into one ranked summary with no UI changes.
 */

export interface FocusItem {
  /** Owning module id, e.g. "github". */
  moduleId: string;
  /** Discriminator for styling/icons, e.g. "actions-broken" | "pr-review". */
  kind: string;
  /** Human-readable summary line, e.g. "2 repos with failing main". */
  label: string;
  /** Higher = more urgent. Used to order the global focus summary. */
  severity: number;
}

export interface SourceContext {
  /** OAuth token for providers that need one (GitHub). */
  token?: string;
  /** Bypass any server-side cache (manual refresh). */
  force?: boolean;
}

export interface SourceProvider<TData> {
  id: string;
  title: string;
  /** Fetch + normalize this module's data (server-only). */
  fetch(ctx: SourceContext): Promise<TData>;
  /** Derive the focus lines this module contributes to the global summary. */
  rank(data: TData): FocusItem[];
}

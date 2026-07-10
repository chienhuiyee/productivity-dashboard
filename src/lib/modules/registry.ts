import "server-only";
import { githubProvider } from "@/lib/github/provider";
import type { SourceProvider } from "./types";

/**
 * Registered dashboard modules. Today: GitHub. To add email/tasks/calendar later,
 * implement SourceProvider and add it here; a generalized aggregator can then merge
 * every module's focus items without touching the dashboard UI.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const providers: SourceProvider<any>[] = [githubProvider];

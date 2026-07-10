import { z } from "zod";

/**
 * GitHub owner and repo names allow alphanumerics, hyphen, underscore and dot.
 * We validate strictly because these values are interpolated into GraphQL queries.
 */
const GH_NAME = /^[A-Za-z0-9._-]+$/;

export const repoRefSchema = z.object({
  owner: z.string().min(1).max(100).regex(GH_NAME, "invalid owner"),
  name: z.string().min(1).max(100).regex(GH_NAME, "invalid repo name"),
});

export const settingsSchema = z.object({
  // How often the dashboard auto-refreshes, in ms. 30s min, 1h max.
  refreshIntervalMs: z.number().int().min(30_000).max(3_600_000).default(300_000),
});

export const configSchema = z.object({
  repos: z.array(repoRefSchema).max(200).default([]),
  settings: settingsSchema.default({ refreshIntervalMs: 300_000 }),
});

export type RepoRef = z.infer<typeof repoRefSchema>;
export type AppSettings = z.infer<typeof settingsSchema>;
export type AppConfig = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: AppConfig = {
  repos: [],
  settings: { refreshIntervalMs: 300_000 },
};

/** "owner/name" -> {owner, name}, or null if malformed. */
export function parseRepoSlug(slug: string): RepoRef | null {
  const trimmed = slug.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const candidate = { owner: parts[0], name: parts[1] };
  const result = repoRefSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function repoKey(ref: RepoRef): string {
  return `${ref.owner}/${ref.name}`;
}

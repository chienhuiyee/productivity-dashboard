/**
 * Single-user gate for a publicly-reachable deployment: without this, the GitHub
 * OAuth flow accepts any GitHub account. Fails closed — an unset or blank
 * allowlist denies every login rather than admitting everyone.
 */
export function isAllowedLogin(login: unknown, allowed: string | undefined): boolean {
  const expected = allowed?.trim().toLowerCase();
  if (!expected) return false;
  if (typeof login !== "string" || !login.trim()) return false;
  return login.trim().toLowerCase() === expected;
}

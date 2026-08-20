import { existsSync, readFileSync } from "node:fs";

/**
 * Vitest doesn't load .env files the way `next dev` does, so database-backed
 * tests would see no MONGODB_URI. Load them in Next's precedence order —
 * .env first, then .env.local overriding it — and never clobber a value that
 * is already set in the real environment (CI).
 */
for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    if (file === ".env.local" || process.env[key] === undefined) {
      process.env[key] ??= value;
    }
  }
}

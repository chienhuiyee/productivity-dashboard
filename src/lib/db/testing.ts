import { getClient } from "./client";

/**
 * Run `fn` against a uniquely-named throwaway database, then drop it.
 * Keeps tests off the shared `dashboard` database, which holds real history.
 */
export async function withTestDb(fn: (db: string) => Promise<void>): Promise<void> {
  const name = `dashboard_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fn(name);
  } finally {
    const client = await getClient();
    await client.db(name).dropDatabase().catch(() => {});
  }
}

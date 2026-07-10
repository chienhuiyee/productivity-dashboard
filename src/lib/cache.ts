/**
 * Tiny in-memory TTL cache (module singleton). Good enough for a single-user,
 * single-process local tool: dedupes rapid manual refreshes and multiple tabs.
 */

interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function clearCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}

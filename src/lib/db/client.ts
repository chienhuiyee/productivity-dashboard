import "server-only";
import { MongoClient, type Db } from "mongodb";

const DEFAULT_DB = "dashboard";

// Cached on globalThis, not a module local: Next.js dev HMR re-evaluates modules
// on every edit, and each serverless cold start gets a fresh module registry.
// Without this we'd open a new connection per request and exhaust the M0 pool.
const globalForMongo = globalThis as typeof globalThis & {
  __mongoClientPromise?: Promise<MongoClient>;
};

function connectionUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  return uri;
}

/** Explicit env var wins, then a database in the URI path, then the default. */
export function dbName(): string {
  const explicit = process.env.MONGODB_DB?.trim();
  if (explicit) return explicit;
  const afterCredentials = connectionUri().split("@")[1] ?? "";
  const fromUri = (afterCredentials.split("/")[1] ?? "").split("?")[0];
  return fromUri || DEFAULT_DB;
}

export function getClient(): Promise<MongoClient> {
  globalForMongo.__mongoClientPromise ??= new MongoClient(connectionUri()).connect();
  return globalForMongo.__mongoClientPromise;
}

export async function getDb(name: string = dbName()): Promise<Db> {
  return (await getClient()).db(name);
}

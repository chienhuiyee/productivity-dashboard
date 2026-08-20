import "server-only";
import { getDb } from "@/lib/db/client";
import { configSchema, DEFAULT_CONFIG, type AppConfig } from "./schema";

/** Single-document collection: one config per deployment. */
const CONFIG_ID = "app";

type ConfigDoc = { _id: string } & AppConfig;

async function configCollection(db?: string) {
  return (await getDb(db)).collection<ConfigDoc>("config");
}

/** Read the monitored-repo config. Missing or invalid document falls back to defaults. */
export async function readConfig(db?: string): Promise<AppConfig> {
  const doc = await (await configCollection(db)).findOne({ _id: CONFIG_ID });
  if (!doc) return DEFAULT_CONFIG;
  const { _id, ...stored } = doc;
  const parsed = configSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}

/** Validate and persist config as a single upserted document. Returns the saved value. */
export async function writeConfig(input: unknown, db?: string): Promise<AppConfig> {
  const config = configSchema.parse(input);
  // The replacement omits _id deliberately: the driver types it as WithoutId,
  // and on upsert the _id is taken from the filter.
  await (await configCollection(db)).replaceOne({ _id: CONFIG_ID }, config, { upsert: true });
  return config;
}

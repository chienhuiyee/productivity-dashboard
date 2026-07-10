import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { configSchema, DEFAULT_CONFIG, type AppConfig } from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

/** Read the monitored-repo config. Missing or invalid file falls back to defaults. */
export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = configSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_CONFIG;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_CONFIG;
    throw err;
  }
}

/** Validate and atomically persist config (write temp + rename). Returns the saved value. */
export async function writeConfig(input: unknown): Promise<AppConfig> {
  const config = configSchema.parse(input);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `.config.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), "utf8");
  await fs.rename(tmp, CONFIG_PATH);
  return config;
}

// One-off import of the local data/ JSON files into MongoDB Atlas.
// Idempotent: every write is an upsert keyed by a stable _id, so re-running
// is safe. data/ is left untouched as a backup.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MongoClient } from "mongodb";

const DATA_DIR = join(process.cwd(), "data");
const DEFAULT_DB = "dashboard";

function resolveDbName(uri) {
  if (process.env.MONGODB_DB?.trim()) return process.env.MONGODB_DB.trim();
  const afterCredentials = uri.split("@")[1] ?? "";
  const fromUri = (afterCredentials.split("/")[1] ?? "").split("?")[0];
  return fromUri || DEFAULT_DB;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`could not parse ${path}: ${err.message}`);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (expected in .env.local)");

  const dbName = resolveDbName(uri);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`migrating data/ -> database "${dbName}"`);

  try {
    const config = await readJson(join(DATA_DIR, "config.json"));
    if (config) {
      await db.collection("config").replaceOne({ _id: "app" }, config, { upsert: true });
      console.log(`  config:       ${config.repos?.length ?? 0} repos`);
    } else {
      console.log("  config:       (no data/config.json — skipped)");
    }

    const state = await readJson(join(DATA_DIR, "standup-state.json"));
    if (state) {
      await db.collection("standupState").replaceOne({ _id: "state" }, state, { upsert: true });
      console.log(`  standupState: ${state.items?.length ?? 0} tracked items`);
    } else {
      console.log("  standupState: (no data/standup-state.json — skipped)");
    }

    let dayCount = 0;
    const dayFiles = await readdir(join(DATA_DIR, "standups")).catch(() => []);
    for (const file of dayFiles.filter((f) => f.endsWith(".json"))) {
      const day = await readJson(join(DATA_DIR, "standups", file));
      if (!day) continue;
      const id = day.date ?? file.replace(/\.json$/, "");
      await db.collection("standupDays").replaceOne({ _id: id }, day, { upsert: true });
      dayCount += 1;
    }
    console.log(`  standupDays:  ${dayCount} days`);

    console.log("\nverifying:");
    for (const name of ["config", "standupState", "standupDays"]) {
      console.log(`  ${name}: ${await db.collection(name).countDocuments()} document(s)`);
    }
    console.log("\ndone. data/ left in place as a backup.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`migration failed: ${err.message}`);
  process.exit(1);
});

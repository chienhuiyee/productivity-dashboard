import "server-only";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StandupDay, StandupState } from "./types";

const DEFAULT_DIR = join(process.cwd(), "data");
const daysDir = (base: string) => join(base, "standups");

async function atomicWrite(file: string, data: unknown): Promise<void> {
  await mkdir(join(file, ".."), { recursive: true });
  const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file);
}

export async function readState(baseDir: string = DEFAULT_DIR): Promise<StandupState> {
  try {
    return JSON.parse(await readFile(join(baseDir, "standup-state.json"), "utf8")) as StandupState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { items: [] };
    throw err;
  }
}

export async function writeState(state: StandupState, baseDir: string = DEFAULT_DIR): Promise<void> {
  await atomicWrite(join(baseDir, "standup-state.json"), state);
}

export async function writeDay(day: StandupDay, baseDir: string = DEFAULT_DIR): Promise<void> {
  await atomicWrite(join(daysDir(baseDir), `${day.date}.json`), day);
}

export async function readDay(date: string, baseDir: string = DEFAULT_DIR): Promise<StandupDay | null> {
  try {
    return JSON.parse(await readFile(join(daysDir(baseDir), `${date}.json`), "utf8")) as StandupDay;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function listDays(baseDir: string = DEFAULT_DIR): Promise<string[]> {
  try {
    return (await readdir(daysDir(baseDir)))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => b.localeCompare(a));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

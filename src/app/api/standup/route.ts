import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auth } from "@/auth";
import { readConfig } from "@/lib/config/store";
import { getGithubData } from "@/lib/github/provider";
import { fetchContributions } from "@/lib/github/contributions";
import { computeWindow } from "@/lib/standup/window";
import { assembleFacts } from "@/lib/standup/collect";
import { createItem, openItems, resolveItem, spawnFollowUp } from "@/lib/standup/items";
import { buildGeneratePrompt, buildRollupPrompt, IMAGE_EXTRACT_PROMPT, parseImageItems } from "@/lib/standup/prompt";
import { ClaudeUnavailableError, runClaude } from "@/lib/standup/generate";
import { listDays, readDay, readState, writeDay, writeState } from "@/lib/standup/store";
import type { StandupFacts } from "@/lib/standup/types";

export const dynamic = "force-dynamic";

function todayDate(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function newId(now: number): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
async function requireToken() {
  const session = await auth();
  return session?.accessToken ?? null;
}

export async function GET(request: Request) {
  const token = await requireToken();
  if (!token) return NextResponse.json({ error: "Not signed in to GitHub" }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (date) return NextResponse.json({ day: await readDay(date) });

  const now = Date.now();
  const cfg = await readConfig();
  const win = computeWindow(now, cfg.settings.standup.workingDays);
  const state = await readState();

  let facts: StandupFacts | null = null;
  try {
    const [contrib, github] = await Promise.all([
      fetchContributions(token, win.from, win.to),
      getGithubData(token).catch(() => null),
    ]);
    facts = assembleFacts(contrib, github, state.items, now, contrib.viewer);
  } catch {
    facts = null; // GitHub unavailable — page still renders items + history
  }

  return NextResponse.json({
    window: win,
    items: state.items,
    facts,
    today: await readDay(todayDate(now)),
    days: await listDays(),
  });
}

export async function PUT(request: Request) {
  const token = await requireToken();
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const now = Date.now();
  const body = await request.json();
  const state = await readState();

  switch (body.op) {
    case "add":
      state.items = [...state.items, createItem(String(body.text ?? ""), now, newId(now))];
      break;
    case "resolve":
      state.items = resolveItem(state.items, String(body.id), body.status === "dropped" ? "dropped" : "done", now);
      break;
    case "followup":
      state.items = spawnFollowUp(state.items, String(body.id), now, newId(now));
      break;
    case "notes": {
      const date = todayDate(now);
      const day = (await readDay(date)) ?? emptyDay(date, now);
      day.manualNotes = String(body.notes ?? "");
      await writeDay(day);
      return NextResponse.json({ ok: true });
    }
    case "saveText": {
      const date = todayDate(now);
      const day = (await readDay(date)) ?? emptyDay(date, now);
      day.generatedText = String(body.text ?? "");
      await writeDay(day);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }

  await writeState(state);
  return NextResponse.json({ items: state.items });
}

export async function POST(request: Request) {
  const token = await requireToken();
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const now = Date.now();
  const cfg = await readConfig();
  const model = cfg.settings.standup.model;
  const body = await request.json();

  try {
    if (body.action === "generate") {
      const win = computeWindow(now, cfg.settings.standup.workingDays);
      const state = await readState();
      const [contrib, github] = await Promise.all([
        fetchContributions(token, win.from, win.to),
        getGithubData(token).catch(() => null),
      ]);
      const facts = assembleFacts(contrib, github, state.items, now, contrib.viewer);
      const done = state.items.filter((i) => i.status === "done");
      const prompt = buildGeneratePrompt(facts, done, openItems(state.items), body.notes ?? "");
      const text = await runClaude(prompt, model);
      const date = todayDate(now);
      const day = (await readDay(date)) ?? emptyDay(date, now);
      Object.assign(day, { facts, generatedText: text, windowFrom: win.from, windowTo: win.to });
      await writeDay(day);
      return NextResponse.json({ text });
    }

    if (body.action === "rollup") {
      const dates = (await listDays()).slice(0, body.range === "month" ? 31 : 7);
      const days = (await Promise.all(dates.map((d) => readDay(d)))).filter(Boolean).map((d) => ({ date: d!.date, facts: d!.facts }));
      const text = await runClaude(buildRollupPrompt(days, body.range === "month" ? "month" : "week"), model);
      return NextResponse.json({ text });
    }

    if (body.action === "deriveImage") {
      // body.dataUrl = "data:image/png;base64,...."
      const base64 = String(body.dataUrl ?? "").split(",")[1] ?? "";
      const dir = join(tmpdir(), "standup-shots");
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${newId(now)}.png`);
      await writeFile(path, Buffer.from(base64, "base64"));
      try {
        const raw = await runClaude(IMAGE_EXTRACT_PROMPT, model, path);
        return NextResponse.json({ items: parseImageItems(raw) });
      } finally {
        await unlink(path).catch(() => {});
      }
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    if (err instanceof ClaudeUnavailableError) {
      return NextResponse.json({ aiError: err.message }, { status: 200 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function emptyDay(date: string, now: number) {
  return {
    date,
    windowFrom: new Date(now).toISOString(),
    windowTo: new Date(now).toISOString(),
    facts: { mergedPrs: [], openedPrs: [], reviewedPrs: [], openedIssues: [], closedIssues: [], commitsByRepo: [], needsReview: 0, waitingOnYou: 0, failingMain: [], inProgress: [] } as StandupFacts,
    manualNotes: "",
    doneItemIds: [],
    generatedText: "",
  };
}

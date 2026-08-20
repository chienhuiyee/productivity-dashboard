import "server-only";
import { getDb } from "@/lib/db/client";
import type { StandupDay, StandupState } from "./types";

/** Single-document collection: one live cross-day state per deployment. */
const STATE_ID = "state";

type StateDoc = { _id: string } & StandupState;
/** `_id` is the "YYYY-MM-DD" date, so sorting and range queries work on it directly. */
type DayDoc = { _id: string } & StandupDay;

async function stateCollection(db?: string) {
  return (await getDb(db)).collection<StateDoc>("standupState");
}
async function daysCollection(db?: string) {
  return (await getDb(db)).collection<DayDoc>("standupDays");
}

export async function readState(db?: string): Promise<StandupState> {
  const doc = await (await stateCollection(db)).findOne({ _id: STATE_ID });
  return doc ? { items: doc.items ?? [] } : { items: [] };
}

export async function writeState(state: StandupState, db?: string): Promise<void> {
  // Replacement omits _id: the driver types it as WithoutId, and on upsert the
  // _id comes from the filter.
  await (await stateCollection(db)).replaceOne({ _id: STATE_ID }, state, { upsert: true });
}

export async function readDay(date: string, db?: string): Promise<StandupDay | null> {
  const doc = await (await daysCollection(db)).findOne({ _id: date });
  if (!doc) return null;
  const { _id: _ignored, ...day } = doc;
  return day;
}

export async function writeDay(day: StandupDay, db?: string): Promise<void> {
  await (await daysCollection(db)).replaceOne({ _id: day.date }, day, { upsert: true });
}

/**
 * Day dates (newest first) tagged with whether each was marked posted.
 * One projection instead of a read per day — this used to be an N+1 in the route.
 */
export async function listDaysWithPosted(db?: string): Promise<{ date: string; posted: boolean }[]> {
  const docs = await (await daysCollection(db))
    .find({}, { projection: { _id: 1, postedAt: 1 }, sort: { _id: -1 } })
    .toArray();
  return docs.map((d) => ({ date: d._id, posted: !!d.postedAt }));
}

/**
 * The `limit` most recent days as whole documents, newest first.
 * One query for the rollup, which previously listed dates and then issued a
 * separate read per date.
 */
export async function recentDays(limit: number, db?: string): Promise<StandupDay[]> {
  const docs = await (await daysCollection(db))
    .find({}, { sort: { _id: -1 }, limit })
    .toArray();
  return docs.map(({ _id: _ignored, ...day }) => day);
}

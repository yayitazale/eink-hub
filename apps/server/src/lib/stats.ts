import { and, asc, count, desc, eq, gte, lt } from 'drizzle-orm';
import { getSetting, schema, type DB } from '../db/index.js';

/** One sheet of A4 per image shown; a tree gives roughly this many sheets (a commonly cited rule of thumb). */
export const SHEETS_PER_TREE = 8333;
const SAMPLE_EVERY_MS = 30 * 60_000;
const KEEP_MS = 365 * 86_400_000;
const DAY_MS = 86_400_000;
const MAX_POINTS = 300;

export const statsEnabled = (db: DB) => getSetting(db, 'statsEnabled') === '1';

/** Record a level only while statistics are on, and only when it changed or the last sample is stale. */
export function shouldSample(last: { at: number; level: number } | undefined, level: number, now: number) {
  return !last || last.level !== level || now - last.at >= SAMPLE_EVERY_MS;
}

export function recordBattery(db: DB, frameId: number, level: number, now = Date.now()) {
  if (!statsEnabled(db) || !Number.isFinite(level)) return;
  const last = db
    .select({ at: schema.batterySamples.at, level: schema.batterySamples.level })
    .from(schema.batterySamples)
    .where(eq(schema.batterySamples.frameId, frameId))
    .orderBy(desc(schema.batterySamples.at))
    .limit(1)
    .get();
  if (shouldSample(last, level, now)) db.insert(schema.batterySamples).values({ frameId, at: now, level: Math.round(level) }).run();
}

export function pruneBatterySamples(db: DB, now = Date.now()) {
  db.delete(schema.batterySamples).where(lt(schema.batterySamples.at, now - KEEP_MS)).run();
}

/**
 * Average drain in % per day, from the stretches where the level did not go up
 * (a recharge between two samples is skipped, not counted as negative drain).
 */
export function drainPerDay(samples: { at: number; level: number }[]): number | null {
  let drop = 0;
  let ms = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i - 1].level - samples[i].level;
    if (d < 0) continue;
    drop += d;
    ms += samples[i].at - samples[i - 1].at;
  }
  // Under a day of data the rate is too noisy to promise anything.
  return ms >= DAY_MS && drop > 0 ? (drop / ms) * DAY_MS : null;
}

export const treesFor = (sheets: number) => sheets / SHEETS_PER_TREE;

function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)]);
  out.push(items[items.length - 1]);
  return out;
}

export function frameStats(db: DB, frameId: number, now = Date.now()) {
  // Pulls are recorded before the Canvas confirms them, so only an explicit failure is subtracted.
  const rows = (extra?: ReturnType<typeof gte>, failedOnly = false) =>
    db
      .select({ n: count() })
      .from(schema.history)
      .where(and(eq(schema.history.frameId, frameId), ...(failedOnly ? [eq(schema.history.success, false)] : []), ...(extra ? [extra] : [])))
      .get()?.n ?? 0;
  const since = gte(schema.history.shownAt, now - 30 * DAY_MS);
  const failed = rows(undefined, true);
  const total = rows() - failed;
  const samples = db
    .select({ at: schema.batterySamples.at, level: schema.batterySamples.level })
    .from(schema.batterySamples)
    .where(eq(schema.batterySamples.frameId, frameId))
    .orderBy(asc(schema.batterySamples.at))
    .all();
  const rate = drainPerDay(samples);
  const level = samples.at(-1)?.level ?? null;
  return {
    shown: { total, last30Days: rows(since) - rows(since, true), failed },
    battery: {
      samples: downsample(samples, MAX_POINTS),
      level,
      drainPerDay: rate,
      daysLeft: rate && level != null ? level / rate : null,
    },
    paper: { sheets: total, trees: treesFor(total), sheetsPerTree: SHEETS_PER_TREE },
  };
}

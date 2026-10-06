import { Cron } from 'croner';
import { HttpError } from './context.js';
import type { MsgKey, MsgVars } from '../i18n.js';
import { inWindow, nextWindowStart } from './selection.js';

/**
 * When a frame changes picture. E-ink frames should change rarely: hourly presets exist
 * but are flagged as battery-hungry; daily and longer presets fire at a fixed local time.
 */
export type Schedule =
  | { kind: 'interval'; hours: 1 | 3 | 6 | 12 }
  | { kind: 'days'; days: 1 | 2 | 3; at: string }
  /** weekday: 0 = Sunday … 6 = Saturday */
  | { kind: 'weeks'; weeks: 1 | 2; weekday: number; at: string }
  /** day: 1–28 so every month has it. */
  | { kind: 'monthly'; day: number; at: string }
  | { kind: 'cron'; expr: string };

export const DEFAULT_SCHEDULE: Schedule = { kind: 'days', days: 1, at: '07:00' };
/** Fixed for "on this day" memories collections. */
export const MEMORIES_SCHEDULE: Schedule = { kind: 'days', days: 1, at: '00:00' };

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Frames may wake a little early; don't schedule the "next" run for the one happening now. */
const TOLERANCE = 10 * 60_000;
const MIN_GAP = HOUR;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function bad(key: MsgKey, vars?: MsgVars): never {
  throw new HttpError(400, key, vars);
}

function cronFor(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) bad('cron_fields');
  try {
    return new Cron(expr.trim(), { paused: true });
  } catch (err) {
    bad('cron_invalid', { detail: (err as Error).message });
  }
}

/** Validate untrusted input into a Schedule (throws HttpError 400). */
export function parseSchedule(input: unknown): Schedule {
  const s = (input ?? {}) as Record<string, unknown>;
  const at = () => {
    if (typeof s.at !== 'string' || !HHMM.test(s.at)) bad('time_invalid');
    return s.at;
  };
  switch (s.kind) {
    case 'interval':
      if (![1, 3, 6, 12].includes(Number(s.hours))) bad('interval_invalid');
      return { kind: 'interval', hours: Number(s.hours) as 1 | 3 | 6 | 12 };
    case 'days':
      if (![1, 2, 3].includes(Number(s.days))) bad('days_invalid');
      return { kind: 'days', days: Number(s.days) as 1 | 2 | 3, at: at() };
    case 'weeks': {
      const weekday = Number(s.weekday);
      if (![1, 2].includes(Number(s.weeks))) bad('weeks_invalid');
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) bad('weekday_invalid');
      return { kind: 'weeks', weeks: Number(s.weeks) as 1 | 2, weekday, at: at() };
    }
    case 'monthly': {
      const day = Number(s.day);
      if (!Number.isInteger(day) || day < 1 || day > 28) bad('monthday_invalid');
      return { kind: 'monthly', day, at: at() };
    }
    case 'cron': {
      const expr = String(s.expr ?? '').trim();
      const sched = { kind: 'cron', expr } as const;
      const runs = upcoming(sched, new Date(), 12);
      if (runs.length === 0) bad('cron_never');
      if (minGap(runs) < MIN_GAP) bad('cron_too_frequent');
      return sched;
    }
    default:
      bad('schedule_invalid');
  }
}

function atTime(base: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export interface Window {
  activeFrom?: string | null;
  activeTo?: string | null;
}

/**
 * Next change after one that happened at `now` (local time). For "every N days/weeks" this is
 * N periods later. Active hours only apply to hourly schedules.
 */
export function nextRun(s: Schedule, now: Date, w: Window = {}): Date | null {
  return occurrence(s, now, w, true);
}

/** First change of a newly set schedule: the next matching time, without skipping periods. */
export function firstRun(s: Schedule, now: Date, w: Window = {}): Date | null {
  return occurrence(s, now, w, false);
}

function occurrence(s: Schedule, now: Date, w: Window, skip: boolean): Date | null {
  const after = new Date(now.getTime() + TOLERANCE);
  switch (s.kind) {
    case 'interval': {
      const from = w.activeFrom;
      const to = w.activeTo;
      if (from && to && !inWindow(now, from, to)) return nextWindowStart(now, from);
      const candidate = new Date(now.getTime() + s.hours * HOUR);
      return from && to && !inWindow(candidate, from, to) ? nextWindowStart(candidate, from) : candidate;
    }
    case 'days': {
      let d = atTime(now, s.at);
      if (d <= after) d = addDays(d, 1);
      return skip ? addDays(d, s.days - 1) : d;
    }
    case 'weeks': {
      let d = atTime(now, s.at);
      d = addDays(d, (s.weekday - d.getDay() + 7) % 7);
      if (d <= after) d = addDays(d, 7);
      return skip ? addDays(d, (s.weeks - 1) * 7) : d;
    }
    case 'monthly': {
      let d = atTime(new Date(now.getFullYear(), now.getMonth(), s.day), s.at);
      if (d <= after) d = atTime(new Date(now.getFullYear(), now.getMonth() + 1, s.day), s.at);
      return d;
    }
    case 'cron':
      return cronFor(s.expr).nextRun(after);
  }
}

export function upcoming(s: Schedule, now: Date, n = 3, w: Window = {}): Date[] {
  const out: Date[] = [];
  let cursor = now;
  for (let i = 0; i < n; i++) {
    const next = i === 0 ? firstRun(s, cursor, w) : nextRun(s, cursor, w);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

function minGap(runs: Date[]) {
  let gap = Infinity;
  for (let i = 1; i < runs.length; i++) gap = Math.min(gap, runs[i].getTime() - runs[i - 1].getTime());
  return gap;
}

/** More than one change a day → warn about battery. */
export function isFrequent(s: Schedule): boolean {
  if (s.kind === 'interval') return true;
  if (s.kind !== 'cron') return false;
  return minGap(upcoming(s, new Date(), 12)) < DAY - TOLERANCE;
}

/** Whether a change is due now, given the stored next change time. */
export function isDue(nextChange: number | null, now: Date, s: Schedule, w: Window = {}): boolean {
  if (nextChange == null) return s.kind !== 'interval' || !w.activeFrom || !w.activeTo || inWindow(now, w.activeFrom, w.activeTo);
  return now.getTime() >= nextChange - TOLERANCE;
}

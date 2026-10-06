import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from '../src/db/index.js';
import { isDue, isFrequent, nextRun, parseSchedule, upcoming, type Schedule } from '../src/lib/schedule.js';

// Local times; 2026-06-10 is a Wednesday.
const at = (day: number, h: number, m = 0, month = 5) => new Date(2026, month, day, h, m);

describe('nextRun', () => {
  it('hourly presets add hours and respect active hours', () => {
    const s: Schedule = { kind: 'interval', hours: 3 };
    expect(nextRun(s, at(10, 9))).toEqual(at(10, 12));
    const w = { activeFrom: '08:00', activeTo: '22:00' };
    expect(nextRun(s, at(10, 20), w)).toEqual(at(11, 8));
    expect(nextRun(s, at(10, 3), w)).toEqual(at(10, 8));
  });

  it('daily presets fire at a fixed local time', () => {
    const daily: Schedule = { kind: 'days', days: 1, at: '07:00' };
    expect(nextRun(daily, at(10, 6))).toEqual(at(10, 7));
    expect(nextRun(daily, at(10, 7, 0))).toEqual(at(11, 7));
    // A frame waking a few minutes early must not schedule another change minutes later.
    expect(nextRun(daily, at(10, 6, 58))).toEqual(at(11, 7));
    // First change at the next 07:00, then every 3 days.
    expect(upcoming({ kind: 'days', days: 3, at: '07:00' }, at(10, 7), 2)).toEqual([at(11, 7), at(14, 7)]);
    expect(nextRun({ kind: 'days', days: 3, at: '07:00' }, at(11, 7))).toEqual(at(14, 7));
  });

  it('weekly presets pick the weekday', () => {
    const monday: Schedule = { kind: 'weeks', weeks: 1, weekday: 1, at: '08:30' };
    expect(nextRun(monday, at(10, 12))).toEqual(at(15, 8, 30));
    expect(upcoming({ kind: 'weeks', weeks: 2, weekday: 3, at: '09:00' }, at(10, 8), 2)).toEqual([at(10, 9), at(24, 9)]);
  });

  it('monthly presets roll over the year', () => {
    const s: Schedule = { kind: 'monthly', day: 1, at: '09:00' };
    expect(nextRun(s, new Date(2026, 11, 15))).toEqual(new Date(2027, 0, 1, 9));
  });

  it('cron expressions', () => {
    const s = parseSchedule({ kind: 'cron', expr: '0 8 * * 1,4' });
    expect(upcoming(s, at(10, 12), 3)).toEqual([at(11, 8), at(15, 8), at(18, 8)]);
  });
});

describe('parseSchedule', () => {
  it('rejects anything more frequent than hourly or malformed', () => {
    for (const bad of [
      { kind: 'interval', hours: 0.5 },
      { kind: 'days', days: 1, at: '25:00' },
      { kind: 'monthly', day: 31, at: '07:00' },
      { kind: 'cron', expr: '*/30 * * * *' },
      { kind: 'cron', expr: '0 0 * * * *' },
      { kind: 'cron', expr: 'nonsense' },
      { kind: 'every-minute' },
    ]) {
      expect(() => parseSchedule(bad), JSON.stringify(bad)).toThrow();
    }
  });
});

describe('battery warning', () => {
  it('flags more than one change a day', () => {
    expect(isFrequent({ kind: 'interval', hours: 12 })).toBe(true);
    expect(isFrequent({ kind: 'days', days: 1, at: '07:00' })).toBe(false);
    expect(isFrequent({ kind: 'cron', expr: '0 8,20 * * *' })).toBe(true);
    expect(isFrequent({ kind: 'cron', expr: '0 8 * * *' })).toBe(false);
  });
});

describe('isDue', () => {
  const daily: Schedule = { kind: 'days', days: 1, at: '07:00' };
  it('is due at (or slightly before) the scheduled time', () => {
    expect(isDue(at(10, 7).getTime(), at(10, 6, 55), daily)).toBe(true);
    expect(isDue(at(10, 7).getTime(), at(10, 6), daily)).toBe(false);
    expect(isDue(null, at(10, 6), daily)).toBe(true);
    expect(isDue(null, at(10, 3), { kind: 'interval', hours: 1 }, { activeFrom: '08:00', activeTo: '22:00' })).toBe(false);
  });
});

describe('migration v2', () => {
  it('converts minute intervals to presets', () => {
    const db = new Database(':memory:');
    db.exec(migrations[0]);
    const frame = db.prepare(`INSERT INTO frames (name, host, upstream_token, created_at, pull_interval_min) VALUES ('f', 'h', ?, 0, ?)`);
    const assign = db.prepare(`INSERT INTO assignments (frame_id, collection_id, interval_min, active_from, active_to) VALUES (?, 1, ?, '08:00', '22:00')`);
    [15, 30, 120, 480, 1440].forEach((min, i) => {
      frame.run(`t${i}`, min);
      assign.run(i + 1, min);
    });
    db.exec(migrations[1]);
    const rows = db.prepare('SELECT schedule, active_from FROM assignments ORDER BY frame_id').all() as { schedule: string; active_from: string | null }[];
    expect(rows.map((r) => JSON.parse(r.schedule))).toEqual([
      { kind: 'interval', hours: 1 },
      { kind: 'interval', hours: 1 },
      { kind: 'interval', hours: 3 },
      { kind: 'interval', hours: 12 },
      { kind: 'days', days: 1, at: '07:00' },
    ]);
    expect(rows.map((r) => r.active_from)).toEqual(['08:00', '08:00', '08:00', '08:00', null]);
    const pulls = db.prepare('SELECT pull_schedule FROM frames ORDER BY id').all() as { pull_schedule: string }[];
    expect(JSON.parse(pulls[4].pull_schedule)).toEqual({ kind: 'days', days: 1, at: '07:00' });
  });
});

describe('photo date captions', () => {
  it('formats dates per language, with proper Basque suffixes', async () => {
    const { photoDate } = await import('../src/lib/images.js');
    const at = (y: number, m: number, d: number) => ({ takenAt: Date.UTC(y, m - 1, d, 10) });
    expect(photoDate(at(2019, 10, 6), 'es')).toBe('6 de octubre de 2019');
    expect(photoDate(at(2019, 10, 6), 'en')).toBe('6 October 2019');
    expect(photoDate(at(2019, 10, 6), 'eu')).toBe('2019ko urriaren 6a');
    expect(photoDate(at(2021, 1, 15), 'eu')).toBe('2021eko urtarrilaren 15a');
    expect(photoDate(at(2010, 5, 1), 'eu')).toBe('2010eko maiatzaren 1a');
    expect(photoDate(at(2035, 8, 3), 'eu')).toBe('2035eko abuztuaren 3a');
    expect(photoDate(at(2000, 12, 25), 'eu')).toBe('2000ko abenduaren 25a');
    expect(photoDate(at(1998, 3, 20), 'eu')).toBe('1998ko martxoaren 20a');
  });

  it('captions "on this day" memories with how many years ago', async () => {
    const { yearsAgoCaption } = await import('../src/lib/images.js');
    const now = new Date(2026, 9, 6, 12);
    expect(yearsAgoCaption({ takenAt: Date.UTC(2019, 9, 6, 10) }, 'es', now)).toBe('Un día como hoy hace 7 años');
    expect(yearsAgoCaption({ takenAt: Date.UTC(2025, 9, 6, 10) }, 'es', now)).toBe('Un día como hoy hace 1 año');
    expect(yearsAgoCaption({ takenAt: Date.UTC(2019, 9, 6, 10) }, 'en', now)).toBe('On this day 7 years ago');
    expect(yearsAgoCaption({ takenAt: Date.UTC(2026, 9, 6, 10) }, 'es', now)).toBe('6 de octubre de 2026');
  });
});

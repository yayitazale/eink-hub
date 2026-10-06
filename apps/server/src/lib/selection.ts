import type { OrderMode } from '../db/schema.js';

export interface Candidate {
  id: number;
  position: number;
  takenAt: number | null;
}

/**
 * Choose the next image for a frame.
 * @param recent image ids shown on this frame, most recent first.
 */
export function pickNext(cands: Candidate[], recent: number[], mode: OrderMode, rand = Math.random): number | null {
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0].id;

  if (mode === 'random') {
    // Avoid anything shown in the last half-cycle so repeats feel rare.
    const avoid = new Set(recent.slice(0, Math.floor(cands.length / 2)));
    const pool = cands.filter((c) => !avoid.has(c.id));
    const from = pool.length ? pool : cands.filter((c) => c.id !== recent[0]);
    return from[Math.floor(rand() * from.length)].id;
  }

  const ordered =
    mode === 'newest'
      ? [...cands].sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0) || b.id - a.id)
      : [...cands].sort((a, b) => a.position - b.position || a.id - b.id);
  const last = recent.find((id) => ordered.some((c) => c.id === id));
  if (last === undefined) return ordered[0].id;
  const idx = ordered.findIndex((c) => c.id === last);
  return ordered[(idx + 1) % ordered.length].id;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Whether local time `now` falls in [from, to). Handles windows that cross midnight. Empty = always. */
export function inWindow(now: Date, from?: string | null, to?: string | null): boolean {
  if (!from || !to) return true;
  const t = now.getHours() * 60 + now.getMinutes();
  const a = minutes(from);
  const b = minutes(to);
  if (a === b) return true;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** Next local Date at which the window opens, strictly after `now`. */
export function nextWindowStart(now: Date, from: string): Date {
  const start = new Date(now);
  const m = minutes(from);
  start.setHours(Math.floor(m / 60), m % 60, 0, 0);
  if (start <= now) start.setDate(start.getDate() + 1);
  return start;
}

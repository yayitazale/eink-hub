import { describe, expect, it } from 'vitest';
import { drainPerDay, shouldSample, treesFor, SHEETS_PER_TREE } from '../src/lib/stats.js';

const H = 3_600_000;
const D = 24 * H;

describe('battery sampling', () => {
  it('samples on first reading, level change, or after 30 minutes', () => {
    expect(shouldSample(undefined, 80, 0)).toBe(true);
    expect(shouldSample({ at: 0, level: 80 }, 80, 5 * 60_000)).toBe(false);
    expect(shouldSample({ at: 0, level: 80 }, 79, 5 * 60_000)).toBe(true);
    expect(shouldSample({ at: 0, level: 80 }, 80, 30 * 60_000)).toBe(true);
  });
});

describe('drainPerDay', () => {
  it('averages the drop per day', () => {
    expect(drainPerDay([{ at: 0, level: 90 }, { at: 2 * D, level: 80 }])).toBeCloseTo(5);
  });
  it('skips a recharge instead of counting it as negative drain', () => {
    const rate = drainPerDay([
      { at: 0, level: 90 },
      { at: D, level: 85 },
      { at: 2 * D, level: 100 },
      { at: 3 * D, level: 95 },
    ]);
    expect(rate).toBeCloseTo(5);
  });
  it('gives no estimate with under a day of data', () => {
    expect(drainPerDay([{ at: 0, level: 90 }, { at: 3 * H, level: 89 }])).toBeNull();
  });
});

describe('trees', () => {
  it('is sheets over the sheets-per-tree factor', () => {
    expect(treesFor(SHEETS_PER_TREE)).toBe(1);
    expect(treesFor(0)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { inWindow, nextWindowStart, pickNext } from '../src/lib/selection.js';

const cands = [1, 2, 3, 4].map((id) => ({ id, position: id, takenAt: id * 1000 }));
const at = (h: number, m = 0, day = 10) => new Date(2026, 5, day, h, m);

describe('pickNext', () => {
  it('cycles sequentially', () => {
    expect(pickNext(cands, [], 'sequential')).toBe(1);
    expect(pickNext(cands, [2, 1], 'sequential')).toBe(3);
    expect(pickNext(cands, [4], 'sequential')).toBe(1);
  });
  it('orders newest first', () => {
    expect(pickNext(cands, [], 'newest')).toBe(4);
    expect(pickNext(cands, [4], 'newest')).toBe(3);
  });
  it('random avoids the last half-cycle', () => {
    for (let i = 0; i < 50; i++) expect([3, 4]).toContain(pickNext(cands, [1, 2], 'random'));
  });
  it('handles tiny collections', () => {
    expect(pickNext([], [], 'random')).toBeNull();
    expect(pickNext([cands[0]], [1], 'random')).toBe(1);
  });
});

describe('active window', () => {
  it('normal and overnight windows', () => {
    expect(inWindow(at(9), '08:00', '22:00')).toBe(true);
    expect(inWindow(at(23), '08:00', '22:00')).toBe(false);
    expect(inWindow(at(23), '22:00', '06:00')).toBe(true);
    expect(inWindow(at(7), '22:00', '06:00')).toBe(false);
    expect(inWindow(at(7), null, null)).toBe(true);
  });
  it('next window start', () => {
    expect(nextWindowStart(at(3), '08:00')).toEqual(at(8));
  });
});

import { describe, expect, it } from 'vitest';
import { beatAt, CELEBRATIONS, drawFromBag, nextCelebration, type Bag, type Celebration } from './timeline';

describe('beatAt', () => {
  const ats = [0, 0.12, 0.3, 1.4];
  it('holds each beat until the next one', () => {
    expect([0, 0.11, 0.12, 0.29, 0.3, 1.39, 1.4, 9].map((t) => beatAt(ats, t))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('the celebration bag', () => {
  const seq = (n: number, seed = 1) => {
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    let bag: Bag | null = null;
    const out: Celebration[] = [];
    for (let i = 0; i < n; i++) {
      const r = drawFromBag(bag, rand);
      out.push(r.pick);
      bag = r.bag;
    }
    return out;
  };
  it('plays all seven before any repeats', () => {
    for (const seed of [1, 7, 42, 99]) {
      const s = seq(21, seed);
      for (let b = 0; b < 3; b++) expect(new Set(s.slice(b * 7, b * 7 + 7)).size, `seed ${seed} bag ${b}`).toBe(CELEBRATIONS.length);
    }
  });
  it('never plays the same one twice in a row, across bags too', () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = seq(28, seed);
      for (let i = 1; i < s.length; i++) expect(s[i], `seed ${seed} at ${i}`).not.toBe(s[i - 1]);
    }
  });
  it('one occasion is one draw, however often it is asked for', () => {
    const store: Record<string, string> = {};
    globalThis.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
    const a = nextCelebration('k', 'routine-1@2026-10-02');
    expect(nextCelebration('k', 'routine-1@2026-10-02')).toBe(a);
    expect((JSON.parse(store['deck.celebrations.k']!) as Bag).left).toHaveLength(6);
    const b = nextCelebration('k', 'routine-2@2026-10-02');
    expect(b).not.toBe(a);
    expect((JSON.parse(store['deck.celebrations.k']!) as Bag).left).toHaveLength(5);
  });
  it('ignores stale entries in a saved bag', () => {
    const r = drawFromBag({ left: ['nope' as Celebration], last: 'pop' });
    expect(CELEBRATIONS).toContain(r.pick);
    expect(r.pick).not.toBe('pop');
  });
});

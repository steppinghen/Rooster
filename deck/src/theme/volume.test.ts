import { describe, expect, it } from 'vitest';
import { celebrationVolume, effectiveVolume, tiltFor } from './volume';

describe('effectiveVolume', () => {
  it('is normal only when both the kid default and the mode are normal', () => {
    expect(effectiveVolume('normal', 'normal')).toBe('normal');
    expect(effectiveVolume('focus', 'normal')).toBe('focus');
    expect(effectiveVolume('normal', 'focus')).toBe('focus');
    expect(effectiveVolume('focus', 'focus')).toBe('focus');
  });
});

describe('celebrationVolume', () => {
  it('is normal unless reduced motion is on, then follows the effective volume', () => {
    expect(celebrationVolume('focus', false)).toBe('normal');
    expect(celebrationVolume('normal', false)).toBe('normal');
    expect(celebrationVolume('focus', true)).toBe('focus');
    expect(celebrationVolume('normal', true)).toBe('normal');
  });
});

describe('tiltFor', () => {
  it('is stable for a seed and within range', () => {
    expect(tiltFor('rooster')).toBe(tiltFor('rooster'));
    for (const s of ['a', 'b', 'turtle', 'kid-1']) {
      const deg = parseFloat(tiltFor(s, 4));
      expect(Math.abs(deg)).toBeLessThanOrEqual(4);
      expect(deg).not.toBe(0);
    }
  });
});

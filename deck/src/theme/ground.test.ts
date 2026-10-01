import { describe, expect, it } from 'vitest';
import { resolveGround } from './ground';

const ctx = (iso: string, over = {}) => ({
  timezone: 'America/New_York',
  at: new Date(iso),
  morningStarts: ['06:45:00'],
  bedtimeStarts: ['19:30:00'],
  prefersLight: false,
  ...over,
});

describe('resolveGround', () => {
  it('fixed settings win', () => {
    expect(resolveGround('day', ctx('2026-10-01T03:00:00Z'))).toBe('day');
    expect(resolveGround('night', ctx('2026-10-01T16:00:00Z'))).toBe('night');
  });
  it('follow device uses the light/dark setting', () => {
    expect(resolveGround('device', ctx('2026-10-01T16:00:00Z', { prefersLight: true }))).toBe('day');
    expect(resolveGround('device', ctx('2026-10-01T16:00:00Z'))).toBe('night');
  });
  it('auto is day from Dawn Patrol until Last Run, in the family time zone', () => {
    // 06:44 and 06:45 New York (EDT, UTC-4)
    expect(resolveGround('auto', ctx('2026-10-01T10:44:00Z'))).toBe('night');
    expect(resolveGround('auto', ctx('2026-10-01T10:45:00Z'))).toBe('day');
    // 19:29 and 19:30
    expect(resolveGround('auto', ctx('2026-10-01T23:29:00Z'))).toBe('day');
    expect(resolveGround('auto', ctx('2026-10-01T23:30:00Z'))).toBe('night');
  });
  it('auto falls back to 6:30 to 7:30 pm without routines', () => {
    expect(resolveGround('auto', ctx('2026-10-01T10:35:00Z', { morningStarts: [], bedtimeStarts: [] }))).toBe('day');
    expect(resolveGround('auto', ctx('2026-10-01T23:35:00Z', { morningStarts: [], bedtimeStarts: [] }))).toBe('night');
  });
});

import { describe, expect, it } from 'vitest';
import type { KidFocus } from '../lib/types';
import { effectiveFocus } from './focus';

const T = Date.parse('2026-10-01T16:00:00Z');
const iso = (offsetMin: number) => new Date(T + offsetMin * 60_000).toISOString();
const row = (over: Partial<KidFocus>): KidFocus => ({
  kid_id: 'k',
  family_id: 'f',
  mode: 'everything',
  since: iso(-60),
  ends_at: null,
  return_mode: null,
  pending_mode: null,
  switch_at: null,
  pending_ends_at: null,
  pinned: [],
  updated_at: iso(-60),
  ...over,
});

describe('effectiveFocus', () => {
  it('defaults to Everything with no row', () => {
    expect(effectiveFocus(undefined, T).mode).toBe('everything');
  });

  it('shows a heads-up before a pending switch, without changing the mode yet', () => {
    const f = effectiveFocus(row({ pending_mode: 'lights_out', switch_at: iso(2) }), T);
    expect(f.mode).toBe('everything');
    expect(f.headsUp).toEqual({ mode: 'lights_out', at: T + 120_000 });
  });

  it('applies the pending mode once switch_at passes, even if nobody wrote the row again', () => {
    const f = effectiveFocus(row({ pending_mode: 'lights_out', switch_at: iso(-1) }), T);
    expect(f.mode).toBe('lights_out');
    expect(f.headsUp).toBeNull();
  });

  it('runs a timed pending session and returns to the mode it replaced', () => {
    const r = row({ mode: 'everything', pending_mode: 'session', switch_at: iso(-10), pending_ends_at: iso(10) });
    expect(effectiveFocus(r, T)).toMatchObject({ mode: 'session', endsAt: T + 600_000, ended: null });
    expect(effectiveFocus(r, T + 11 * 60_000)).toMatchObject({ mode: 'everything', ended: { mode: 'session', at: T + 600_000 } });
  });

  it('a timed mode with an explicit return mode goes there when it ends', () => {
    const r = row({ mode: 'session', since: iso(-20), ends_at: iso(-1), return_mode: 'lights_out' });
    expect(effectiveFocus(r, T)).toMatchObject({ mode: 'lights_out', ended: { mode: 'session' } });
  });

  it('a device clock running fast cannot end a session early when server time is used', () => {
    const r = row({ mode: 'session', since: iso(-5), ends_at: iso(15) });
    expect(effectiveFocus(r, T).mode).toBe('session');
  });
});

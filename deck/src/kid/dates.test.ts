import { describe, expect, it } from 'vitest';
import type { DeckEvent, Kid } from '../lib/types';
import { nextOccurrence, sleepsBetween, upcomingCountdowns } from './dates';

const ev = (over: Partial<DeckEvent>): DeckEvent => ({ id: 'e', family_id: 'f', title: 'Beach trip', icon: 'beach', on_date: '2026-10-13', kind: 'trip', calendar_id: 'c', kid_visibility: 'inherit', kids_see: true, countdown: true, kid_title: null, kid_icon: null, builtin_key: 'deck', repeats_yearly: false, ...over });
const kid = (over: Partial<Kid>): Kid => ({ id: 'k', family_id: 'f', nickname: 'Kid A', avatar: 'turtle', accent: 'magenta', age_band: 'reader', default_volume: 'normal', has_pin: false, birthday_month: null, birthday_day: null, sort_order: 0, created_at: '', can_change_look: true, dock_picks: [], ...over });

describe('sleeps', () => {
  it('counts nights', () => {
    expect(sleepsBetween('2026-10-01', '2026-10-13')).toBe(12);
    expect(sleepsBetween('2026-10-01', '2026-10-01')).toBe(0);
  });
  it('is not thrown off by daylight saving (Nov 1 2026, US)', () => {
    expect(sleepsBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
  it('birthdays roll to next year once passed; Feb 29 works every year', () => {
    expect(nextOccurrence('2026-10-01', 3, 14)).toBe('2027-03-14');
    expect(nextOccurrence('2026-10-01', 10, 1)).toBe('2026-10-01');
    expect(nextOccurrence('2026-10-01', 2, 29)).toBe('2027-02-28');
    expect(nextOccurrence('2027-10-01', 2, 29)).toBe('2028-02-29');
  });
});

describe('upcomingCountdowns', () => {
  it('kid-visible events and birthdays, soonest first; parents-only and past events left out', () => {
    const list = upcomingCountdowns(
      [ev({ id: 'beach' }), ev({ id: 'secret', kids_see: false, on_date: '2026-10-02' }), ev({ id: 'past', on_date: '2026-09-01' }), ev({ id: 'halloween', title: 'Halloween', on_date: '2020-10-31', repeats_yearly: true })],
      [kid({ birthday_month: 10, birthday_day: 5 })],
      '2026-10-01',
    );
    expect(list.map((c) => [c.title, c.sleeps])).toEqual([
      ["Kid A's birthday", 4],
      ['Beach trip', 12],
      ['Halloween', 30],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { Routine } from '../lib/types';
import { finishChip, greeting, isoWeekday, openMoment, season, stickerSlots, todaysRoutines, weekDeck, weekStart, type Award, type CheckinMoment, type KidDeck } from './point';
import type { Completion } from './store';

const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, text: `Step ${i}`, icon: 'star' }));
const routine = (over: Partial<Routine>): Routine => ({ id: 'r', family_id: 'f', kid_ids: [], slot: 'morning', name: 'Dawn Patrol', starts_at: '07:00:00', steps: steps(3), sort_order: 0, days: [1, 2, 3, 4, 5, 6, 7], finish_by: null, finish_label: null, earns_sticker: true, ...over });
const done = (routine_id: string, n: number, completed_at: string | null = null): Completion => ({ routine_id, kid_id: 'k', on_date: '2026-10-02', completed_steps: steps(n).map((s) => s.id), completed_at });
const award = (over: Partial<Award>): Award => ({ id: 'a', kid_id: 'k', kid_deck_id: 'd', source_kind: 'routine', source_id: 'r', award_date: '2026-10-02', sticker_key: null, x: null, y: null, size: null, tilt: null, placed_at: null, ...over });
const TODAY = '2026-10-02'; // a Friday

describe('dates', () => {
  it('ISO weekdays and the Monday a deck week starts', () => {
    expect(isoWeekday(TODAY)).toBe(5);
    expect(isoWeekday('2026-10-04')).toBe(7);
    expect(weekStart(TODAY)).toBe('2026-09-28');
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
    expect(weekStart('2026-10-04')).toBe('2026-09-28');
  });
  it('greets by the time of day', () => {
    expect(greeting(7 * 60)).toBe('Morning');
    expect(greeting(13 * 60)).toBe('Afternoon');
    expect(greeting(19 * 60)).toBe('Evening');
  });
  it("today's routines skip the days they don't run", () => {
    const list = todaysRoutines([routine({ id: 'wk', days: [1, 2, 3, 4, 5] }), routine({ id: 'sat', days: [6] }), routine({ id: 'b', kid_ids: ['other'] })], 'k', TODAY);
    expect(list.map((r) => r.id)).toEqual(['wk']);
  });
});

describe('openMoment', () => {
  const at: CheckinMoment = { id: 'm1', kid_id: 'k', label: 'After school', at_time: '15:30:00', anchor_routine_id: null, sort_order: 0 };
  const bed: CheckinMoment = { id: 'm2', kid_id: 'k', label: 'Bedtime', at_time: '19:45:00', anchor_routine_id: null, sort_order: 1 };
  const base = { today: TODAY, completions: [], checkin: undefined, checkinMinutes: null, doneMinutes: () => 0, dismissed: null };
  it('opens at its time and stays open until a check-in after it', () => {
    expect(openMoment([at, bed], 'k', { ...base, nowMinutes: 15 * 60 })).toBeNull();
    expect(openMoment([at, bed], 'k', { ...base, nowMinutes: 16 * 60 })?.id).toBe('m1');
    const morning = { kid_id: 'k', feeling: 'rolling', size: 1, created_at: '' };
    expect(openMoment([at, bed], 'k', { ...base, nowMinutes: 16 * 60, checkin: morning, checkinMinutes: 8 * 60 })?.id).toBe('m1');
    expect(openMoment([at, bed], 'k', { ...base, nowMinutes: 16 * 60, checkin: morning, checkinMinutes: 15 * 60 + 40 })).toBeNull();
  });
  it('"Not now" rests it until the next moment, which opens fresh', () => {
    expect(openMoment([at, bed], 'k', { ...base, nowMinutes: 17 * 60, dismissed: `${TODAY}@m1` })).toBeNull();
    expect(openMoment([at, bed], 'k', { ...base, nowMinutes: 20 * 60, dismissed: `${TODAY}@m1` })?.id).toBe('m2');
    expect(openMoment([at], 'k', { ...base, nowMinutes: 17 * 60, dismissed: `2026-10-01@m1` })?.id).toBe('m1');
  });
  it('an anchored moment opens when its routine is finished today', () => {
    const anchored: CheckinMoment = { ...at, at_time: null, anchor_routine_id: 'r' };
    expect(openMoment([anchored], 'k', { ...base, nowMinutes: 16 * 60 })).toBeNull();
    expect(openMoment([anchored], 'k', { ...base, nowMinutes: 16 * 60, completions: [done('r', 3, 'x')], doneMinutes: () => 15 * 60 + 50 })?.id).toBe('m1');
  });
  it("only this kid's moments", () => {
    expect(openMoment([{ ...at, kid_id: 'other' }], 'k', { ...base, nowMinutes: 16 * 60 })).toBeNull();
  });
});

describe('stickerSlots', () => {
  const dawn = routine({ id: 'dawn' });
  const after = routine({ id: 'after', name: 'After school', starts_at: '15:30:00' });
  const last = routine({ id: 'last', name: 'Last Run', starts_at: '19:30:00' });
  const plain = routine({ id: 'plain', starts_at: '12:00:00', earns_sticker: false });
  it('one slot per sticker routine; the "?" on the routine running now, with steps to go', () => {
    const s = stickerSlots([last, plain, after, dawn], [done('dawn', 1)], [], 'k', TODAY, 7 * 60 + 10);
    expect(s.map((x) => [x.routine.id, x.kind])).toEqual([['dawn', 'next'], ['after', 'later'], ['last', 'later']]);
    expect(s[0]).toMatchObject({ stepsLeft: 2 });
  });
  it('before anything starts, the "?" is on the first routine, with no step count', () => {
    const s = stickerSlots([dawn, after], [], [], 'k', TODAY, 6 * 60);
    expect(s[0]).toMatchObject({ kind: 'next', stepsLeft: null });
  });
  it('earned, pick waiting, and finished without a sticker (the cap); the "?" moves on', () => {
    const s = stickerSlots([dawn, after, last], [done('dawn', 3), done('after', 3)], [award({ source_id: 'dawn', sticker_key: 'shell' })], 'k', TODAY, 16 * 60);
    expect(s.map((x) => x.kind)).toEqual(['earned', 'done', 'next']);
    expect(s[0]).toMatchObject({ sticker: 'shell' });
    const p = stickerSlots([dawn], [done('dawn', 3)], [award({ source_id: 'dawn' })], 'k', TODAY, 8 * 60);
    expect(p[0]?.kind).toBe('pick');
  });
  it('a routine skipped earlier never reads as missed: it shows like a later one', () => {
    const s = stickerSlots([dawn, after], [], [], 'k', TODAY, 16 * 60);
    expect(s.map((x) => x.kind)).toEqual(['later', 'next']);
  });
  it('at most four slots (the daily cap)', () => {
    const many = [0, 1, 2, 3, 4].map((i) => routine({ id: `r${i}`, starts_at: `0${i + 1}:00:00` }));
    expect(stickerSlots(many, [], [], 'k', TODAY, 0)).toHaveLength(4);
  });
});

describe('weekDeck', () => {
  const deck: KidDeck = { id: 'd', kid_id: 'k', week_start: '2026-09-28', design_key: 'sunset-stripes', colorway: 1, world: 'surf', holiday_key: null };
  it("this week's deck with its placed stickers, oldest first; unplaced and last week's left out", () => {
    const placed = (id: string, at: string) => award({ id, sticker_key: 'shell', x: 0.3, y: 0.5, size: 90, tilt: -8, placed_at: at });
    const w = weekDeck([deck, { ...deck, id: 'old', week_start: '2026-09-21' }], [placed('b', '2026-10-02T10:00:00Z'), placed('a', '2026-09-29T10:00:00Z'), award({ id: 'c' }), { ...placed('z', '2026-09-22T00:00:00Z'), kid_deck_id: 'old' }], 'k', TODAY);
    expect(w.deck?.id).toBe('d');
    expect(w.stickers.map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('no deck yet this week: nothing on it', () => {
    expect(weekDeck([], [], 'k', TODAY)).toEqual({ deck: null, stickers: [] });
  });
});

describe('finishChip', () => {
  it('counts down to the bus within 90 minutes, then goes away', () => {
    const r = routine({ finish_by: '08:05:00', finish_label: 'bus' });
    expect(finishChip(r, 7 * 60 + 47)).toEqual({ label: 'BUS IN', value: '18 min' });
    expect(finishChip(r, 6 * 60)).toBeNull();
    expect(finishChip(r, 8 * 60 + 5)).toBeNull();
    expect(finishChip(routine({ finish_by: '08:05:00', finish_label: 'car' }), 8 * 60)?.label).toBe('CAR IN');
    expect(finishChip(routine({}), 8 * 60)).toBeNull();
  });
});

describe('season', () => {
  it('winter by the family dates, fall Sep–Nov, otherwise spring-summer', () => {
    expect(season(new Date(2026, 9, 2))).toBe('fall');
    expect(season(new Date(2026, 11, 2))).toBe('winter');
    expect(season(new Date(2026, 5, 2))).toBe('spring-summer');
    expect(season(new Date(2026, 10, 20), { winter: { start: '11-15', end: '03-01' } })).toBe('winter');
  });
});

import { describe, expect, it } from 'vitest';
import type { Routine } from '../lib/types';
import { routineNow, routinesForKid } from './routine';

const r = (id: string, slot: Routine['slot'], starts_at: string, kid_id: string | null = null): Routine => ({
  id,
  family_id: 'f',
  kid_id,
  slot,
  name: id,
  starts_at,
  sort_order: 0,
  steps: [
    { id: 'a', text: 'A', icon: 'star' },
    { id: 'b', text: 'B', icon: 'star' },
  ],
});
const all = [r('bed', 'bedtime', '19:30:00'), r('morning', 'morning', '06:30:00'), r('school', 'after_school', '15:30:00'), r('other-kid', 'morning', '07:00:00', 'k2')];
const at = (h: number, m = 0) => h * 60 + m;

describe('routinesForKid', () => {
  it("keeps everyone routines plus the kid's own, in time order", () => {
    expect(routinesForKid(all, 'k1').map((x) => x.id)).toEqual(['morning', 'school', 'bed']);
    expect(routinesForKid(all, 'k2').map((x) => x.id)).toEqual(['morning', 'other-kid', 'school', 'bed']);
  });
});

describe('routineNow', () => {
  it('before the first routine, shows what is coming', () => {
    expect(routineNow(all, [], 'k1', '2026-10-01', at(6, 0))).toMatchObject({ kind: 'waiting', upcoming: { id: 'morning' } });
  });
  it('during a routine, the next step is the first one not done', () => {
    const now = routineNow(all, [{ routine_id: 'morning', kid_id: 'k1', on_date: '2026-10-01', completed_steps: ['a'], completed_at: null }], 'k1', '2026-10-01', at(7));
    expect(now).toMatchObject({ kind: 'active', routine: { id: 'morning' }, next: { id: 'b' } });
  });
  it("yesterday's progress does not count today", () => {
    const now = routineNow(all, [{ routine_id: 'morning', kid_id: 'k1', on_date: '2026-09-30', completed_steps: ['a', 'b'], completed_at: 'x' }], 'k1', '2026-10-01', at(7));
    expect(now).toMatchObject({ kind: 'active', next: { id: 'a' } });
  });
  it('a finished routine points at the next one', () => {
    const now = routineNow(all, [{ routine_id: 'morning', kid_id: 'k1', on_date: '2026-10-01', completed_steps: ['a', 'b'], completed_at: 'x' }], 'k1', '2026-10-01', at(8));
    expect(now).toMatchObject({ kind: 'finished', routine: { id: 'morning' }, upcoming: { id: 'school' } });
  });
  it("a sibling's progress is theirs alone", () => {
    const now = routineNow(all, [{ routine_id: 'morning', kid_id: 'k2', on_date: '2026-10-01', completed_steps: ['a', 'b'], completed_at: 'x' }], 'k1', '2026-10-01', at(7));
    expect(now.kind).toBe('active');
  });
  it('with no routines there is nothing', () => {
    expect(routineNow([], [], 'k1', '2026-10-01', at(7)).kind).toBe('none');
  });
});

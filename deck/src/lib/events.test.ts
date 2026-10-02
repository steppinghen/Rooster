import { describe, expect, it } from 'vitest';
import { kidsSee } from './events';

// Mirrors private.event_kid_visible (009_phase15_rls.sql proves the database side).
describe('kidsSee', () => {
  const cal = (kids_default: 'shown' | 'hidden' | 'never', builtin_key: string | null = null) => ({ kids_default, builtin_key });
  it('Holidays always reach kids', () => expect(kidsSee(cal('shown', 'holidays'), 'hidden')).toBe(true));
  it('work never does, even when shown', () => expect(kidsSee(cal('never'), 'shown')).toBe(false));
  it('an event override beats the calendar', () => {
    expect(kidsSee(cal('hidden'), 'shown')).toBe(true);
    expect(kidsSee(cal('shown'), 'hidden')).toBe(false);
  });
  it('inherit follows the calendar', () => {
    expect(kidsSee(cal('shown'), 'inherit')).toBe(true);
    expect(kidsSee(cal('hidden'), 'inherit')).toBe(false);
  });
  it('no calendar, no kids', () => expect(kidsSee(null, 'shown')).toBe(false));
});

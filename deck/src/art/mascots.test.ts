import { describe, expect, it } from 'vitest';
import { dogName, isWinter, mascotFolder, seasonalPose, seasonDog } from './mascots';

const d = (iso: string) => new Date(`${iso}T12:00:00`);

describe('seasonDog', () => {
  it('Mara Jan–Mar and Jul–Sep, Costa Apr–Jun and Oct–Dec', () => {
    expect(['01-15', '03-31', '07-01', '09-30'].map((x) => seasonDog(d(`2026-${x}`)))).toEqual(['mara', 'mara', 'mara', 'mara']);
    expect(['04-01', '06-30', '10-02', '12-31'].map((x) => seasonDog(d(`2026-${x}`)))).toEqual(['costa', 'costa', 'costa', 'costa']);
  });
  it('a parent pin wins', () => expect(seasonDog(d('2026-10-02'), 'mara')).toBe('mara'));
});

describe('winter', () => {
  it('Dec 1 to the end of February by default, leap day included', () => {
    expect(isWinter(d('2026-11-30'))).toBe(false);
    expect(isWinter(d('2026-12-01'))).toBe(true);
    expect(isWinter(d('2028-02-29'))).toBe(true);
    expect(isWinter(d('2027-03-01'))).toBe(false);
  });
  it("follows the family's dates", () => {
    const s = { winter: { start: '01-10', end: '02-10' } };
    expect(isWinter(d('2026-12-20'), s)).toBe(false);
    expect(isWinter(d('2027-01-20'), s)).toBe(true);
  });
  it('standing and board poses switch to snowboards', () => {
    expect(seasonalPose('board', d('2026-12-20'))).toBe('winter-board');
    expect(seasonalPose('hello', d('2026-12-20'))).toBe('winter');
    expect(seasonalPose('calm', d('2026-12-20'))).toBe('calm');
    expect(seasonalPose('board', d('2026-10-02'))).toBe('board');
  });
});

describe('dog folder and name', () => {
  it('asks for "dog" and gets the season’s one', () => {
    expect(mascotFolder('dog', d('2026-10-02'))).toBe('mascots/dog-costa');
    expect(mascotFolder('rooster', d('2026-10-02'))).toBe('mascots/rooster');
  });
  it('names come from the family settings, defaulting to Mara and Costa', () => {
    expect(dogName(d('2026-02-02'))).toBe('Mara');
    expect(dogName(d('2026-10-02'), { dog: { names: { costa: 'C' } } })).toBe('C');
  });
});

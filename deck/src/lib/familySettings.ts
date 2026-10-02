// families.settings with its defaults (the database validates the shape: valid_family_settings).
// Absent keys mean these defaults.

export type HolidayKey = 'halloween' | 'thanksgiving' | 'christmas' | 'new_year' | 'valentines' | 'st_patricks' | 'easter' | 'fourth_of_july' | 'birthday';
export type DogPin = 'season' | 'mara' | 'costa';

export type FamilySettings = {
  holidays?: { on?: boolean; off?: HolidayKey[] };
  /** "MM-DD"; an end of "02-29" means the end of February in any year. */
  winter?: { start?: string; end?: string };
  dog?: { pin?: DogPin; names?: { mara?: string; costa?: string } };
  /** The five tip temperatures, coldest first. */
  tips?: [number, number, number, number, number];
  home?: { lat: number; lon: number };
  units?: 'f' | 'c';
};

export const DEFAULTS = {
  winter: { start: '12-01', end: '02-29' },
  // The family's dogs (REVIEW.md A59); a parent can rename them in Back Office.
  dogNames: { mara: 'Mara', costa: 'Costa' },
  tips: [35, 45, 65, 75, 85] as [number, number, number, number, number],
  units: 'f' as const,
};

export function winterRange(s: FamilySettings | null | undefined) {
  return { start: s?.winter?.start ?? DEFAULTS.winter.start, end: s?.winter?.end ?? DEFAULTS.winter.end };
}

export function dogNames(s: FamilySettings | null | undefined) {
  return { mara: s?.dog?.names?.mara ?? DEFAULTS.dogNames.mara, costa: s?.dog?.names?.costa ?? DEFAULTS.dogNames.costa };
}

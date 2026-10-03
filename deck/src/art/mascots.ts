import { dogNames, winterRange, type DogPin, type FamilySettings } from '../lib/familySettings';

// Which mascot drawing to show (docs/design-system.md "Mascots"). Components never ask for a dog
// by name: they ask for "dog", and the season (or a parent's pin) decides.

export type Dog = 'mara' | 'costa';
export type Mascot = 'rooster' | 'turtle' | 'dog';
export type Pose =
  | 'board' | 'hello' | 'celebrate' | 'calm' | 'headsup' | 'breathing' | 'bedtime' | 'winter' | 'winter-board' | 'slap' | 'float' | 'tucked'
  // Animation frames (R3Idle, R3LightsOut)
  | 'idle' | 'idle-blink' | 'idle-tail' | 'lights-calm' | 'yawn' | 'lights-tucked' | 'roost';

/** Mara in Jan–Mar and Jul–Sep, Costa in Apr–Jun and Oct–Dec, unless a parent pinned one. */
export function seasonDog(date: Date, pin: DogPin = 'season'): Dog {
  if (pin === 'mara' || pin === 'costa') return pin;
  const quarter = Math.floor(date.getMonth() / 3); // 0..3
  return quarter % 2 === 0 ? 'mara' : 'costa';
}

const md = (d: Date) => (d.getMonth() + 1) * 100 + d.getDate();
const parse = (s: string) => Number(s.slice(0, 2)) * 100 + Number(s.slice(3, 5));

/** Winter runs from the start date through the end date, across New Year ("02-29" = end of Feb). */
export function isWinter(date: Date, settings?: FamilySettings | null): boolean {
  const { start, end } = winterRange(settings);
  const [s, e, d] = [parse(start), parse(end) === 229 ? 229 : parse(end), md(date)];
  return s <= e ? d >= s && d <= e : d >= s || d <= e;
}

/** In winter, standing and board poses become their snowboard versions. */
export function seasonalPose(pose: Pose, date: Date, settings?: FamilySettings | null): Pose {
  if (!isWinter(date, settings)) return pose;
  if (pose === 'board') return 'winter-board';
  if (pose === 'hello') return 'winter';
  return pose;
}

/** The art folder for a mascot today: mascots/rooster, mascots/turtle, mascots/dog-mara|costa. */
export function mascotFolder(m: Mascot, date: Date, settings?: FamilySettings | null): string {
  return m === 'dog' ? `mascots/dog-${seasonDog(date, settings?.dog?.pin)}` : `mascots/${m}`;
}

/** The dog's name to show and speak (stored per family, editable). */
export function dogName(date: Date, settings?: FamilySettings | null): string {
  return dogNames(settings)[seasonDog(date, settings?.dog?.pin)];
}

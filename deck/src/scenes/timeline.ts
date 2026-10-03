// The stepped flipbook (docs/design-system.md "Animations"): every animation is a list of beats
// at fixed times; each beat swaps a pose or sets a transform, with steps(1, end) timing. It
// plays once and holds the last frame. Reduce Motion shows only the still.

/** Index of the beat showing at `t` seconds (the last one whose time has come). */
export function beatAt(ats: readonly number[], t: number): number {
  let i = 0;
  for (let k = 0; k < ats.length; k++) if (t >= ats[k]!) i = k;
  return i;
}

// ---------------------------------------------------------------------------------------------
// The celebration bag: seven variations, shuffled; all seven play before any repeats, and a new
// bag never opens with the one that just played.
// ---------------------------------------------------------------------------------------------

export const CELEBRATIONS = ['pop', 'confetti', 'rooster-cheer', 'shell-spin', 'kickflip', 'stoked', 'squad'] as const;
export type Celebration = (typeof CELEBRATIONS)[number];
export type Bag = { left: Celebration[]; last: Celebration | null; occasion?: string };

export function drawFromBag(bag: Bag | null, rand: () => number = Math.random): { pick: Celebration; bag: Bag } {
  let left = bag?.left.filter((c) => (CELEBRATIONS as readonly string[]).includes(c)) ?? [];
  const last = bag?.last ?? null;
  if (!left.length) {
    left = [...CELEBRATIONS];
    for (let i = left.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [left[i], left[j]] = [left[j]!, left[i]!];
    }
    // Never open a new bag with the one that just played.
    if (left[0] === last) [left[0], left[1]] = [left[1]!, left[0]!];
  }
  const [pick, ...rest] = left as [Celebration, ...Celebration[]];
  return { pick, bag: { left: rest, last: pick } };
}

const bagKey = (kidId: string) => `deck.celebrations.${kidId}`;

function readBag(kidId: string): Bag | null {
  try {
    return JSON.parse(localStorage.getItem(bagKey(kidId)) ?? 'null') as Bag | null;
  } catch {
    return null;
  }
}

/**
 * The celebration for this kid's `occasion` (a routine finished today, a Session ending),
 * remembered on this device. Asking again for the same occasion returns the same one without
 * drawing: React's StrictMode runs initializers twice in development, and a reload mid-way
 * shouldn't spend another draw either.
 */
export function nextCelebration(kidId: string, occasion: string): Celebration {
  const saved = readBag(kidId);
  if (saved && saved.occasion === occasion && saved.last) return saved.last;
  const next = drawFromBag(saved);
  next.bag.occasion = occasion;
  try {
    localStorage.setItem(bagKey(kidId), JSON.stringify(next.bag));
  } catch {
    /* without storage the bag just restarts */
  }
  return next.pick;
}

const askedThisLoad = new Map<string, boolean>();

/**
 * True the first time `key` is asked about today on this device (trim entrances, tag pops).
 * Asking again in the same page load gives the same answer (StrictMode asks twice in dev).
 */
export function firstTimeToday(key: string, today: string): boolean {
  const memo = `${key}@${today}`;
  if (askedThisLoad.has(memo)) return askedThisLoad.get(memo)!;
  const answer = firstTimeTodayUncached(key, today);
  askedThisLoad.set(memo, answer);
  return answer;
}

function firstTimeTodayUncached(key: string, today: string): boolean {
  const k = `deck.once.${key}`;
  try {
    if (localStorage.getItem(k) === today) return false;
    localStorage.setItem(k, today);
  } catch {
    /* without storage, play it: a repeat is harmless */
  }
  return true;
}

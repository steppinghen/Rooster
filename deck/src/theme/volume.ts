export type Volume = 'normal' | 'focus';
export type Ground = 'day' | 'night';
export type Scene = 'default' | 'lastrun';

/**
 * Effective volume for a kid screen (CLAUDE.md "Per-kid default volume"):
 * the quieter of the kid's default and the volume the current focus mode asks for.
 */
export function effectiveVolume(kidDefault: Volume, modeVolume: Volume): Volume {
  return kidDefault === 'focus' || modeVolume === 'focus' ? 'focus' : 'normal';
}

/**
 * Celebration screens use normal styling, unless reduced motion is on: then they stay at the
 * kid's effective volume (CLAUDE.md "Per-kid default volume").
 */
export function celebrationVolume(effective: Volume, reducedMotion: boolean): Volume {
  return reducedMotion ? effective : 'normal';
}

/**
 * A small, stable tilt for stickers and cards in normal volume. Seeded so the same sticker
 * keeps the same tilt on every render (predictability matters more than randomness for kids).
 */
export function tiltFor(seed: string, maxDeg = 5): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 1000) / 999; // 0..1
  const deg = Math.round((unit * 2 - 1) * maxDeg * 10) / 10;
  return `${deg === 0 ? 1 : deg}deg`;
}

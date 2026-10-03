import type { Volume } from '../theme/volume';
import { artSrc, isArtKey } from './art';
import { artFor } from './original';

// Sticker keys are bare names ("shell", "octopus"). The original Sticker Punk art wins; a key it
// doesn't draw falls back to the vendored Fluent set, then to nothing (the caller shows a star).
const WORLDS = ['surf', 'skate', 'snow', 'school', 'travel', 'holiday', 'faith'];

export function stickerSrc(key: string, px: number, volume: Volume): string | undefined {
  for (const w of WORLDS) {
    const url = artFor(`stickers/${w}`, key, px, volume);
    if (url) return url;
  }
  return isArtKey(key) ? artSrc(key) : undefined;
}

/** A sticker's spoken and visible name ("palm-island" → "Palm island"). */
export function stickerName(key: string): string {
  const s = key.replace(/[-_]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

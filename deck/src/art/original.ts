import type { Volume } from '../theme/volume';
import { sizeClass, type SizeClass } from '../ui/sizeClass';

// The original Sticker Punk art, exported from the canvas by scripts/export-art.mjs into
// src/assets/art/<group>/<key>.<class>.svg. Vite fingerprints each file.
const URLS = import.meta.glob('../assets/art/**/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const FALLBACK: Record<SizeClass, SizeClass[]> = { lg: ['lg', 'md', 'sm'], md: ['md', 'sm', 'lg'], sm: ['sm', 'md', 'lg'] };

/** The file for a piece of art at a class, or the nearest class drawn for it. */
export function artUrl(group: string, key: string, cls: SizeClass): string | undefined {
  for (const c of FALLBACK[cls]) {
    const url = URLS[`../assets/art/${group}/${key}.${c}.svg`];
    if (url) return url;
  }
  return undefined;
}

/** The file for art rendered at `px` in this volume (focus never uses lg). */
export function artFor(group: string, key: string, px: number, volume: Volume): string | undefined {
  return artUrl(group, key, sizeClass(px, volume));
}

/** Art without a class suffix (holiday trims and circles, seasonal suns). */
export function wholeArt(group: string, name: string): string | undefined {
  return URLS[`../assets/art/${group}/${name}.svg`] ?? URLS[`../assets/art/${group}/${name}.lg.svg`];
}

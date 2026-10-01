// Vendored art: Fluent Emoji 3D (the parent's pick in slice 0), resized to the largest size each
// file is shown at and stored as WebP. Every key has an entry in ASSETS.md; add art by editing
// manifest.json and running `npm run art`.
import manifest from './manifest.json';

export type ArtGroup = 'mascot' | 'feeling' | 'step' | 'event' | 'calm' | 'body' | 'tool';
export type ArtKey = keyof typeof manifest;
type ArtEntry = { fluent: string; px: number; group: ArtGroup; label: string };

export const ART = manifest as Record<ArtKey, ArtEntry>;
export const ART_KEYS = Object.keys(ART) as ArtKey[];

export function isArtKey(key: string): key is ArtKey {
  return Object.prototype.hasOwnProperty.call(ART, key);
}

export function artSrc(key: ArtKey): string {
  return `/art/fluent/${key}.webp`;
}

export function artInGroup(group: ArtGroup): ArtKey[] {
  return ART_KEYS.filter((k) => ART[k].group === group);
}

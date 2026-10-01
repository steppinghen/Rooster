// Vendored art. Every file here has an entry in ASSETS.md.
// ART_STYLE is the parent's pick from the slice 0 flat-vs-3D test; until then feature screens
// must not use art (PHASE1_PLAN.md slice 0).
export type ArtStyle = '3d' | 'flat';
export const ART_STYLE: ArtStyle | null = null;

const files = {
  rooster: 'rooster',
  turtle: 'turtle',
  pumping: 'grinning_face_with_big_eyes',
  rolling: 'relieved_face',
  flat: 'pensive_face',
  choppy: 'angry_face',
  toothbrush: 'toothbrush',
  shirt: 't-shirt',
} as const;

export type ArtKey = keyof typeof files;
export const ART_KEYS = Object.keys(files) as ArtKey[];

export function artSrc(key: ArtKey, style: ArtStyle): string {
  return style === '3d' ? `/art/fluent/3d/${files[key]}.png` : `/art/fluent/flat/${files[key]}.svg`;
}

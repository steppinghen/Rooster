import type { Volume } from '../theme/volume';

/**
 * The art spec's size classes (docs/design-system.md "Size classes"): the die-cut and halftone
 * change with the size art is shown at. lg is 80 px and up at normal volume (halftone on); md is
 * 48–79 px, or any size in focus volume (focus never uses lg); sm is under 48 px.
 */
export type SizeClass = 'lg' | 'md' | 'sm';

export function sizeClass(px: number, volume: Volume): SizeClass {
  if (px < 48) return 'sm';
  if (px >= 80 && volume === 'normal') return 'lg';
  return 'md';
}

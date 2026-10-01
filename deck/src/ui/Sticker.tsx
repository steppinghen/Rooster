import type { CSSProperties } from 'react';
import { ART, artSrc, type ArtKey } from '../art/art';
import { tiltFor } from '../theme/volume';

/**
 * Art shown as a die-cut sticker (white border, ink outline, hard shadow, small tilt at normal
 * volume). The tilt is seeded by the art key so it never jumps around between renders.
 */
export function Sticker({ art, size = 96, alt, decorative }: { art: ArtKey; size?: number; alt?: string; decorative?: boolean }) {
  const css = { '--sticker-size': `${size}px`, '--tilt': tiltFor(art, 6) } as CSSProperties;
  return (
    <span className="dk-sticker" style={css}>
      <img src={artSrc(art)} alt={decorative ? '' : (alt ?? ART[art].label)} width={size} height={size} draggable={false} />
    </span>
  );
}

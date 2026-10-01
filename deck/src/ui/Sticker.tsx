import type { CSSProperties } from 'react';
import { artSrc, type ArtKey, type ArtStyle } from '../art/art';
import { tiltFor } from '../theme/volume';

/** Art shown as a die-cut sticker. The tilt is seeded by the art key so it never jumps around. */
export function Sticker({ art, style: artStyle, size = 96, alt = '' }: { art: ArtKey; style: ArtStyle; size?: number; alt?: string }) {
  const css = { '--sticker-size': `${size}px`, '--tilt': tiltFor(art, 6) } as CSSProperties;
  return (
    <span className="dk-sticker" style={css}>
      <img src={artSrc(art, artStyle)} alt={alt} draggable={false} />
    </span>
  );
}

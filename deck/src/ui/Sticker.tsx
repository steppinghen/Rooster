import { ART, artSrc, type ArtKey } from '../art/art';
import { tiltFor } from '../theme/volume';
import { DieCut } from './DieCut';

/**
 * Art shown as a sticker, with the one die-cut every sticker gets (DieCut). The tilt is seeded
 * by the art key so it never jumps around between renders, and applies at normal volume only.
 */
export function Sticker({ art, size = 96, alt, decorative }: { art: ArtKey; size?: number; alt?: string; decorative?: boolean }) {
  return (
    <DieCut size={size} tilt={parseFloat(tiltFor(art, 6))} label={decorative ? undefined : (alt ?? ART[art].label)} className="dk-sticker">
      <img src={artSrc(art)} alt="" width={size} height={size} draggable={false} />
    </DieCut>
  );
}

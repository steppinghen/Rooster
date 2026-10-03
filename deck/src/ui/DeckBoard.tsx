import type { CSSProperties } from 'react';
import { deckDesign } from '../art/decks';
import { stickerSrc } from '../art/stickers';
import type { PlacedSticker } from '../kid/point';
import { useTheme } from '../theme/ThemeScope';
import { DieCut } from './DieCut';
import { Icon } from './Icon';

// Truck bolts, as the B2 frames place them (percent of the deck).
const BOLTS: [number, number][] = [10.8, 15.2, 84.8, 89.2].flatMap((x) => [[x, 38] as [number, number], [x, 62] as [number, number]]);

/**
 * The kid's deck for the week, seen from above: the design's stripes ending in the kid's color,
 * a halftone (normal volume only), truck bolts, and the stickers at their saved spots. Saved
 * sizes are for the full-size My week deck (86–96 px); `scale` shrinks them for The Point. The
 * same spots and sizes are used in portrait and landscape, so stickers look larger on the
 * shorter deck. Focus volume: no halftone, no tilt, but the deck keeps its kid-color tint.
 */
export function DeckBoard({ design, stickers, scale = 1, className = '' }: { design: string | null | undefined; stickers: PlacedSticker[]; scale?: number; className?: string }) {
  const { volume } = useTheme();
  const d = deckDesign(design);
  const [a, b, c] = d.stripes;
  const paint = `linear-gradient(180deg, ${a} 0 24%, var(--ink) 24% 26%, ${b} 26% 46%, var(--ink) 46% 48%, ${c} 48% 66%, var(--ink) 66% 68%, var(--kid, var(--accent)) 68% 100%)`;
  const n = stickers.length;
  return (
    <div className={`dk-deck ${className}`} role="img" aria-label={`This week: ${d.name} deck with ${n} ${n === 1 ? 'sticker' : 'stickers'}`} data-design={design ?? 'sunset-stripes'}>
      <span className="dk-deck__paint" style={{ background: paint }}>
        <span className="dk-deck__halftone" />
      </span>
      {BOLTS.map(([x, y]) => (
        <span key={`${x}-${y}`} className="dk-deck__bolt" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {stickers.map((s) => {
        const px = Math.round(s.size * scale);
        const src = stickerSrc(s.key, px, volume);
        return (
          <span key={s.id} className="dk-deck__sticker" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` } as CSSProperties} data-sticker={s.key}>
            <DieCut size={px} tilt={s.tilt}>
              {src ? <img src={src} alt="" draggable={false} /> : <Icon name="star" size={px} />}
            </DieCut>
          </span>
        );
      })}
    </div>
  );
}

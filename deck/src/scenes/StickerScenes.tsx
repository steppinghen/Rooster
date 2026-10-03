import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTheme } from '../theme/ThemeScope';
import { MascotArt, PropArt } from './MascotArt';
import { useTimeline } from './useTimeline';

/**
 * Sticker earned (R6StickerSlap), 3.2 s: the season's dog rolls in over 0.9 s in six steps with
 * the sticker held up, stops at the spot, winds up (Celebrate, 1.05 s), slaps it on with a flat
 * paw (Slap, 1.4 s: the sticker squashes, impact lines), lifts the paw while the sticker bounces
 * once (1.85 s), then rolls off in four steps from 2.5 s. If the spot is on the left half he
 * rides in from the right, facing left, so he never runs off screen. In focus volume he sets it
 * down gently (no slap). Reduce Motion: the dog beside the stuck sticker.
 *
 * `spot` is the sticker's saved place on the deck (0–1); the parent element is the deck.
 */
const ROLL_IN = [0, 0.15, 0.3, 0.45, 0.6, 0.75];
const ROLL_OFF = [2.5, 2.675, 2.85, 3.025];
const ATS = [...ROLL_IN, 0.9, 1.05, 1.4, 1.85, ...ROLL_OFF, 3.2];

export function PawSlap({ spot, sticker, size, tilt, onDone, reduced }: { spot: { x: number; y: number }; sticker: ReactNode; size: number; tilt: number; onDone: () => void; reduced?: boolean }) {
  const { volume } = useTheme();
  const gentle = volume === 'focus';
  const { beat } = useTimeline(ATS, 3.2, { reduced, onDone, holdAfter: 0.2 });
  const fromRight = spot.x < 0.5;
  const t = ATS[beat]!;
  // Horizontal offset of the dog from the spot, in dog widths: rolling in, parked, rolling off.
  const side = fromRight ? 1 : -1;
  const dx = t < 0.9 ? side * (1 - beat / ROLL_IN.length) * 3 : t >= 2.5 ? -side * ((beat - ATS.indexOf(2.5) + 1) / ROLL_OFF.length) * 3 : 0;
  const pose = reduced ? 'hello' : t < 1.05 || t >= 2.5 ? 'board' : t < 1.4 ? 'celebrate' : t < 1.85 && !gentle ? 'slap' : 'celebrate';
  const placed = reduced || t >= 1.4;
  const squash = !reduced && !gentle && t >= 1.4 && t < 1.85 ? 'scale(1.06, 0.9)' : !reduced && t >= 1.85 && t < 2.5 ? 'scale(1.04)' : 'none';
  const dog = 220;
  return (
    <span className="sc-slap" data-testid="paw-slap" data-beat={beat} data-from={fromRight ? 'right' : 'left'} style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` } as CSSProperties}>
      <span className="sc-slap__sticker" data-placed={placed} style={{ width: size, height: size, rotate: placed ? `${tilt}deg` : '0deg', transform: placed ? squash : `translate(${dx * dog}px, ${-dog * 0.55}px)` }}>
        {sticker}
      </span>
      {!reduced && !gentle && t >= 1.4 && t < 1.85 && <PropArt name="impact-lines" width={size * 1.4} className="sc-slap__impact" />}
      <span className="sc-slap__dog" style={{ transform: `translate(calc(${dx * dog}px + ${fromRight ? 30 : -30}%), -78%)` }}>
        <MascotArt who="dog" pose={pose} px={dog} mirror={fromRight} />
      </span>
    </span>
  );
}

/**
 * End of Last Run (quiet, focus volume): no burst, no shout word. A face-down sticker; a tap (or
 * 8 s) peels it from the top-right corner in five steps over about 1 s; a warm glow; its name is
 * shown and spoken; the dog in his nightcap walks it to the deck and sets it down (2.6 s, no
 * slap, no tilt); "Good night" dims the screen in steps (1.6 s) and hands off to Lights out.
 * Reduce Motion: the sticker face up with its name, then the hand-off.
 */
export function QuietReveal({ sticker, name, onSpeak, onDone, reduced }: { sticker: ReactNode; name: string; onSpeak: () => void; onDone: () => void; reduced?: boolean }) {
  const [peeled, setPeeled] = useState(!!reduced);
  useEffect(() => {
    if (peeled) return;
    const t = setTimeout(() => setPeeled(true), 8000);
    return () => clearTimeout(t);
  }, [peeled]);
  const ats = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.3, 3.9, 4.3, 4.7, 5.1, 5.5];
  const { beat } = useTimeline(ats, 5.5, { reduced, onDone, holdAfter: 0.3, play: peeled });
  useEffect(() => {
    if (peeled && (reduced || beat === 6)) onSpeak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peeled, reduced, beat === 6]);
  const peel = reduced ? 5 : peeled ? Math.min(5, beat) : 0;
  const walking = !reduced && beat >= 6 && beat < 7;
  const dim = reduced ? 0 : Math.max(0, beat - 6);
  return (
    <div className="sc-reveal" data-testid="quiet-reveal" data-peel={peel} data-beat={peeled ? beat : -1} style={{ '--dim': dim } as CSSProperties}>
      <p className="dk-title sc-reveal__title">All done.</p>
      <button type="button" className="sc-reveal__card" data-peeled={peel === 5} onClick={() => setPeeled(true)} aria-label={peel === 5 ? name : 'Tap to peel your surprise'} disabled={peeled}>
        <span className="sc-reveal__face" style={{ '--peel': peel } as CSSProperties}>
          {sticker}
        </span>
        {peel < 5 && (
          <span className="sc-reveal__back" style={{ '--peel': peel } as CSSProperties} aria-hidden="true">
            ?
          </span>
        )}
      </button>
      {peel === 5 && <p className="dk-title sc-reveal__name">{name}</p>}
      <span className={`sc-reveal__dog${walking ? ' sc-reveal__dog--walk' : ''}`} aria-hidden="true">
        <MascotArt who="dog" pose="bedtime" px={150} />
      </span>
      {beat >= 7 && <p className="dk-title sc-reveal__night">Good night</p>}
    </div>
  );
}

import type { CSSProperties, ReactNode } from 'react';
import type { Celebration as Kind } from './timeline';
import { MascotArt, PropArt } from './MascotArt';
import { useTimeline } from './useTimeline';

/**
 * Routine done / chores approved: one of seven short celebrations (R3 and R5 frames), drawn
 * from the kid's shuffled bag (nextCelebration). Stepped beats at the art spec's times; it
 * holds the last frame, ends by itself, and a tap skips it. Reduce Motion: the still and its
 * shout word. Always normal volume unless Reduce Motion is on (the caller sets the theme).
 */
type Beat = { at: number; draw: ReactNode };

const SHOUT: Record<Kind, string | null> = { pop: 'POP!', confetti: null, 'rooster-cheer': 'WOO-HOO!', 'shell-spin': 'WHEEE!', kickflip: 'SHRED!', stoked: 'STOKED!', squad: 'YEAH!' };
const CELEBRATION_LENGTH: Record<Kind, number> = { pop: 1.4, confetti: 1.6, 'rooster-cheer': 1.4, 'shell-spin': 1.8, kickflip: 1.6, stoked: 2.0, squad: 1.8 };

/** The burst the canvas draws in CSS: an ink-shadowed yellow star with magenta halftone. */
// Burst colors from the frames: lilac WHEEE!, lime SHRED!, magenta YEAH!, yellow for the rest.
const BURST_COLOR: Record<string, string> = { 'WHEEE!': 'var(--lilac)', 'SHRED!': 'var(--lime)', 'YEAH!': 'var(--magenta)' };

export function ShoutBurst({ word, scale = 1, size = 260 }: { word: string; scale?: number; size?: number }) {
  return (
    // The word fits the star whatever its length (POP! is big, WOO-HOO! a little smaller).
    <span className="sc-burst" style={{ '--burst': `${size}px`, '--word': `${Math.min(size * 0.17, (size * 0.92) / word.length)}px`, '--burst-fill': BURST_COLOR[word] ?? 'var(--yellow)', '--burst-dots': BURST_COLOR[word] ? 'rgba(10, 8, 24, 0.2)' : 'rgba(255, 62, 138, 0.35)', transform: `scale(${scale}) rotate(-6deg)` } as CSSProperties} aria-hidden="true">
      <span className="sc-burst__shadow" />
      <span className="sc-burst__face">
        <span className="sc-burst__word">{word}</span>
      </span>
    </span>
  );
}

const pose = (who: 'rooster' | 'turtle' | 'dog', p: Parameters<typeof MascotArt>[0]['pose'], px: number, style?: CSSProperties) => <MascotArt who={who} pose={p} px={px} style={style} />;

function Confetti({ drop }: { drop: number }) {
  // Four stepped drops from the top, then it lands and holds (R3 "Confetti drop").
  const pieces = Array.from({ length: 22 }, (_, i) => i);
  const colors = ['var(--magenta)', 'var(--cyan)', 'var(--yellow)', 'var(--lime)', 'var(--lilac)', 'var(--orange)'];
  return (
    <span className="sc-confetti" aria-hidden="true">
      {pieces.map((i) => (
        <span
          key={i}
          className="sc-confetti__bit"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            transform: `translateY(${[-120, -70, -30, 0][drop]! + ((i * 13) % 30)}%) rotate(${(i * 47) % 360}deg)`,
            top: `${58 + ((i * 29) % 34)}%`,
          }}
        />
      ))}
    </span>
  );
}

function beats(kind: Kind): Beat[] {
  const big = 240;
  switch (kind) {
    case 'pop':
      return [0.3, 1.15, 1, 0].map((s, i) => ({ at: [0, 0.12, 0.3, 1.4][i]!, draw: <ShoutBurst word="POP!" scale={s} /> }));
    case 'confetti':
      return [0, 1, 2, 3].map((d, i) => ({ at: [0, 0.4, 0.8, 1.6][i]!, draw: <Confetti drop={d} /> }));
    case 'rooster-cheer':
      return [
        { at: 0, draw: pose('rooster', 'calm', big) },
        { at: 0.2, draw: pose('rooster', 'calm', big, { transform: 'scaleY(0.9)', transformOrigin: 'bottom' }) },
        { at: 0.4, draw: pose('rooster', 'celebrate', big, { transform: 'translateY(-40px)' }) },
        { at: 1.0, draw: <>{pose('rooster', 'celebrate', big)}<ShoutBurst word="WOO-HOO!" size={190} /></> },
      ];
    case 'shell-spin':
      return [
        { at: 0, draw: pose('turtle', 'hello', big) },
        { at: 0.25, draw: pose('turtle', 'tucked', big) },
        { at: 0.5, draw: <>{pose('turtle', 'tucked', big, { transform: 'rotate(120deg)' })}<PropArt name="spin-lines" width={240} className="sc-prop" /></> },
        { at: 0.75, draw: <>{pose('turtle', 'tucked', big, { transform: 'rotate(240deg)' })}<PropArt name="spin-lines" width={240} className="sc-prop" /></> },
        { at: 1.0, draw: <>{pose('turtle', 'celebrate', big)}<ShoutBurst word="WHEEE!" size={190} /></> },
      ];
    case 'kickflip':
      return [
        { at: 0, draw: pose('dog', 'board', big, { transform: 'translateX(-120px)' }) },
        { at: 0.3, draw: pose('dog', 'board', big, { transform: 'translateY(-46px) rotate(-14deg)' }) },
        { at: 0.55, draw: pose('dog', 'board', big, { transform: 'translateY(-24px) rotate(18deg)' }) },
        { at: 0.8, draw: <>{pose('dog', 'board', big)}<ShoutBurst word="SHRED!" size={190} /></> },
      ];
    case 'stoked':
      return [
        { at: 0, draw: <>{pose('rooster', 'board', big, { transform: 'translate(-150px, 20px)' })}<PropArt name="wave-strip" width={420} className="sc-wave" /></> },
        { at: 0.4, draw: <>{pose('rooster', 'board', big, { transform: 'translate(-50px, 60px)' })}<PropArt name="wave-strip" width={420} className="sc-wave" /></> },
        { at: 0.8, draw: <>{pose('rooster', 'board', big, { transform: 'translate(50px, 60px)' })}<PropArt name="wave-strip" width={420} className="sc-wave" /></> },
        { at: 1.2, draw: <>{pose('rooster', 'board', big, { transform: 'translate(140px, 40px) rotate(10deg)' })}<PropArt name="wave-strip" width={420} className="sc-wave" /><ShoutBurst word="STOKED!" size={190} /></> },
      ];
    case 'squad': {
      const squad = (n: number, cheer: boolean) => (
        <span className="sc-squad">
          {n > 0 && pose('rooster', cheer ? 'celebrate' : 'hello', 150)}
          {n > 1 && pose('turtle', cheer ? 'celebrate' : 'hello', 150)}
          {n > 2 && pose('dog', cheer ? 'celebrate' : 'hello', 150)}
        </span>
      );
      return [
        { at: 0, draw: squad(0, false) },
        { at: 0.2, draw: squad(1, false) },
        { at: 0.45, draw: squad(2, false) },
        { at: 0.7, draw: squad(3, false) },
        { at: 1.0, draw: <>{squad(3, true)}<ShoutBurst word="YEAH!" size={190} /></> },
      ];
    }
  }
}

/** The still Reduce Motion shows: the settled frame with its shout word. */
function still(kind: Kind): ReactNode {
  if (kind === 'pop') return <ShoutBurst word="POP!" />;
  return beats(kind).at(-1)!.draw;
}

export function Celebration({ kind, title, onDone, reduced, holdAfter = 1.6 }: { kind: Kind; title: string; onDone: () => void; reduced?: boolean; holdAfter?: number }) {
  const list = beats(kind);
  const { beat, skip } = useTimeline(
    list.map((b) => b.at),
    CELEBRATION_LENGTH[kind],
    // POP shrinks out to nothing, so it holds only briefly (long enough to read the title).
    { reduced, onDone, holdAfter: kind === 'pop' && !reduced ? 0.8 : holdAfter },
  );
  return (
    <button type="button" className="sc-celebrate" data-testid="celebration" data-kind={kind} data-beat={beat} onClick={skip} aria-label={`${title} Tap to keep going.`}>
      <span className="sc-celebrate__stage" aria-hidden="true">
        {reduced ? still(kind) : list[beat]!.draw}
      </span>
      <span className="dk-title sc-celebrate__title">{title}</span>
      {SHOUT[kind] && <span className="sc-sr">{SHOUT[kind]}</span>}
    </button>
  );
}

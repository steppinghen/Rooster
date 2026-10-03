import { useState, type ReactNode } from 'react';
import type { Mascot, Pose } from '../art/mascots';
import { MascotArt } from './MascotArt';
import { firstTimeToday } from './timeline';
import { IDLE } from './useIdleTurn';
import { useTimeline } from './useTimeline';

/**
 * The breathing wave: the floating turtle rides the tide, 4 counts in and 4 counts out (a CSS
 * transform: continuous motion is allowed here). Reduce Motion: a still turtle with the in and
 * out words.
 */
export function BreathingWave({ phase, reduced }: { phase: 'in' | 'out'; reduced?: boolean }) {
  return (
    <div className={`sc-breathe${reduced ? ' sc-breathe--still' : ''}`} data-testid="breathing-wave" data-phase={phase}>
      <span className="sc-breathe__rider">
        <MascotArt who="turtle" pose="float" px={170} label="The turtle floating on its shell" />
      </span>
      <span className="sc-breathe__tide" aria-hidden="true" />
      {reduced && <span className="dk-title sc-breathe__word">{phase === 'in' ? 'Breathe in' : 'Breathe out'}</span>}
    </div>
  );
}

/**
 * Idle (kid home only): every 8–15 s one mascot makes a small move: the rooster blinks (closed
 * at 0.12 s, open at 0.24 s), the dog wags (up 0.16 s, down 0.32 s), the turtle blinks slowly and
 * bobs (closed and down 3 px at 0.6 s, open at 1.2 s). Never two at once, never during a tap,
 * never in focus volume. Reduce Motion: no idle motion.
 */
/** A mascot that idles when it's its turn (each turn replays, even two in a row). */
export function IdleMascot({ who, base = 'idle', px, turn }: { who: Mascot; base?: Pose; px: number; turn: { who: Mascot | null; tick: number } }) {
  const mine = turn.who === who;
  return <IdleMove key={mine ? turn.tick : -1} who={who} base={base} px={px} mine={mine} />;
}

function IdleMove({ who, base, px, mine }: { who: Mascot; base: Pose; px: number; mine: boolean }) {
  const spec = IDLE[who];
  const { beat } = useTimeline(spec.ats, spec.total, { play: mine, reduced: !mine });
  const moving = mine && beat === 1;
  return (
    <span className="sc-idle" data-idle={who} data-moving={moving}>
      <MascotArt who={who} pose={moving ? spec.alt : base} px={px} style={who === 'turtle' && moving ? { transform: 'translateY(3px)' } : undefined} />
    </span>
  );
}

/**
 * A holiday trim's entrance: about 1.2 s in four steps, once a day on the first visit to The
 * Point, then still. Reduce Motion: it simply appears. (Per-trim choreography, bats fluttering
 * and so on, needs the trims drawn in parts; the export has each trim as one drawing, so every
 * trim gets the same stepped drop. REVIEW.md V5.)
 */
export function TrimEntrance({ id, today, reduced, children }: { id: string; today: string; reduced: boolean; children: ReactNode }) {
  const [enter] = useState(() => !reduced && firstTimeToday(`trim.${id}`, today));
  const { beat } = useTimeline([0, 0.3, 0.6, 0.9, 1.2], 1.2, { play: enter, reduced: !enter });
  return (
    <span className="sc-trim" data-entering={enter && beat < 4} style={{ transform: `translateY(${enter ? [-100, -66, -33, -8, 0][beat] : 0}%)` }}>
      {children}
    </span>
  );
}

/**
 * Morning, Session starts and Last Run (wind-down) have behavior but no frames on the canvas
 * yet, so they ship as their Reduce Motion version: the pose still and the line.
 */
export function SceneStill({ kind, name }: { kind: 'morning' | 'session' | 'lastrun'; name: string }) {
  const map = {
    morning: { who: 'rooster', pose: 'hello', line: `Good morning, ${name}!` },
    session: { who: 'rooster', pose: 'board', line: 'Session time!' },
    lastrun: { who: 'turtle', pose: 'calm', line: 'Time to wind down.' },
  } as const;
  const m = map[kind];
  return (
    <div className="sc-still" data-testid={`still-${kind}`}>
      <MascotArt who={m.who} pose={m.pose} px={150} />
      <p className="dk-title">{m.line}</p>
    </div>
  );
}

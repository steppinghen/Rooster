import { useEffect, useRef, type CSSProperties } from 'react';
import { Icon } from '../ui/Icon';
import { PressButton } from '../ui/PressButton';
import { CHUNK_MS, chunksLeft, mmss } from './clock';
import { MascotArt } from './MascotArt';
import { useTimeline } from './useTimeline';


/**
 * The heads-up before a mode change (R3HeadsUp): the rooster pops up from below (0), waves
 * (0.3 s), then shows the timer and says the line (0.8 s). The timer drains one of eight
 * chunks every 15 s on server time; the last chunk pulses from 1:45; at 2:00 the mode hands off
 * (the store does that). Reduce Motion: the heads-up pose, the line and the timer, which keeps
 * counting (it's a clock, not decoration), with no pulse.
 *
 * For a pre-reader the line is spoken by itself at 0.8 s, once per heads-up, if a tap in this
 * page load has unlocked speech (iOS); otherwise the speaker button says it (REVIEW.md X9).
 */
export function HeadsUp({ line, switchAt, now, reduced, autoSpeak, onSpeak, kidColor }: { line: string; switchAt: number; now: number; reduced: boolean; autoSpeak: boolean; onSpeak: () => void; kidColor: string }) {
  const { beat } = useTimeline([0, 0.3, 0.8], 0.8, { reduced });
  const left = switchAt - now;
  const chunks = chunksLeft(left);
  const spoke = useRef<number | null>(null);
  useEffect(() => {
    if (beat === 2 && autoSpeak && spoke.current !== switchAt) {
      spoke.current = switchAt;
      onSpeak();
    }
  }, [beat, autoSpeak, switchAt, onSpeak]);
  const pose = beat === 1 ? 'hello' : 'headsup';
  const pulse = !reduced && left <= CHUNK_MS && left > 0;
  return (
    <aside className="dk-card sc-headsup" role="status" data-testid="heads-up" data-beat={beat} data-audience="kid" style={{ '--kid': kidColor } as CSSProperties}>
      <span className={`sc-headsup__who${beat === 0 && !reduced ? ' sc-headsup__who--rising' : ''}`}>
        <MascotArt who="rooster" pose={pose} px={96} />
      </span>
      <span className="sc-headsup__text">
        <span className="dk-title" data-shown={beat === 2}>
          {line}
        </span>
        <span className="sc-chunks" aria-hidden="true" data-testid="heads-up-chunks" data-left={chunks}>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={`sc-chunk${i < chunks ? ' sc-chunk--on' : ''}${pulse && i === chunks - 1 ? ' sc-chunk--pulse' : ''}`} />
          ))}
        </span>
        <span className="sc-headsup__left" data-testid="heads-up-left" aria-live="off">
          {mmss(left)}
        </span>
      </span>
      <PressButton
        round
        aria-label="Read it to me"
        className="focus-headsup__speak"
        onClick={() => {
          // Heard once is enough: the line isn't spoken again by itself.
          spoke.current = switchAt;
          onSpeak();
        }}
      >
        <Icon name="speaker" size={30} />
      </PressButton>
    </aside>
  );
}

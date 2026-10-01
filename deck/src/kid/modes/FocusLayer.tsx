import { useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Kid } from '../../lib/types';
import { ThemeScope } from '../../theme/ThemeScope';
import { celebrationVolume, effectiveVolume } from '../../theme/volume';
import { Burst } from '../../ui/Burst';
import { Icon } from '../../ui/Icon';
import { PressButton } from '../../ui/PressButton';
import { Sticker } from '../../ui/Sticker';
import { effectiveFocus, MODE_LABEL, MODE_SPOKEN, modeVolume } from '../focus';
import { speak } from '../speech';
import { useKidStore } from '../store';
import { useNow } from '../useNow';
import { useReducedMotion } from '../useReducedMotion';
import './modes.css';

const HEADS_UP_MS = 120_000;
const CELEBRATE_WITHIN_MS = 10 * 60_000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const celebratedKey = (kidId: string, at: number) => `deck.celebrated.${kidId}.${at}`;

function wasCelebrated(kidId: string, at: number): boolean {
  try {
    return !!localStorage.getItem(celebratedKey(kidId, at));
  } catch {
    return false;
  }
}

/**
 * Everything a focus mode adds on top of a kid's screens: the 2-minute heads-up (the rooster
 * with a sand timer, the same words every time), the time left in a timed mode, and the
 * celebration when a timed session ends. None of it blocks Wave Check.
 */
export function FocusLayer({ kid }: { kid: Kid }) {
  const { snapshot } = useKidStore();
  const now = useNow(1000);
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [, rerender] = useState(0);
  const focus = effectiveFocus(snapshot!.focus.find((f) => f.kid_id === kid.id), now);

  const ended = focus.ended && now - focus.ended.at < CELEBRATE_WITHIN_MS ? focus.ended : null;
  if (ended && !wasCelebrated(kid.id, ended.at)) {
    const done = () => {
      try {
        localStorage.setItem(celebratedKey(kid.id, ended.at), '1');
      } catch {
        /* ignore */
      }
      rerender((n) => n + 1);
      if (!pathname.endsWith(kid.id)) nav(`/kid/${kid.id}`);
    };
    // The payoff after a focus mode is loud: normal styling, unless reduced motion is on.
    return (
      <ThemeScope ground="night" volume={celebrationVolume(effectiveVolume(kid.default_volume, modeVolume(focus.mode)), reduced)} className="home__celebrate" role="status" data-testid="session-celebrate">
        {reduced ? <Sticker art="sparkles" size={160} decorative /> : <Burst word="SHRED!" size={360} />}
        <p className="dk-title home__celebrate-text">{MODE_LABEL[ended.mode]} done!</p>
        <PressButton variant="yellow" onClick={done}>
          Back to Grom Zone
        </PressButton>
      </ThemeScope>
    );
  }

  return (
    <>
      {focus.headsUp && (
        <aside className="dk-card focus-headsup" role="status" data-testid="heads-up">
          <span className="focus-headsup__who">
            <Sticker art="rooster" size={72} decorative />
            <span className="focus-headsup__timer" aria-hidden="true">
              <Icon name="timer" size={30} />
            </span>
          </span>
          <span className="focus-headsup__text">
            <span className="dk-title">Two more minutes, then it's {MODE_SPOKEN[focus.headsUp.mode]} time.</span>
            <span className="focus-headsup__bar" aria-hidden="true">
              <span style={{ '--left': Math.max(0, Math.min(1, (focus.headsUp.at - now) / HEADS_UP_MS)) } as CSSProperties} />
            </span>
            <span className="focus-headsup__left" data-testid="heads-up-left">
              {mmss(focus.headsUp.at - now)}
            </span>
          </span>
          <PressButton round aria-label="Read it to me" className="focus-headsup__speak" onClick={() => speak(`Two more minutes, then it's ${MODE_SPOKEN[focus.headsUp!.mode]} time.`)}>
            <Icon name="speaker" size={30} />
          </PressButton>
        </aside>
      )}
      {focus.endsAt && !focus.headsUp && (
        <div className="focus-left" role="timer" data-testid="time-left">
          <Icon name="timer" size={22} /> {MODE_LABEL[focus.mode]} · {mmss(focus.endsAt - now)} left
        </div>
      )}
    </>
  );
}

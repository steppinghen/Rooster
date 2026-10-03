import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Kid } from '../../lib/types';
import { ThemeScope, useTheme } from '../../theme/ThemeScope';
import { celebrationVolume, effectiveVolume } from '../../theme/volume';
import { Icon } from '../../ui/Icon';
import { Celebration } from '../../scenes/Celebration';
import { mmss } from '../../scenes/clock';
import { HeadsUp } from '../../scenes/HeadsUp';
import { nextCelebration } from '../../scenes/timeline';
import { effectiveFocus, MODE_LABEL, MODE_SPOKEN, modeVolume, timeLeft } from '../focus';
import { speak, speechUnlocked } from '../speech';
import { useKidStore } from '../store';
import { useNow } from '../useNow';
import { useReducedMotion } from '../useReducedMotion';
import './modes.css';

const CELEBRATE_WITHIN_MS = 10 * 60_000;

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
  // Celebrations follow the device's ground (only Last Run and Lights out stay night).
  const { ground } = useTheme();
  const focus = effectiveFocus(snapshot!.focus.find((f) => f.kid_id === kid.id), now);

  const screen = pathname.split('/')[3] ?? '';
  const onFeelings = ['wave', 'breathe', 'reset'].includes(screen);
  // Only a timed Session earns the celebration (a timed Lights out just ends quietly), and it
  // waits while the kid is checking in or breathing: feelings are never interrupted.
  const ended = focus.ended && focus.ended.mode === 'session' && now - focus.ended.at < CELEBRATE_WITHIN_MS ? focus.ended : null;
  const celebrating = !!ended && !onFeelings && !wasCelebrated(kid.id, ended.at);
  const showLeft = !!focus.endsAt && !focus.headsUp && focus.mode !== 'lights_out';

  // Reserve room at the bottom of the screen for the banner or chip, so it never covers a
  // tile (Wave Check included).
  const reserve = focus.headsUp ? 'headsup' : showLeft ? 'chip' : '';
  useEffect(() => {
    const el = document.documentElement;
    if (reserve) el.dataset.focusReserve = reserve;
    else delete el.dataset.focusReserve;
    return () => {
      delete el.dataset.focusReserve;
    };
  }, [reserve]);

  if (celebrating && ended) {
    const done = () => {
      try {
        localStorage.setItem(celebratedKey(kid.id, ended.at), '1');
      } catch {
        /* ignore */
      }
      rerender((n) => n + 1);
      if (!pathname.endsWith(kid.id)) nav(`/kid/${kid.id}`);
    };
    // The payoff after a focus mode is loud: normal styling, unless reduced motion is on. It ends
    // by itself after the animation; a tap skips it.
    return (
      <ThemeScope ground={ground} volume={celebrationVolume(effectiveVolume(kid.default_volume, modeVolume(focus.mode)), reduced)} className="home__celebrate" role="status" data-testid="session-celebrate" data-audience="kid" data-age={kid.age_band}>
        <BagCelebration key={ended.at} kidId={kid.id} endedAt={ended.at} title={`${MODE_LABEL[ended.mode]} done!`} reduced={reduced} onDone={done} />
      </ThemeScope>
    );
  }

  const headsUpLine = focus.headsUp ? `Two more minutes, then it's ${MODE_SPOKEN[focus.headsUp.mode]} time.` : '';
  const sayHeadsUp = () => speak(headsUpLine);
  return (
    <>
      {focus.headsUp && (
        <div className="focus-headsup" style={{ '--accent': `var(--${kid.accent})` } as CSSProperties}>
          <HeadsUp
            key={focus.headsUp.at}
            line={headsUpLine}
            switchAt={focus.headsUp.at}
            now={now}
            reduced={reduced}
            autoSpeak={kid.age_band === 'prereader' && speechUnlocked()}
            onSpeak={sayHeadsUp}
            kidColor={`var(--${kid.accent})`}
          />
        </div>
      )}
      {showLeft && focus.endsAt && (
        <div className="focus-left" role="timer" data-testid="time-left" data-audience="kid">
          <Icon name="timer" size={22} /> {MODE_LABEL[focus.mode]} · {mmss(timeLeft(focus, now))} left
        </div>
      )}
    </>
  );
}

/** One celebration from the kid's bag, drawn once per ending (the key). */
function BagCelebration({ kidId, endedAt, title, reduced, onDone }: { kidId: string; endedAt: number; title: string; reduced: boolean; onDone: () => void }) {
  const [kind] = useState(() => nextCelebration(kidId, `session@${endedAt}`));
  return <Celebration kind={kind} title={title} reduced={reduced} onDone={onDone} holdAfter={2.5} />;
}

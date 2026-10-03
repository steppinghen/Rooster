import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Kid, Routine } from '../lib/types';
import { Celebration } from '../scenes/Celebration';
import { MascotArt } from '../scenes/MascotArt';
import { nextCelebration } from '../scenes/timeline';
import { ThemeScope, useTheme } from '../theme/ThemeScope';
import { celebrationVolume, type Volume } from '../theme/volume';
import { Icon } from '../ui/Icon';
import { PressButton } from '../ui/PressButton';

/**
 * A finished routine's payoff. Normally one celebration from the kid's bag (one per routine per
 * day), at normal volume unless Reduce Motion, on the device's ground. The end of Last Run is
 * the quiet version instead: night, focus volume, no burst, no shout word, "All done." with the
 * small calm turtle; a tap skips it, and Wave Check and Breathe stay right there (feelings are
 * never blocked). The face-down sticker of the quiet reveal arrives with stickers (slice 8).
 */
export function RoutineCelebration({ kid, routine, today, effective, reduced, onDone }: { kid: Kid; routine: Routine; today: string; effective: Volume; reduced: boolean; onDone: () => void }) {
  const quiet = routine.slot === 'bedtime';
  return quiet ? <QuietDone kid={kid} onDone={onDone} /> : <LoudDone kid={kid} routine={routine} today={today} effective={effective} reduced={reduced} onDone={onDone} />;
}

function LoudDone({ kid, routine, today, effective, reduced, onDone }: { kid: Kid; routine: Routine; today: string; effective: Volume; reduced: boolean; onDone: () => void }) {
  const { ground } = useTheme();
  const [kind] = useState(() => nextCelebration(kid.id, `routine@${routine.id}@${today}`));
  return (
    <ThemeScope ground={ground} volume={celebrationVolume(effective, reduced)} className="home__celebrate" role="status" data-audience="kid" data-age={kid.age_band}>
      <Celebration kind={kind} title={`${routine.name} done!`} reduced={reduced} onDone={onDone} />
    </ThemeScope>
  );
}

function QuietDone({ kid, onDone }: { kid: Kid; onDone: () => void }) {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <ThemeScope ground="night" volume="focus" scene="lastrun" className="home__celebrate" role="status" data-testid="quiet-done" data-audience="kid" data-age={kid.age_band}>
      <button type="button" className="quiet-done__skip" onClick={onDone} aria-label="All done. Tap to keep going.">
        <MascotArt who="turtle" pose="calm" px={120} />
        <span className="dk-title home__celebrate-text">All done.</span>
      </button>
      <span className="quiet-done__feelings">
        <PressButton onClick={() => nav(`/kid/${kid.id}/wave`)}>
          <Icon name="waves" size={30} /> Wave Check
        </PressButton>
        <PressButton onClick={() => nav(`/kid/${kid.id}/breathe`)}>
          <Icon name="breathe" size={30} /> Breathe
        </PressButton>
      </span>
    </ThemeScope>
  );
}

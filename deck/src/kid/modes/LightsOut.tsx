import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isWinter } from '../../art/mascots';
import type { Kid } from '../../lib/types';
import { useFamilySettings } from '../../scenes/SceneContext';
import { LightsOutScene } from '../../scenes/LightsOutScene';
import { RootTheme } from '../../theme/ThemeScope';
import { Icon } from '../../ui/Icon';
import { PressButton } from '../../ui/PressButton';
import { effectiveFocus } from '../focus';
import { useKidStore } from '../store';
import { useReducedMotion } from '../useReducedMotion';
import './modes.css';

/** True the first time this Lights out (identified by when it began) is shown on this iPad. */
function firstShowing(kidId: string, since: number): boolean {
  const key = `deck.lightsout.${kidId}`;
  try {
    if (localStorage.getItem(key) === String(since)) return false;
    localStorage.setItem(key, String(since));
  } catch {
    /* without storage it plays each time */
  }
  return true;
}

/**
 * Lights out: a calm "Time for bed" screen and nothing else. The turtle yawns and tucks into its
 * shell, the rooster roosts, and the stars come on (snow in winter); it plays once per Lights
 * out and then holds, so a reload shows the still. The only control opens the breathing wave,
 * and it is there from the start (feelings are never locked out). No sounds.
 */
export function LightsOut({ kid }: { kid: Kid }) {
  const nav = useNavigate();
  const reduced = useReducedMotion();
  const settings = useFamilySettings();
  const { snapshot } = useKidStore();
  const [mountedAt] = useState(() => Date.now());
  const since = effectiveFocus(snapshot!.focus.find((f) => f.kid_id === kid.id), mountedAt).since;
  const [play] = useState(() => firstShowing(kid.id, since));
  return (
    <RootTheme ground="night" volume="focus" scene="lastrun">
      <main className="kid lightsout" data-audience="kid" data-age={kid.age_band} data-testid="lights-out">
        <LightsOutScene winter={isWinter(new Date(), settings)} reduced={reduced} play={play} />
        <p className="dk-title lightsout__text">Time for bed, {kid.nickname}.</p>
        <PressButton className="lightsout__breathe" onClick={() => nav(`/kid/${kid.id}/breathe`)}>
          <Icon name="breathe" size={36} /> I need to breathe
        </PressButton>
      </main>
    </RootTheme>
  );
}

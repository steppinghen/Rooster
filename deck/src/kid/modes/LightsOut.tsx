import { useNavigate } from 'react-router-dom';
import type { Kid } from '../../lib/types';
import { RootTheme } from '../../theme/ThemeScope';
import { Icon } from '../../ui/Icon';
import { PressButton } from '../../ui/PressButton';
import { Sticker } from '../../ui/Sticker';
import './modes.css';

/**
 * Lights out: a calm "Time for bed" screen and nothing else. The turtle is tucked in under the
 * stars. The only control opens balloon breathing. No sounds.
 */
export function LightsOut({ kid }: { kid: Kid }) {
  const nav = useNavigate();
  return (
    <RootTheme ground="night" volume="focus" scene="lastrun">
      <main className="kid lightsout" data-audience="kid" data-age={kid.age_band} data-testid="lights-out">
        <div className="lightsout__sky" aria-hidden="true" />
        <div className="lightsout__scene">
          <Sticker art="moon" size={120} decorative />
          <Sticker art="turtle" size={150} alt="The turtle, tucked in its shell" />
        </div>
        <p className="dk-title lightsout__text">Time for bed, {kid.nickname}.</p>
        <PressButton className="lightsout__breathe" onClick={() => nav(`/kid/${kid.id}/breathe`)}>
          <Icon name="breathe" size={36} /> I need to breathe
        </PressButton>
      </main>
    </RootTheme>
  );
}

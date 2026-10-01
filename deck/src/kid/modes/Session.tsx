import type { Kid } from '../../lib/types';
import { Sticker } from '../../ui/Sticker';
import { TaskCard } from '../../ui/surfaces';
import { KidFrame } from '../KidFrame';
import { KidTheme } from '../KidTheme';
import './modes.css';

/** Phase 1 placeholder for Session (learning content arrives in Phase 2). */
export function Session({ kid }: { kid: Kid }) {
  return (
    <KidTheme kid={kid}>
      <KidFrame kid={kid} title="Session">
        <TaskCard className="session-card" data-testid="session-placeholder">
          <Sticker art="rooster" size={160} decorative />
          <p className="dk-title session-card__title">Learning games are on the way!</p>
          <p className="dk-muted session-card__sub">{kid.age_band === 'prereader' ? 'Tracing and counting' : 'Reading missions'} land here soon.</p>
        </TaskCard>
      </KidFrame>
    </KidTheme>
  );
}

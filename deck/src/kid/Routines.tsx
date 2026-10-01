import { useNavigate } from 'react-router-dom';
import { isArtKey } from '../art/art';
import type { Kid } from '../lib/types';
import { Sticker } from '../ui/Sticker';
import { familyDate } from './cache';
import { KidFrame } from './KidFrame';
import { KidTheme } from './KidTheme';
import { doneCount, formatTime, routinesForKid } from './routine';
import { speak } from './speech';
import { useKidStore } from './store';
import { useNow } from './useNow';
import './routines.css';

/** Today's routines for this kid, in time order. One tap opens one. */
export function Routines({ kid }: { kid: Kid }) {
  const { snapshot } = useKidStore();
  const nav = useNavigate();
  const now = useNow(60_000);
  const today = familyDate(snapshot!.family.timezone, new Date(now));
  const mine = routinesForKid(snapshot!.routines, kid.id);
  return (
    <KidTheme kid={kid}>
      <KidFrame kid={kid} title="Routines">
        <div className="rt-list">
          {mine.map((r) => {
            const done = snapshot!.completions.find((c) => c.routine_id === r.id && c.kid_id === kid.id && c.on_date === today)?.completed_steps ?? [];
            const n = doneCount(r, done);
            const icon = r.steps[0]?.icon;
            return (
              <button
                key={r.id}
                type="button"
                className="dk-tile rt-item"
                data-testid="routine-tile"
                onClick={() => {
                  speak(r.name);
                  nav(`/kid/${kid.id}/routine/${r.id}`);
                }}
              >
                {icon && isArtKey(icon) && <Sticker art={icon} size={kid.age_band === 'prereader' ? 96 : 72} decorative />}
                <span className="rt-item__name">{r.name}</span>
                <span className="dk-tile__status">
                  {formatTime(r.starts_at)} · {n === r.steps.length ? 'All done!' : `${n} of ${r.steps.length}`}
                </span>
              </button>
            );
          })}
          {mine.length === 0 && <p className="kid__note">No routines yet. A grown-up can add them in Back Office.</p>}
        </div>
      </KidFrame>
    </KidTheme>
  );
}

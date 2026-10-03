import type { CSSProperties } from 'react';
import { deckDesign } from '../art/decks';
import { wholeArt } from '../art/original';
import { kidVisibleModules } from '../lib/moduleRules';
import { accentVar, type Kid } from '../lib/types';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useFamilySettings } from '../scenes/SceneContext';
import { DeckBoard } from '../ui/DeckBoard';
import { InkDock } from '../ui/InkDock';
import { KidHeader } from '../ui/KidHeader';
import { familyDate } from './cache';
import { effectiveFocus } from './focus';
import { kidDock } from './kidDock';
import { KidTheme } from './KidTheme';
import { season, weekDeck } from './point';
import { useKidStore } from './store';
import { useLogUsage } from './usage';
import { useNow } from './useNow';
import { useCheckinMoment } from './useCheckinMoment';
import './point.css';

/**
 * My week, first cut: this week's deck at full size with its stickers at their saved spots, and
 * the full dock with My week lit. Slice 8 builds the rest (the frame, My stickers, old decks).
 */
export function MyWeek({ kid }: { kid: Kid }) {
  const { snapshot } = useKidStore();
  const log = useLogUsage(kid.id);
  const now = useNow(60_000);
  const settings = useFamilySettings();
  const landscape = useMediaQuery('(orientation: landscape)');
  const s = snapshot!;
  const at = new Date(now);
  const today = familyDate(s.family.timezone, at);
  const focus = effectiveFocus(s.focus.find((f) => f.kid_id === kid.id), now);
  const visible = new Set(kidVisibleModules(s.modules, focus.mode).map((m) => m.key));
  const week = weekDeck(s.decks ?? [], s.awards ?? [], kid.id, today);
  const { moment } = useCheckinMoment(kid.id, now);
  const n = week.stickers.length;
  const sun = wholeArt('seasons', `sun.${season(at, settings)}`);
  return (
    <KidTheme kid={kid}>
      <main className={`dk-kidscreen pt-weekscreen${landscape ? ' dk-kidscreen--landscape' : ''}`} data-audience="kid" data-age={kid.age_band} data-testid="my-week" style={{ '--accent': accentVar(kid.accent), '--kid': accentVar(kid.accent) } as CSSProperties}>
        <KidHeader greeting={`${kid.nickname}’s week`} title="My week" kid={kid} corner={sun ? <img src={sun} alt="" draggable={false} /> : undefined} />
        <div className="dk-kidscreen__body pt-weekscreen__body">
          <p className="pt-weekscreen__sub">
            {n === 0 ? 'New deck' : `${n} ${n === 1 ? 'sticker' : 'stickers'}`} · {deckDesign(week.deck?.design_key).name}
          </p>
          <div className="pt-weekscreen__deck">
            <DeckBoard design={week.deck?.design_key} stickers={week.stickers} />
          </div>
          {n === 0 && <p className="pt-weekscreen__note">Finish a routine to earn your first sticker!</p>}
        </div>
        <InkDock items={kidDock(kid, focus.mode, visible, moment ? { kind: 'checkin', text: 'Check in' } : undefined)} active="my_week" onNavigate={(k) => log(k, 'opened')} />
      </main>
    </KidTheme>
  );
}

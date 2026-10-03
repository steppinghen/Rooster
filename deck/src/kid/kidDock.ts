import type { FocusMode, Kid } from '../lib/types';
import type { DockItem, DockTag } from '../ui/InkDock';

// What a kid's dock holds (docs/kid-screens.md "The dock holds places"): Home, My week and Wave
// Check always (Wave Check can never be removed), then the parent's picks for this kid (up to
// three for readers, one for pre-readers, checked by the database), each only while its module
// is visible. Focus modes trim it to what the mode allows: Session mode is Home, Session, Wave
// Check. Never a "More" menu.
const PICKS: Record<string, Omit<DockItem, 'to'> & { path: string }> = {
  session: { key: 'session', label: 'Session', icon: 'bookClosed', path: 'session' },
};

export function kidDock(kid: Kid, mode: FocusMode, visible: Set<string>, checkin?: DockTag): DockItem[] {
  const base = `/kid/${kid.id}`;
  const home: DockItem = { key: 'home', label: 'Home', icon: 'home', to: base };
  const wave: DockItem = { key: 'wave_check', label: 'Wave Check', icon: 'wave', to: `${base}/wave`, tag: checkin };
  const pick = (k: string): DockItem | null => {
    const p = PICKS[k];
    return p && visible.has(k) ? { key: p.key, label: p.label, icon: p.icon, to: `${base}/${p.path}` } : null;
  };
  if (mode === 'session') return [home, pick('session'), wave].filter((i): i is DockItem => !!i);
  const week: DockItem = { key: 'my_week', label: 'My week', icon: 'skate', to: `${base}/week` };
  return [home, week, wave, ...kid.dock_picks.map(pick).filter((i): i is DockItem => !!i)];
}

import type { DeckEvent, KidsDefault, KidVisibility } from './types';

// Events with their calendar's kid default, so screens can tell who sees what. The rule is the
// database's (private.event_kid_visible); devices only ever receive events it lets through.
export const EVENT_SELECT =
  'id, family_id, calendar_id, title, icon, on_date, kind, kid_visibility, countdown, repeats_yearly, kid_title, kid_icon, calendars(kids_default, builtin_key)';

type Cal = { kids_default: KidsDefault; builtin_key: string | null };
type EventRow = Omit<DeckEvent, 'kids_see' | 'builtin_key'> & { calendars?: Cal | Cal[] | null };

export function kidsSee(cal: Cal | null, vis: KidVisibility): boolean {
  if (!cal) return false;
  if (cal.builtin_key === 'holidays') return true;
  if (cal.kids_default === 'never') return false;
  if (vis === 'shown') return true;
  if (vis === 'hidden') return false;
  return cal.kids_default === 'shown';
}

export function toEvent(row: EventRow): DeckEvent {
  const { calendars, ...rest } = row;
  const cal = Array.isArray(calendars) ? (calendars[0] ?? null) : (calendars ?? null);
  return { ...rest, kids_see: kidsSee(cal, row.kid_visibility), builtin_key: cal?.builtin_key ?? null };
}

// Row shapes the app reads. Kept narrow: only the columns the API roles are granted.
export type Accent = 'magenta' | 'cyan' | 'yellow' | 'lime' | 'lilac' | 'orange';
export type AgeBand = 'prereader' | 'reader';
export type Volume = 'normal' | 'focus';
export type FocusMode = 'everything' | 'session' | 'lights_out';
export type RoutineSlot = 'morning' | 'after_school' | 'bedtime' | 'other';
export type Feeling = 'pumping' | 'rolling' | 'flat' | 'choppy';
export type EventKind = 'birthday' | 'holiday' | 'school' | 'trip' | 'other';
export type KidVisibility = 'inherit' | 'shown' | 'hidden';
export type KidsDefault = 'shown' | 'hidden' | 'never';

export const KID_COLUMNS = 'id, family_id, nickname, avatar, accent, age_band, default_volume, has_pin, birthday_month, birthday_day, sort_order, created_at, can_change_look, dock_picks';

export type Kid = {
  id: string;
  family_id: string;
  nickname: string;
  avatar: string;
  accent: Accent;
  age_band: AgeBand;
  default_volume: Volume;
  has_pin: boolean;
  birthday_month: number | null;
  birthday_day: number | null;
  sort_order: number;
  created_at: string;
  can_change_look: boolean;
  dock_picks: string[];
};

/** kind defaults to "task"; who defaults to "all" (everyone on the routine). */
export type RoutineStep = { id: string; text: string; icon: string; kind?: 'task' | 'wave_check'; who?: 'all' | string[] };

export type Routine = {
  id: string;
  family_id: string;
  /** The kids it serves; empty means everyone (routine_kids). */
  kid_ids: string[];
  slot: RoutineSlot;
  name: string;
  starts_at: string; // HH:MM:SS
  steps: RoutineStep[];
  sort_order: number;
  days: number[]; // ISO weekdays, 1 = Monday
  finish_by: string | null;
  finish_label: 'bus' | 'car' | null;
  earns_sticker: boolean;
};

export type DeckEvent = {
  id: string;
  family_id: string;
  calendar_id: string;
  title: string;
  icon: string;
  on_date: string; // YYYY-MM-DD
  kind: EventKind;
  kid_visibility: KidVisibility;
  /** Computed: kids can see it (the database's rule, see src/lib/events.ts). */
  kids_see: boolean;
  countdown: boolean;
  repeats_yearly: boolean;
  kid_title: string | null;
  kid_icon: string | null;
  /** The calendar it came from: 'deck' for events typed into The Deck. */
  builtin_key: string | null;
};

export type KidFocus = {
  kid_id: string;
  family_id: string;
  mode: FocusMode;
  since: string;
  ends_at: string | null;
  return_mode: FocusMode | null;
  pending_mode: FocusMode | null;
  switch_at: string | null;
  pending_ends_at: string | null;
  pending_return_mode?: FocusMode | null;
  pinned: unknown[];
  updated_at: string;
};

export type ModuleCatalogRow = {
  key: string;
  label: string;
  icon: string;
  audience: 'kid' | 'parent' | 'both';
  removable: boolean;
  default_enabled: boolean;
  visible_in: FocusMode[];
  sort_order: number;
};

export type FamilyModule = { family_id: string; module_key: string; enabled: boolean; settings: Record<string, unknown> };

export const ACCENTS: Accent[] = ['magenta', 'cyan', 'yellow', 'lime', 'lilac', 'orange'];

export function accentVar(a: Accent): string {
  return `var(--${a})`;
}

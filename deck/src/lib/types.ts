// Row shapes the app reads. Kept narrow: only the columns the API roles are granted.
export type Accent = 'magenta' | 'cyan' | 'yellow' | 'lime' | 'lilac' | 'orange';
export type AgeBand = 'prereader' | 'reader';
export type Volume = 'normal' | 'focus';
export type FocusMode = 'everything' | 'session' | 'lights_out';
export type RoutineSlot = 'morning' | 'after_school' | 'bedtime';
export type Feeling = 'pumping' | 'rolling' | 'flat' | 'choppy';
export type EventKind = 'birthday' | 'holiday' | 'trip' | 'other';

export const KID_COLUMNS = 'id, family_id, nickname, avatar, accent, age_band, default_volume, has_pin, birthday_month, birthday_day, sort_order, created_at';

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
};

export type RoutineStep = { id: string; text: string; icon: string };

export type Routine = {
  id: string;
  family_id: string;
  kid_id: string | null;
  slot: RoutineSlot;
  name: string;
  starts_at: string; // HH:MM:SS
  steps: RoutineStep[];
  sort_order: number;
};

export type DeckEvent = {
  id: string;
  family_id: string;
  title: string;
  icon: string;
  on_date: string; // YYYY-MM-DD
  kind: EventKind;
  visible_to_kids: boolean;
  repeats_yearly: boolean;
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

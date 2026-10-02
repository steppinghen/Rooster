import type { Routine } from './types';

// Routines with the kids they serve (routine_kids). No kids listed means everyone.
export const ROUTINE_SELECT = 'id, family_id, slot, name, starts_at, steps, sort_order, days, finish_by, finish_label, earns_sticker, routine_kids(kid_id)';

type RoutineRow = Omit<Routine, 'kid_ids'> & { routine_kids?: { kid_id: string }[] | null };

export function toRoutine(row: RoutineRow): Routine {
  const { routine_kids, ...rest } = row;
  return { ...rest, kid_ids: (routine_kids ?? []).map((k) => k.kid_id) };
}

export function servesKid(r: Pick<Routine, 'kid_ids'>, kidId: string): boolean {
  return r.kid_ids.length === 0 || r.kid_ids.includes(kidId);
}

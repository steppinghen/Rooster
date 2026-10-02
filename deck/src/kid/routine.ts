import type { Routine, RoutineStep } from '../lib/types';
import type { Completion } from './store';
import { servesKid } from '../lib/routines';

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Routines that apply to this kid (their own plus "everyone"), in time order. */
export function routinesForKid(routines: Routine[], kidId: string): Routine[] {
  return routines.filter((r) => servesKid(r, kidId)).sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at) || a.sort_order - b.sort_order);
}

export type RoutineNow =
  | { kind: 'active'; routine: Routine; done: string[]; next: RoutineStep }
  | { kind: 'finished'; routine: Routine; upcoming: Routine | null } // the current routine is all done
  | { kind: 'waiting'; upcoming: Routine } // nothing has started yet today
  | { kind: 'none' };

/**
 * What's next for this kid right now: the routine whose start time has most recently passed
 * today, and its first step not done yet. Before the first routine of the day, the next one is
 * shown as upcoming; with no routines, nothing.
 */
export function routineNow(routines: Routine[], completions: Completion[], kidId: string, today: string, nowMinutes: number): RoutineNow {
  const mine = routinesForKid(routines, kidId);
  if (!mine.length) return { kind: 'none' };
  const started = mine.filter((r) => minutes(r.starts_at) <= nowMinutes);
  const upcoming = mine.find((r) => minutes(r.starts_at) > nowMinutes) ?? null;
  const current = started[started.length - 1];
  if (!current) return { kind: 'waiting', upcoming: upcoming! };
  const done = completions.find((c) => c.routine_id === current.id && c.kid_id === kidId && c.on_date === today)?.completed_steps ?? [];
  const next = current.steps.find((s) => !done.includes(s.id));
  if (!next) return { kind: 'finished', routine: current, upcoming };
  return { kind: 'active', routine: current, done, next };
}

/** Steps done in order, for the progress dots. */
export function doneCount(routine: Routine, done: string[]): number {
  return routine.steps.filter((s) => done.includes(s.id)).length;
}

export function formatTime(hhmm: string): string {
  const m = minutes(hhmm);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

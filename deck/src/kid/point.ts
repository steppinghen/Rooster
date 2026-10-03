import { isWinter } from '../art/mascots';
import type { FamilySettings } from '../lib/familySettings';
import { servesKid } from '../lib/routines';
import type { Routine } from '../lib/types';
import type { Completion, CurrentCheckin } from './store';

// The Point (layout B2): what goes in each slot, worked out from the cached snapshot. Pure, so
// the rules are unit-tested (point.test.ts) and the screen only draws.

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** ISO weekday of a family-local date (1 = Monday … 7 = Sunday). */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The Monday that starts the week of a family-local date (decks run Monday to Sunday). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (isoWeekday(date) - 1));
  return d.toISOString().slice(0, 10);
}

/** This kid's routines that run today (their weekdays), in time order. */
export function todaysRoutines(routines: Routine[], kidId: string, today: string): Routine[] {
  const wd = isoWeekday(today);
  return routines
    .filter((r) => servesKid(r, kidId) && (r.days?.length ? r.days.includes(wd) : true))
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at) || a.sort_order - b.sort_order);
}

export function greeting(minutes: number): string {
  if (minutes < 12 * 60) return 'Morning';
  if (minutes < 17 * 60) return 'Afternoon';
  return 'Evening';
}

// ---------- Check-in moments ----------

export type CheckinMoment = { id: string; kid_id: string; label: string; at_time: string | null; anchor_routine_id: string | null; sort_order: number };

/**
 * The check-in moment open for this kid right now, or null. A moment starts at its time, or
 * when its anchor routine is finished today. The latest moment that has started is open until a
 * check-in lands after it starts, or the kid taps "Not now" (`dismissed`, "<date>@<moment id>").
 * Ignored, it rests until the next moment and never escalates. `startedAt` is in minutes.
 */
export function openMoment(
  moments: CheckinMoment[],
  kidId: string,
  o: { today: string; nowMinutes: number; completions: Completion[]; checkin: CurrentCheckin | undefined; checkinMinutes: number | null; doneMinutes: (completedAt: string) => number; dismissed: string | null },
): (CheckinMoment & { startedAt: number }) | null {
  const started = moments
    .filter((m) => m.kid_id === kidId)
    .map((m) => {
      if (m.at_time) return { m, at: toMinutes(m.at_time) };
      const c = o.completions.find((x) => x.routine_id === m.anchor_routine_id && x.kid_id === kidId && x.on_date === o.today && x.completed_at);
      // A finished anchor has started its moment, whatever a skewed device clock says.
      return { m, at: c ? Math.min(o.doneMinutes(c.completed_at!), o.nowMinutes) : null };
    })
    .filter((x): x is { m: CheckinMoment; at: number } => x.at !== null && x.at <= o.nowMinutes)
    .sort((a, b) => a.at - b.at || a.m.sort_order - b.m.sort_order);
  const last = started[started.length - 1];
  if (!last) return null;
  if (o.dismissed === `${o.today}@${last.m.id}`) return null;
  if (o.checkin && o.checkinMinutes !== null && o.checkinMinutes >= last.at) return null;
  return { ...last.m, startedAt: last.at };
}

// ---------- Today's stickers ----------

export type Award = { id: string; kid_id: string; kid_deck_id: string; source_kind: string; source_id: string; award_date: string; sticker_key: string | null; x: number | null; y: number | null; size: number | null; tilt: number | null; placed_at: string | null };

export type StickerSlot =
  | { kind: 'earned'; routine: Routine; sticker: string }
  | { kind: 'pick'; routine: Routine } // earned, the pick is waiting (slice 8)
  | { kind: 'done'; routine: Routine } // finished, no sticker (the four-a-day cap): nothing reads as missed
  | { kind: 'next'; routine: Routine; stepsLeft: number | null } // the mystery "?" slot
  | { kind: 'later'; routine: Routine };

/**
 * One slot per sticker routine today, in time order (at most four: the daily cap). The "?" goes
 * on the routine running now, or else the next one to start; every other unearned slot shows its
 * time. A routine that was skipped earlier shows the same as a later one: never a miss.
 */
export function stickerSlots(routines: Routine[], completions: Completion[], awards: Award[], kidId: string, today: string, nowMinutes: number): StickerSlot[] {
  const mine = todaysRoutines(routines, kidId, today).filter((r) => r.earns_sticker).slice(0, 4);
  const doneSteps = (r: Routine) => completions.find((c) => c.routine_id === r.id && c.kid_id === kidId && c.on_date === today)?.completed_steps ?? [];
  const finished = (r: Routine) => r.steps.length > 0 && r.steps.every((s) => doneSteps(r).includes(s.id));
  const award = (r: Routine) => awards.find((a) => a.kid_id === kidId && a.source_kind === 'routine' && a.source_id === r.id && a.award_date === today);
  const started = mine.filter((r) => toMinutes(r.starts_at) <= nowMinutes);
  const current = started[started.length - 1];
  const target = current && !finished(current) && !award(current) ? current : mine.find((r) => toMinutes(r.starts_at) > nowMinutes && !finished(r) && !award(r));
  return mine.map((r): StickerSlot => {
    const a = award(r);
    if (a?.sticker_key) return { kind: 'earned', routine: r, sticker: a.sticker_key };
    if (a) return { kind: 'pick', routine: r };
    if (finished(r)) return { kind: 'done', routine: r };
    if (r === target) {
      const left = r.steps.length - r.steps.filter((s) => doneSteps(r).includes(s.id)).length;
      return { kind: 'next', routine: r, stepsLeft: toMinutes(r.starts_at) <= nowMinutes ? left : null };
    }
    return { kind: 'later', routine: r };
  });
}

// ---------- My week ----------

export type KidDeck = { id: string; kid_id: string; week_start: string; design_key: string; colorway: number; world: string; holiday_key: string | null };
export type PlacedSticker = { id: string; key: string; x: number; y: number; size: number; tilt: number };

/** This week's deck and the stickers placed on it (saved spot, size and tilt). */
export function weekDeck(decks: KidDeck[], awards: Award[], kidId: string, today: string): { deck: KidDeck | null; stickers: PlacedSticker[] } {
  const ws = weekStart(today);
  const deck = decks.find((d) => d.kid_id === kidId && d.week_start === ws) ?? null;
  if (!deck) return { deck, stickers: [] };
  const stickers = awards
    .filter((a) => a.kid_deck_id === deck.id && a.placed_at && a.sticker_key && a.x !== null && a.y !== null)
    .sort((a, b) => (a.placed_at! < b.placed_at! ? -1 : 1))
    .map((a) => ({ id: a.id, key: a.sticker_key!, x: a.x!, y: a.y!, size: a.size ?? 90, tilt: a.tilt ?? 0 }));
  return { deck, stickers };
}

// ---------- Finish-by chip ----------

/** "BUS IN 18 min" while a finish-by time is coming up (within 90 minutes); null otherwise. */
export function finishChip(r: Routine, nowMinutes: number): { label: string; value: string } | null {
  if (!r.finish_by) return null;
  const left = toMinutes(r.finish_by) - nowMinutes;
  if (left <= 0 || left > 90) return null;
  const label = r.finish_label === 'bus' ? 'BUS IN' : r.finish_label === 'car' ? 'CAR IN' : 'DONE IN';
  return { label, value: `${left} min` };
}

// ---------- Season ----------

export type Season = 'spring-summer' | 'fall' | 'winter';

/** The seasonal sun: winter by the family's winter dates, fall September to November. */
export function season(date: Date, settings?: FamilySettings | null): Season {
  if (isWinter(date, settings)) return 'winter';
  const m = date.getMonth();
  return m >= 8 && m <= 10 ? 'fall' : 'spring-summer';
}

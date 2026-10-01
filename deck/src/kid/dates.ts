import type { DeckEvent, Kid } from '../lib/types';

export type Countdown = { key: string; title: string; icon: string; date: string; sleeps: number; kind: DeckEvent['kind']; kidId?: string };

const DAY = 86_400_000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const pad = (n: number) => String(n).padStart(2, '0');

/** Whole nights between today and the date ("sleeps"). 0 means today. */
export function sleepsBetween(today: string, date: string): number {
  return Math.round((utc(date) - utc(today)) / DAY);
}

/** The next time month/day comes round, on or after today. Feb 29 falls back to Feb 28 off leap years. */
export function nextOccurrence(today: string, month: number, day: number): string {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const d = month === 2 && day === 29 && !leap ? 28 : day;
    const iso = `${y}-${pad(month)}-${pad(d)}`;
    if (iso >= today) return iso;
  }
  return `${year + 1}-${pad(month)}-${pad(day)}`;
}

/**
 * Upcoming countdowns for kids: kid-visible events (yearly ones roll forward) plus each kid's
 * birthday. Soonest first; past one-off events drop off.
 */
export function upcomingCountdowns(events: DeckEvent[], kids: Kid[], today: string): Countdown[] {
  const out: Countdown[] = [];
  for (const e of events) {
    if (!e.visible_to_kids) continue;
    const date = e.repeats_yearly ? nextOccurrence(today, Number(e.on_date.slice(5, 7)), Number(e.on_date.slice(8, 10))) : e.on_date;
    if (date < today) continue;
    out.push({ key: e.id, title: e.title, icon: e.icon, date, sleeps: sleepsBetween(today, date), kind: e.kind });
  }
  for (const k of kids) {
    if (!k.birthday_month || !k.birthday_day) continue;
    const date = nextOccurrence(today, k.birthday_month, k.birthday_day);
    out.push({ key: `bday-${k.id}`, title: `${k.nickname}'s birthday`, icon: 'cake', date, sleeps: sleepsBetween(today, date), kind: 'birthday', kidId: k.id });
  }
  return out.sort((a, b) => a.sleeps - b.sleeps || a.title.localeCompare(b.title));
}

export function sleepsLabel(n: number): string {
  if (n <= 0) return 'Today!';
  if (n === 1) return '1 sleep';
  return `${n} sleeps`;
}

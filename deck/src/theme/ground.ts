import type { Ground } from './volume';

export type GroundSetting = 'auto' | 'day' | 'night' | 'device';

const DEFAULT_DAY_START = '06:30';
const DEFAULT_NIGHT_START = '19:30';

/** Minutes since midnight of `at` in `timezone`. */
export function localMinutes(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * The device's ground (CLAUDE.md "When the app switches"). Auto: day from the start of Dawn
 * Patrol (the earliest morning routine) until Last Run begins (the earliest bedtime routine),
 * night otherwise. Last Run and Lights out force night separately (data-scene).
 */
export function resolveGround(
  setting: GroundSetting,
  ctx: { timezone: string; at: Date; morningStarts: string[]; bedtimeStarts: string[]; prefersLight: boolean },
): Ground {
  if (setting === 'day' || setting === 'night') return setting;
  if (setting === 'device') return ctx.prefersLight ? 'day' : 'night';
  const dayStart = toMinutes([...ctx.morningStarts].sort()[0] ?? DEFAULT_DAY_START);
  const nightStart = toMinutes([...ctx.bedtimeStarts].sort()[0] ?? DEFAULT_NIGHT_START);
  const now = localMinutes(ctx.timezone, ctx.at);
  return now >= dayStart && now < nightStart ? 'day' : 'night';
}

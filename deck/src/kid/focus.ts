import type { FocusMode, KidFocus, Volume } from '../lib/types';

export type EffectiveFocus = {
  mode: FocusMode;
  /** When the current mode ends on its own (timed sessions), in ms. */
  endsAt: number | null;
  /** A pending switch that hasn't happened yet: show the 2-minute heads-up. */
  headsUp: { mode: FocusMode; at: number } | null;
  /** A timed mode that finished (e.g. a 20-minute Session): time to celebrate. */
  ended: { mode: FocusMode; at: number } | null;
};

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/**
 * The mode a kid is in right now, computed from the stored row and server time. Everything is
 * derived from timestamps in the database, so reloading or reopening can't escape a mode, and
 * a device that is offline keeps applying the last row it received (fail closed).
 */
export function effectiveFocus(row: KidFocus | undefined, now: number): EffectiveFocus {
  if (!row) return { mode: 'everything', endsAt: null, headsUp: null, ended: null };
  let mode = row.mode;
  let endsAt = ms(row.ends_at);
  let returnMode = row.return_mode;
  const switchAt = ms(row.switch_at);

  if (row.pending_mode && switchAt !== null) {
    if (switchAt <= now) {
      // The heads-up ran out: the pending mode is live. Whatever it replaced is where it returns to.
      returnMode = row.return_mode ?? mode;
      mode = row.pending_mode;
      endsAt = ms(row.pending_ends_at);
    } else {
      return { mode, endsAt: endsAt && endsAt > now ? endsAt : null, headsUp: { mode: row.pending_mode, at: switchAt }, ended: null };
    }
  }

  if (endsAt !== null && endsAt <= now) {
    return { mode: returnMode ?? 'everything', endsAt: null, headsUp: null, ended: { mode, at: endsAt } };
  }
  return { mode, endsAt, headsUp: null, ended: null };
}

/** Focus modes switch the app to focus styling; Everything is normal. */
export function modeVolume(mode: FocusMode): Volume {
  return mode === 'everything' ? 'normal' : 'focus';
}

export const MODE_LABEL: Record<FocusMode, string> = {
  everything: 'Everything',
  session: 'Session',
  lights_out: 'Lights out',
};

/** The words the rooster says in the heads-up: the same pattern for every mode. */
export const MODE_SPOKEN: Record<FocusMode, string> = {
  everything: 'free',
  session: 'learning',
  lights_out: 'lights out',
};

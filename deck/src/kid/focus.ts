import type { FocusMode, KidFocus, Volume } from '../lib/types';

export type EffectiveFocus = {
  mode: FocusMode;
  /** When the current mode started (ms). */
  since: number;
  /** When the current mode ends on its own (timed sessions), in ms. */
  endsAt: number | null;
  /** A pending switch that hasn't happened yet: show the 2-minute heads-up. */
  headsUp: { mode: FocusMode; at: number } | null;
  /** A timed mode that finished (e.g. a 20-minute Session): time to celebrate. */
  ended: { mode: FocusMode; at: number; from: number } | null;
};

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/**
 * The mode a kid is in right now, computed from the stored row and server time. Everything is
 * derived from timestamps in the database, so reloading or reopening can't escape a mode, and
 * a device that is offline keeps applying the last row it received (fail closed). Mirrors the
 * normalization at the top of set_focus.
 */
export function effectiveFocus(row: KidFocus | undefined, now: number): EffectiveFocus {
  if (!row) return { mode: 'everything', since: 0, endsAt: null, headsUp: null, ended: null };
  let mode = row.mode;
  let from = ms(row.since) ?? now;
  let endsAt = ms(row.ends_at);
  let ret = row.return_mode;
  let ended: EffectiveFocus['ended'] = null;
  const switchAt = ms(row.switch_at);

  // The current timed mode ran out (before any pending switch took over).
  if (endsAt !== null && endsAt <= now && !(switchAt !== null && switchAt <= endsAt)) {
    ended = { mode, at: endsAt, from };
    mode = ret ?? 'everything';
    from = endsAt;
    endsAt = null;
  }

  if (row.pending_mode && switchAt !== null) {
    if (switchAt > now) {
      return { mode, since: from, endsAt, headsUp: { mode: row.pending_mode, at: switchAt }, ended };
    }
    // The heads-up ran out: the pending mode is live.
    mode = row.pending_mode;
    from = switchAt;
    endsAt = ms(row.pending_ends_at);
    ret = row.pending_return_mode ?? null;
    ended = null;
    if (endsAt !== null && endsAt <= now) {
      ended = { mode, at: endsAt, from };
      mode = ret ?? 'everything';
      from = endsAt;
      endsAt = null;
    }
  }
  return { mode, since: from, endsAt, headsUp: null, ended };
}

/** Time left in a timed mode, never more than its full length (clock estimates can lag). */
export function timeLeft(f: EffectiveFocus, now: number): number {
  return f.endsAt === null ? 0 : Math.max(0, Math.min(f.endsAt - now, f.endsAt - f.since));
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

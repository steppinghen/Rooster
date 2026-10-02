// v3 (Phase 1.5): routines carry kid_ids, events kids_see and countdown. An older snapshot is
// simply not read; the iPad fetches a fresh one.
export const SNAPSHOT_KEY = 'deck.snapshot.v3';
export const OUTBOX_KEY = 'deck.outbox.v1';
/** Older snapshot keys: never read, always removed (they hold kid data too). */
export const LEGACY_SNAPSHOT_KEYS = ['deck.snapshot.v2'];

export function clearDeviceCache() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
    for (const k of LEGACY_SNAPSHOT_KEYS) localStorage.removeItem(k);
    localStorage.removeItem(OUTBOX_KEY);
    localStorage.removeItem('deck.currentKid');
  } catch {
    /* ignore */
  }
}

/** Today's date (YYYY-MM-DD) in the family's time zone. */
export function familyDate(timezone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}


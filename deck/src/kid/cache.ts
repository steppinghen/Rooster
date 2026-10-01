export const SNAPSHOT_KEY = 'deck.snapshot.v1';
export const OUTBOX_KEY = 'deck.outbox.v1';

export function clearDeviceCache() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
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


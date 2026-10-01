// A TOTP enrollment that hasn't been verified yet, kept so the same secret survives the
// parent switching to the Passwords app and back. iOS can reload a Home Screen app on return,
// and Supabase only reveals a factor's secret once, at enroll time, so without this every
// return would mint a new secret and the code in Passwords would never match.
// Kept for 30 minutes at most, only for the same user; erased once verified or on sign-out.

const KEY = 'deck.mfaPending';
const MAX_AGE_MS = 30 * 60_000;

export type PendingEnrollment = { userId: string; factorId: string; qr: string; secret: string; uri: string; at: number };

export function readPending(userId: string): PendingEnrollment | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PendingEnrollment | null;
    if (!p || p.userId !== userId || Date.now() - p.at > MAX_AGE_MS) return null;
    return p;
  } catch {
    return null;
  }
}

export function savePending(p: PendingEnrollment) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: the enrollment still works if the app isn't reloaded */
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

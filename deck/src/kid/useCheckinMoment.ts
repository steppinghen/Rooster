import { useState } from 'react';
import { localMinutes } from '../theme/ground';
import { familyDate } from './cache';
import { openMoment, type CheckinMoment } from './point';
import { useKidStore } from './store';

const notNowKey = (kidId: string) => `deck.notnow.${kidId}`;

function readNotNow(kidId: string): string | null {
  try {
    return localStorage.getItem(notNowKey(kidId));
  } catch {
    return null;
  }
}

/**
 * The kid's open check-in moment (point.ts openMoment) and "Not now", which rests it until the
 * next moment. The rest is remembered on this iPad only: it's a nudge, not data.
 */
export function useCheckinMoment(kidId: string, now: number): { moment: (CheckinMoment & { startedAt: number }) | null; notNow: () => void } {
  const { snapshot } = useKidStore();
  const [dismissed, setDismissed] = useState(() => readNotNow(kidId));
  const s = snapshot!;
  const tz = s.family.timezone;
  const at = new Date(now);
  const today = familyDate(tz, at);
  // Only a check-in from today (family time) answers today's moments.
  const checkin = s.checkins.find((c) => c.kid_id === kidId && familyDate(tz, new Date(c.created_at)) === today);
  const moment = openMoment(s.moments ?? [], kidId, {
    today,
    nowMinutes: localMinutes(tz, at),
    completions: s.completions,
    checkin,
    checkinMinutes: checkin ? localMinutes(tz, new Date(checkin.created_at)) : null,
    doneMinutes: (iso) => localMinutes(tz, new Date(iso)),
    dismissed,
  });
  return {
    moment,
    notNow: () => {
      if (!moment) return;
      const v = `${today}@${moment.id}`;
      try {
        localStorage.setItem(notNowKey(kidId), v);
      } catch {
        /* without storage it rests for this visit only */
      }
      setDismissed(v);
    },
  };
}

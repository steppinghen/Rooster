import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clearDeviceCache, SNAPSHOT_KEY } from '../kid/cache';
import { clearPending } from './mfaPending';
import { supabase } from './supabase';

/**
 * Who is holding this app right now. Decided by the database (`whoami` RPC) and the auth
 * assurance level, never by local state alone. The UI only routes on it; RLS enforces it.
 */
export type Who =
  | { role: 'loading' }
  | { role: 'signed_out' }
  | { role: 'needs_mfa'; enrolled: boolean; email: string }
  | { role: 'bootstrap'; email: string } // allowlisted, no family yet: may create one
  | { role: 'invited'; email: string; familyName: string } // allowlisted for a family, not joined yet
  | { role: 'none'; email: string | null } // signed in, but on no allowlist / in no family
  | { role: 'parent'; userId: string; email: string; familyId: string; familyName: string; displayName: string; timezone: string }
  | { role: 'device'; userId: string; familyId: string; familyName: string; deviceId: string; label: string; ground: Ground; timezone: string }
  | { role: 'revoked'; label: string }
  | { role: 'unpaired' }; // anonymous session that has not redeemed a pairing code

export type Ground = 'auto' | 'day' | 'night' | 'device';

type WhoamiRow = {
  role: 'parent' | 'device' | 'revoked' | 'unpaired' | 'bootstrap' | 'invited' | 'none';
  family_id: string | null;
  family_name: string | null;
  timezone: string | null;
  display_name: string | null;
  device_id: string | null;
  label: string | null;
  ground: Ground | null;
};

type SessionState = {
  who: Who;
  session: Session | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * A paired iPad that can't reach the server at launch (offline, or a network blip during an
 * iOS reload) opens from its offline snapshot instead of a "Not set up" dead end. This only
 * routes this device to the kid screens it already has cached; every read and write still goes
 * through RLS, and the next successful whoami replaces it (revoked, unpaired, and so on).
 */
function cachedDevice(s: Session): Who | null {
  if (!s.user.is_anonymous) return null;
  try {
    const snap = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null') as {
      family?: { id: string; name: string; timezone: string };
      device?: { id: string; label: string; ground: string };
    } | null;
    if (!snap?.family || !snap.device) return null;
    return {
      role: 'device',
      userId: s.user.id,
      familyId: snap.family.id,
      familyName: snap.family.name,
      deviceId: snap.device.id,
      label: snap.device.label,
      ground: snap.device.ground as Ground,
      timezone: snap.family.timezone,
    };
  } catch {
    return null;
  }
}

const RETRY_MS = [1000, 2000, 4000, 8000, 15000, 30000];

async function resolveWho(session: Session | null): Promise<Who> {
  if (!session) return { role: 'signed_out' };
  const user = session.user;
  const email = user.email ?? '';

  if (!user.is_anonymous) {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal.currentLevel !== 'aal2') {
      return { role: 'needs_mfa', enrolled: aal.nextLevel === 'aal2', email };
    }
  }

  const { data, error } = await supabase.rpc('whoami');
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as WhoamiRow | null;
  switch (row?.role) {
    case 'parent':
      return {
        role: 'parent',
        userId: user.id,
        email,
        familyId: row.family_id!,
        familyName: row.family_name!,
        displayName: row.display_name!,
        timezone: row.timezone ?? 'UTC',
      };
    case 'device':
      return {
        role: 'device',
        userId: user.id,
        familyId: row.family_id!,
        familyName: row.family_name!,
        deviceId: row.device_id!,
        label: row.label!,
        ground: row.ground ?? 'auto',
        timezone: row.timezone ?? 'UTC',
      };
    case 'revoked':
      return { role: 'revoked', label: row.label ?? 'This iPad' };
    case 'unpaired':
      return { role: 'unpaired' };
    case 'bootstrap':
      return { role: 'bootstrap', email };
    case 'invited':
      return { role: 'invited', email, familyName: row.family_name ?? 'your family' };
    default:
      return { role: 'none', email: email || null };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [who, setWho] = useState<Who>({ role: 'loading' });

  const retry = useRef<{ timer?: ReturnType<typeof setTimeout>; attempt: number }>({ attempt: 0 });
  const [retryTick, setRetryTick] = useState(0);

  const refreshWith = useCallback(async (s: Session | null) => {
    clearTimeout(retry.current.timer);
    try {
      setWho(await resolveWho(s));
      retry.current.attempt = 0;
    } catch (e) {
      // Offline or the API is unreachable: keep what we last knew. A network error is never
      // "not set up": at launch a paired iPad opens from its offline snapshot, anything else
      // keeps loading. Either way, try again with backoff until the server answers.
      console.warn('whoami failed', e);
      if (s) setWho((prev) => (prev.role === 'loading' ? (cachedDevice(s) ?? prev) : prev));
      const wait = RETRY_MS[Math.min(retry.current.attempt++, RETRY_MS.length - 1)];
      retry.current.timer = setTimeout(() => setRetryTick((t) => t + 1), wait);
    }
  }, []);

  useEffect(() => {
    if (retryTick) void supabase.auth.getSession().then(({ data }) => refreshWith(data.session));
  }, [retryTick, refreshWith]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void refreshWith(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Token refreshes don't change who you are; everything else might.
      if (event !== 'TOKEN_REFRESHED') void refreshWith(s);
    });
    const pending = retry.current;
    return () => {
      active = false;
      clearTimeout(pending.timer);
      sub.subscription.unsubscribe();
    };
  }, [refreshWith]);

  const value = useMemo<SessionState>(
    () => ({
      who,
      session,
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        await refreshWith(data.session);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        clearDeviceCache();
        clearPending();
      },
    }),
    [who, session, refreshWith],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

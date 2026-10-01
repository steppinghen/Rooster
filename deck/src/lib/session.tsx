import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearDeviceCache } from '../kid/cache';
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

  const refreshWith = useCallback(async (s: Session | null) => {
    try {
      setWho(await resolveWho(s));
    } catch (e) {
      // Offline or the API is unreachable: keep what we last knew (fail closed for devices,
      // whose screens run from the offline cache) rather than dropping to signed out.
      console.warn('whoami failed', e);
      setWho((prev) => (prev.role === 'loading' ? (s ? { role: 'none', email: s.user.email ?? null } : { role: 'signed_out' }) : prev));
    }
  }, []);

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
    return () => {
      active = false;
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

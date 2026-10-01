import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadModules, type ResolvedModule } from '../lib/modules';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { KID_COLUMNS, type DeckEvent, type Kid, type KidFocus, type Routine } from '../lib/types';
import { must } from '../lib/useAsync';
import { familyDate, OUTBOX_KEY, SNAPSHOT_KEY } from './cache';

/**
 * Everything a paired iPad needs to run the kid screens, cached on the device.
 * Offline-safe (CLAUDE.md "Architecture decisions"): if Supabase is unreachable the last
 * snapshot keeps working (never a spinner or blank screen), writes queue in the outbox and
 * sync when the connection is back. Focus modes fail closed: offline, the last mode stands.
 */

export type Completion = { routine_id: string; kid_id: string; on_date: string; completed_steps: string[]; completed_at: string | null };

export type Snapshot = {
  version: 1;
  fetchedAt: string;
  serverOffsetMs: number; // server clock minus device clock
  family: { id: string; name: string; timezone: string };
  device: { id: string; label: string; ground: string };
  kids: Kid[];
  routines: Routine[];
  events: DeckEvent[];
  modules: ResolvedModule[];
  focus: KidFocus[];
  completions: Completion[];
};

export type OutboxItem =
  | { kind: 'completion'; key: string; row: Completion & { family_id: string } }
  | { kind: 'checkin'; key: string; row: { family_id: string; kid_id: string; feeling: string; size: number; moment: string } }
  | { kind: 'usage'; key: string; row: { family_id: string; kid_id: string | null; module_key: string; action: string; target_id?: string | null; duration_ms?: number | null } }
  | { kind: 'reset_plan'; key: string; row: { family_id: string; kid_id: string; body_signs: string[]; tools: string[] } };


function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app keeps working from memory */
  }
}

async function fetchSnapshot(familyId: string, device: Snapshot['device']): Promise<Snapshot> {
  const t0 = Date.now();
  const [now, family, kids, routines, events, focus, modules] = await Promise.all([
    supabase.rpc('server_now'),
    supabase.from('families').select('id, name, timezone').eq('id', familyId).single(),
    supabase.from('kids').select(KID_COLUMNS).eq('family_id', familyId).order('sort_order').order('created_at'),
    supabase.from('routines').select('id, family_id, kid_id, slot, name, starts_at, steps, sort_order').eq('family_id', familyId).order('starts_at'),
    supabase.from('events').select('id, family_id, title, icon, on_date, kind, visible_to_kids, repeats_yearly').eq('family_id', familyId).order('on_date'),
    supabase.from('kid_focus').select('kid_id, family_id, mode, since, ends_at, return_mode, pending_mode, switch_at, pending_ends_at, pinned, updated_at').eq('family_id', familyId),
    loadModules(familyId),
  ]);
  const fam = must(family) as Snapshot['family'];
  const today = familyDate(fam.timezone);
  const yesterday = familyDate(fam.timezone, new Date(Date.now() - 86400_000));
  const completions = must(
    await supabase.from('routine_completions').select('routine_id, kid_id, on_date, completed_steps, completed_at').eq('family_id', familyId).gte('on_date', yesterday).lte('on_date', today),
  ) as Completion[];
  const serverNow = new Date(must(now) as string).getTime();
  return {
    version: 1,
    fetchedAt: new Date().toISOString(),
    serverOffsetMs: serverNow - (t0 + (Date.now() - t0) / 2),
    family: fam,
    device,
    kids: must(kids) as Kid[],
    routines: must(routines) as Routine[],
    events: must(events) as DeckEvent[],
    modules,
    focus: must(focus) as KidFocus[],
    completions,
  };
}

async function send(item: OutboxItem): Promise<void> {
  switch (item.kind) {
    case 'completion': {
      const { error } = await supabase.rpc('save_routine_progress', {
        p_routine_id: item.row.routine_id,
        p_kid_id: item.row.kid_id,
        p_on_date: item.row.on_date,
        p_steps: item.row.completed_steps,
      });
      if (error) throw error;
      return;
    }
    case 'checkin': {
      const { error } = await supabase.from('feelings_checkins').insert(item.row);
      if (error) throw error;
      return;
    }
    case 'usage': {
      const { error } = await supabase.from('usage_events').insert(item.row);
      if (error) throw error;
      return;
    }
    case 'reset_plan': {
      const { error } = await supabase.rpc('save_reset_plan', { p_kid_id: item.row.kid_id, p_body_signs: item.row.body_signs, p_tools: item.row.tools });
      if (error) throw error;
      return;
    }
  }
}

type KidStore = {
  snapshot: Snapshot | null;
  online: boolean;
  /** Server-corrected "now" in ms, so a wrong iPad clock can't stretch or skip a focus mode. */
  now: () => number;
  refresh: () => Promise<void>;
  enqueue: (item: OutboxItem) => void;
  /** Optimistically apply a change to the cached snapshot (e.g. a routine step ticked). */
  patch: (fn: (s: Snapshot) => Snapshot) => void;
};

const Ctx = createContext<KidStore | null>(null);

export function KidStoreProvider({ children }: { children: ReactNode }) {
  const { who } = useSession();
  const device = who.role === 'device' ? who : null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => read<Snapshot>(SNAPSHOT_KEY));
  const [online, setOnline] = useState(true);
  const outbox = useRef<OutboxItem[]>(read<OutboxItem[]>(OUTBOX_KEY) ?? []);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (outbox.current.length) {
        await send(outbox.current[0]!);
        outbox.current = outbox.current.slice(1);
        write(OUTBOX_KEY, outbox.current);
      }
    } catch (e) {
      // A row the server rejects for good (e.g. kid deleted) must not block the queue.
      const code = (e as { code?: string }).code;
      if (code && /^(23|22|42)/.test(code)) {
        outbox.current = outbox.current.slice(1);
        write(OUTBOX_KEY, outbox.current);
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!device) return;
    try {
      const snap = await fetchSnapshot(device.familyId, { id: device.deviceId, label: device.label, ground: device.ground });
      // Keep optimistic completions the server hasn't seen yet.
      const pending = outbox.current.filter((i): i is Extract<OutboxItem, { kind: 'completion' }> => i.kind === 'completion').map((i) => i.row);
      for (const p of pending) {
        const at = snap.completions.findIndex((c) => c.routine_id === p.routine_id && c.kid_id === p.kid_id && c.on_date === p.on_date);
        if (at >= 0) snap.completions[at] = p;
        else snap.completions.push(p);
      }
      setSnapshot(snap);
      write(SNAPSHOT_KEY, snap);
      setOnline(true);
      void flush();
    } catch {
      setOnline(false);
    }
  }, [device, flush]);

  // Load on launch, when the app comes back to the foreground, and when the network returns.
  useEffect(() => {
    if (!device) return;
    // refresh() is async: state changes only after the network answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    void supabase.rpc('device_checkin');
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    const onOnline = () => void refresh();
    const onOffline = () => setOnline(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const poll = setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(poll);
    };
  }, [device, refresh]);

  const value = useMemo<KidStore>(
    () => ({
      snapshot,
      online,
      now: () => Date.now() + (snapshot?.serverOffsetMs ?? 0),
      refresh,
      enqueue: (item) => {
        // Later writes of the same key (same routine/kid/day) replace earlier unsent ones.
        outbox.current = [...outbox.current.filter((i) => i.key !== item.key || i.kind === 'checkin' || i.kind === 'usage'), item];
        write(OUTBOX_KEY, outbox.current);
        void flush().then(() => setOnline(outbox.current.length === 0 ? true : navigator.onLine));
      },
      patch: (fn) =>
        setSnapshot((s) => {
          if (!s) return s;
          const next = fn(s);
          write(SNAPSHOT_KEY, next);
          return next;
        }),
    }),
    [snapshot, online, refresh, flush],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useKidStore(): KidStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useKidStore outside KidStoreProvider');
  return ctx;
}

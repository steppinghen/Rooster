import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import type { BrowserContext } from '@playwright/test';
import WebSocket from 'ws';
import { allowBootstrap, testEmail } from './db';
import { latestCode } from './mail';
import { totp } from './totp';

// Programmatic setup through the real APIs (email code from Mailpit, TOTP, pairing), so kid
// screen tests start from a real family without driving every parent screen each time.

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
export const SUPABASE_URL = env.VITE_SUPABASE_URL!;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY!;
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

function client(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(JSON.stringify(res.error));
  return res.data as T;
}

export type ParentFixture = { email: string; familyId: string; session: Session; db: SupabaseClient; totpSecret: string };

/** A parent with MFA done and (optionally) a fresh family. */
export async function makeParent(opts: { who?: string; familyName?: string; displayName?: string } = {}): Promise<ParentFixture> {
  const email = testEmail(opts.who ?? 'parent-a');
  allowBootstrap(email);
  const db = client();
  const since = Date.now();
  ok(await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
  const { code } = await latestCode(email, since);
  ok(await db.auth.verifyOtp({ email, token: code, type: 'email' }));
  const enroll = ok(await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e' }));
  ok(await db.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: totp(enroll.totp.secret) }));
  const familyId = ok(await db.rpc('create_family', { p_name: opts.familyName ?? 'Family A', p_display_name: opts.displayName ?? 'Parent A', p_timezone: 'America/New_York' })) as string;
  const session = (await db.auth.getSession()).data.session!;
  return { email, familyId, session, db, totpSecret: enroll.totp.secret };
}

export type KidSpec = { nickname: string; age_band: 'prereader' | 'reader'; accent?: string; avatar?: string; default_volume?: 'normal' | 'focus'; pin?: string };

export async function addKids(p: ParentFixture, kids: KidSpec[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [i, k] of kids.entries()) {
    const row = ok(
      await p.db
        .from('kids')
        .insert({ family_id: p.familyId, nickname: k.nickname, age_band: k.age_band, accent: k.accent ?? (i ? 'cyan' : 'magenta'), avatar: k.avatar ?? (i ? 'rooster' : 'turtle'), default_volume: k.default_volume ?? 'normal', sort_order: i })
        .select('id')
        .single(),
    ) as { id: string };
    ids[k.nickname] = row.id;
    if (k.pin) ok(await p.db.rpc('set_kid_pin', { p_kid_id: row.id, p_pin: k.pin }));
  }
  return ids;
}

/** Pair a new anonymous iPad identity with the parent's family. */
export async function pairDevice(p: ParentFixture, label = 'Kitchen iPad'): Promise<{ session: Session; db: SupabaseClient; deviceId: string }> {
  const [{ code }] = ok(await p.db.rpc('create_pairing_code', { p_label: label })) as { code: string }[];
  const db = client();
  ok(await db.auth.signInAnonymously());
  const r = ok(await db.rpc('redeem_pairing_code', { p_code: code })) as { ok: boolean; device_id: string };
  if (!r.ok) throw new Error('pairing failed: ' + JSON.stringify(r));
  return { session: (await db.auth.getSession()).data.session!, db, deviceId: r.device_id };
}

/** Put a session into a browser context's storage, as the app would have saved it. */
export async function useSession(context: BrowserContext, session: Session, extra: Record<string, string> = {}) {
  await context.addInitScript(
    ([key, value, more]) => {
      if (!sessionStorage.getItem('e2e-seeded')) {
        localStorage.setItem(key, value);
        for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
        sessionStorage.setItem('e2e-seeded', '1');
      }
    },
    [STORAGE_KEY, JSON.stringify(session), extra] as const,
  );
}

export const MORNING_STEPS = [
  { id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' },
  { id: 'dress', text: 'Get dressed', icon: 'shirt' },
  { id: 'breakfast', text: 'Breakfast', icon: 'breakfast' },
];

export async function addRoutine(p: ParentFixture, r: { name: string; slot: 'morning' | 'after_school' | 'bedtime'; starts_at: string; steps: { id: string; text: string; icon: string }[]; kid_id?: string | null }) {
  return (ok(await p.db.from('routines').insert({ family_id: p.familyId, kid_id: r.kid_id ?? null, ...r }).select('id').single()) as { id: string }).id;
}

export async function addEvent(p: ParentFixture, e: { title: string; icon: string; on_date: string; kind?: string; visible_to_kids?: boolean; repeats_yearly?: boolean }) {
  return (ok(await p.db.from('events').insert({ family_id: p.familyId, kind: 'other', visible_to_kids: true, repeats_yearly: false, ...e }).select('id').single()) as { id: string }).id;
}

/** Pin the app's clock: the browser's and the server_now RPC the app corrects against. */
export async function pinClock(page: import('@playwright/test').Page, iso: string) {
  await page.clock.install({ time: new Date(iso) });
  await page.route('**/rest/v1/rpc/server_now', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(iso) }));
}

/** YYYY-MM-DD `days` from the pinned date. */
export function dayFrom(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

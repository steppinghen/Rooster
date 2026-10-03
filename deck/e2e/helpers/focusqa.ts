import { expect, type Browser, type Page } from '@playwright/test';
import { lit, sql } from './db';
import { pairDevice, useSession } from './fixtures';
import type { Fam } from './kidqa';
import { installQa } from './qa';

/*
 * Slice 10-11 QA helpers. Focus modes run on real server time (set_focus uses now()), so these
 * pages do NOT pin the clock. Durations are compressed with SQL on kid_focus instead, which also
 * exercises the live push (every kid_focus write signals the family topic).
 */

export const SHOTS = 'review/screenshots/slice-10-11';

/** A kid screen on a fresh iPad identity, real clock. */
export async function liveKidPage(
  browser: Browser,
  f: Fam,
  kid: string,
  opts: { path?: string; reduced?: boolean; ground?: 'auto' | 'day' | 'night' | 'device'; colorScheme?: 'light' | 'dark'; viewport?: { width: number; height: number } } = {},
) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 820, height: 1180 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: opts.reduced === false ? 'no-preference' : 'reduce',
    colorScheme: opts.colorScheme ?? 'dark',
  });
  await installQa(ctx);
  const dev = await pairDevice(f.parent);
  sql(`update public.devices set ground = ${lit(opts.ground ?? 'day')} where id = ${lit(dev.deviceId)}`);
  await useSession(ctx, dev.session, { 'deck.currentKid': f.ids[kid]! });
  const page = await ctx.newPage();
  await page.goto(`/kid/${f.ids[kid]}${opts.path ?? ''}`);
  await page.locator('main[data-audience="kid"]').first().waitFor({ timeout: 15_000 });
  // The Point's once-a-day still (morning, Session starts, Last Run) hands back first.
  await expect(page.getByTestId('point-still')).toHaveCount(0, { timeout: 6000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, dev };
}

export async function snap(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', fullPage });
}

export function focusRow(f: Fam, kid: string) {
  const [row] = sql(`select mode, coalesce(pending_mode::text,''), coalesce(ends_at::text,''), coalesce(switch_at::text,''), coalesce(return_mode::text,'') from public.kid_focus where kid_id = ${lit(f.ids[kid]!)}`);
  const [mode, pending, ends, switchAt, ret] = (row ?? '').split('\t');
  return { mode, pending, ends, switchAt, ret };
}

/** Set a kid's focus directly (as postgres). Signals the family topic like any write. */
export function setFocus(f: Fam, kid: string, s: { mode: string; endsIn?: number | null; pending?: string | null; switchIn?: number | null; pendingEndsIn?: number | null; ret?: string | null }) {
  const iv = (n: number | null | undefined) => (n == null ? 'null' : `now() + interval '${n} seconds'`);
  // Writes only states set_focus could make (kid_focus CHECKs): a return belongs to whichever
  // timed mode it follows (the current one, or the pending one via pending_return_mode).
  const pendingTimed = !!s.pending && s.pendingEndsIn != null;
  const ret = s.ret ? lit(s.ret) : 'null';
  sql(`update public.kid_focus set mode = ${lit(s.mode)}, since = now(), ends_at = ${iv(s.endsIn)},
         return_mode = ${s.endsIn != null ? ret : 'null'}, pending_mode = ${s.pending ? lit(s.pending) : 'null'},
         switch_at = ${iv(s.switchIn)}, pending_ends_at = ${iv(s.pendingEndsIn)},
         pending_return_mode = ${pendingTimed ? ret : 'null'}
       where kid_id = ${lit(f.ids[kid]!)}`);
}

/**
 * Buttons and links whose centre is covered by another element (e.g. a fixed banner).
 * Returns "button name -> covering element".
 */
export async function coveredControls(page: Page) {
  return page.evaluate(() => {
    const qa = (window as any).__qa; // eslint-disable-line @typescript-eslint/no-explicit-any
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role=button], [role=radio]')) {
      if (!qa.visible(el)) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && !el.contains(hit) && !hit.contains(el)) out.push(`${qa.name(el)} -> ${qa.name(hit)}`);
    }
    return out;
  });
}

/** Visible elements (text or controls) that a fixed overlay's rectangle overlaps. */
export async function overlapsOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const qa = (window as any).__qa; // eslint-disable-line @typescript-eslint/no-explicit-any
    const box = document.querySelector(sel);
    if (!box || !qa.visible(box)) return [];
    const b = box.getBoundingClientRect();
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (box.contains(el) || el.contains(box) || !qa.visible(el)) continue;
      const isText = !!qa.ownText(el);
      const isCtl = el.matches('button, a[href], [role=button]');
      if (!isText && !isCtl) continue;
      const r = el.getBoundingClientRect();
      const ix = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      const iy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (ix > 2 && iy > 2) out.push(`${qa.name(el)} (${Math.round(ix)}x${Math.round(iy)})`);
    }
    return out;
  }, selector);
}

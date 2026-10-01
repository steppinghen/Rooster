import { expect, type Browser, type Page } from '@playwright/test';
import { lit, sql } from './db';
import { addEvent, addKids, addRoutine, dayFrom, makeParent, MORNING_STEPS, pairDevice, pinClock, useSession, type KidSpec, type ParentFixture } from './fixtures';
import { audit, installQa, volumeAudit } from './qa';

/*
 * Shared setup and rule checks for the slice 5-9 kid QA (independent tester).
 * Times are America/New_York (EDT in October 2026, UTC-4).
 */

export const SHOTS = 'review/screenshots/slice-5-9';
export const T = {
  beforeDawn: '2026-10-01T10:29:00Z', // 06:29, one minute before Dawn Patrol
  dawn: '2026-10-01T10:30:00Z', // 06:30, Dawn Patrol starts
  seven: '2026-10-01T11:00:00Z', // 07:00
  afterSchool: '2026-10-01T19:45:00Z', // 15:45
  beforeBed: '2026-10-01T23:29:00Z', // 19:29, one minute before Last Run
  bed: '2026-10-01T23:30:00Z', // 19:30, Last Run starts
  eight: '2026-10-02T00:00:00Z', // 20:00
};

export const ACCENT_RGB: Record<string, string> = {
  magenta: 'rgb(255, 62, 138)',
  cyan: 'rgb(41, 211, 255)',
  yellow: 'rgb(255, 210, 63)',
  lime: 'rgb(155, 229, 100)',
  lilac: 'rgb(169, 155, 255)',
  orange: 'rgb(255, 138, 61)',
};

export type Fam = { parent: ParentFixture; ids: Record<string, string>; device: Awaited<ReturnType<typeof pairDevice>>; routines: Record<string, string>; ground?: string };

/** A fresh family with the three routines, a few countdowns, and a paired iPad. */
export async function family(kids: KidSpec[], opts: { events?: boolean } = {}): Promise<Fam> {
  const parent = await makeParent({ familyName: `Family QA ${Date.now() % 100000}` });
  const ids = await addKids(parent, kids);
  const routines = {
    morning: await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: MORNING_STEPS }),
    after: await addRoutine(parent, { name: 'After School', slot: 'after_school', starts_at: '15:30', steps: [{ id: 'hands', text: 'Wash hands', icon: 'soap' }, { id: 'snack', text: 'Snack', icon: 'water' }] }),
    bed: await addRoutine(parent, { name: 'Last Run', slot: 'bedtime', starts_at: '19:30', steps: [{ id: 'pjs', text: 'Pajamas on', icon: 'shirt' }, { id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }] }),
  };
  if (opts.events !== false) {
    await addEvent(parent, { title: 'Beach trip', icon: 'beach', on_date: dayFrom(T.seven, 12), kind: 'trip' });
    await addEvent(parent, { title: 'Pumpkin patch', icon: 'pumpkin', on_date: dayFrom(T.seven, 4) });
    await addEvent(parent, { title: 'Zoo day', icon: 'party', on_date: dayFrom(T.seven, 30) });
    await addEvent(parent, { title: 'Grandma visits', icon: 'gift', on_date: dayFrom(T.seven, 45) });
    await addEvent(parent, { title: 'Snow trip', icon: 'tree', on_date: dayFrom(T.seven, 60) });
    await addEvent(parent, { title: 'Parents dinner', icon: 'star', on_date: dayFrom(T.seven, 2), visible_to_kids: false });
  }
  const device = await pairDevice(parent);
  return { parent, ids, device, routines };
}

export function resetFamily(f: Fam) {
  sql(`delete from public.routine_completions where family_id = ${lit(f.parent.familyId)};
       delete from public.feelings_checkins where family_id = ${lit(f.parent.familyId)};
       delete from public.reset_plans where family_id = ${lit(f.parent.familyId)};
       update public.kid_focus set mode = 'everything', since = now(), ends_at = null, return_mode = null, pending_mode = null, switch_at = null, pending_ends_at = null, pending_return_mode = null where family_id = ${lit(f.parent.familyId)};
       update public.devices set ground = 'auto' where family_id = ${lit(f.parent.familyId)};`);
  f.ground = 'auto';
}

export function setGround(f: Fam, g: 'auto' | 'day' | 'night' | 'device') {
  f.ground = g;
  sql(`update public.devices set ground = ${lit(g)} where family_id = ${lit(f.parent.familyId)}`);
}

export function setMode(f: Fam, kid: string, mode: 'everything' | 'session' | 'lights_out') {
  sql(`update public.kid_focus set mode = ${lit(mode)}, since = now(), ends_at = null, return_mode = null, pending_mode = null, switch_at = null, pending_ends_at = null, pending_return_mode = null where kid_id = ${lit(f.ids[kid]!)}`);
}

/** Open a kid screen on a fresh iPad context with the clock pinned. */
export async function kidPage(
  browser: Browser,
  f: Fam,
  kid: string,
  at: string,
  opts: { path?: string; reduced?: boolean; viewport?: { width: number; height: number }; colorScheme?: 'light' | 'dark' } = {},
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
  // A fresh iPad identity per context: contexts sharing one refresh token sign each other out.
  const dev = await pairDevice(f.parent);
  if (f.ground && f.ground !== 'auto') sql(`update public.devices set ground = ${lit(f.ground)} where id = ${lit(dev.deviceId)}`);
  await useSession(ctx, dev.session, { 'deck.currentKid': f.ids[kid]! });
  const page = await ctx.newPage();
  await pinClock(page, at);
  await page.goto(`/kid/${f.ids[kid]}${opts.path ?? ''}`);
  // Let the first snapshot land (the cached one paints first).
  await page.locator('main[data-audience="kid"]').first().waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

export async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const buf = await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
  return buf;
}

/** Kid-screen rules. min = 80 for the pre-reader, 64 for the reader. */
export async function kidRules(page: Page, where: string, min: number, ground?: 'day' | 'night') {
  const a = await audit(page, min);
  if (ground) expect.soft(a.ground, `${where}: ground`).toBe(ground);
  expect.soft(a.smallTargets, `${where}: targets under ${min}pt`).toEqual([]);
  expect.soft(a.scrollsY, `${where}: needs vertical scrolling at ${await page.evaluate(() => `${innerWidth}x${innerHeight}`)}`).toBe(false);
  expect.soft(a.overflowX, `${where}: horizontal overflow`).toBe(false);
  expect.soft(a.selectable, `${where}: selectable text`).toEqual([]);
  expect.soft(a.callouts, `${where}: long-press callouts`).toEqual([]);
  expect.soft(a.contrast, `${where}: text below WCAG AA`).toEqual([]);
  expect.soft(a.yellowOnDay, `${where}: yellow text on the day ground`).toEqual([]);
  expect.soft(a.creamOnAccent, `${where}: cream text on an accent`).toEqual([]);
  const zoomable = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => !['manipulation', 'none'].includes(getComputedStyle(b).touchAction)).map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 30)),
  );
  expect.soft(zoomable, `${where}: buttons that allow double-tap zoom`).toEqual([]);
  return a;
}

/** The volume rules: focus = none of the loud treatment, normal = all of it. */
export async function volumeRules(page: Page, where: string, volume: 'normal' | 'focus', accent?: string, opts: { marker?: boolean } = {}) {
  const v = await volumeAudit(page);
  if (volume === 'focus') {
    expect.soft(v.textShadows, `${where}: offset headlines in focus`).toEqual([]);
    expect.soft(v.halftone, `${where}: halftone in focus`).toEqual([]);
    expect.soft(v.tilts, `${where}: tilts in focus`).toEqual([]);
    expect.soft(v.marker, `${where}: marker lettering in focus`).toEqual([]);
    expect.soft(v.patterns, `${where}: SVG halftone patterns in focus`).toBe(0);
    if (accent) {
      const area = await page.evaluate((want) => {
        const qa = (window as any).__qa; // eslint-disable-line @typescript-eslint/no-explicit-any
        let a = 0;
        const fills: string[] = [];
        for (const el of document.querySelectorAll('body *')) {
          if (getComputedStyle(el).backgroundColor !== want || !qa.visible(el)) continue;
          const r = el.getBoundingClientRect();
          a += r.width * r.height;
          fills.push(`${qa.name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return { fraction: a / (innerWidth * innerHeight), fills };
      }, accent);
      expect.soft(area.fraction, `${where}: accent should be a small indicator in focus; fills ${area.fills.join(', ')}`).toBeLessThan(0.02);
    }
  } else {
    expect.soft(v.textShadows.length, `${where}: offset headline at normal`).toBeGreaterThan(0);
    expect.soft(v.halftone.length, `${where}: halftone at normal`).toBeGreaterThan(0);
    expect.soft(v.tilts.length, `${where}: tilts at normal`).toBeGreaterThan(0);
    if (opts.marker) expect.soft(v.marker.length, `${where}: marker lettering at normal`).toBeGreaterThan(0);
  }
  return v;
}

/** Constants that must not change between volumes: ink outlines, display font, pressable buttons. */
export async function constants(page: Page) {
  return page.evaluate(() => {
    const pick = (sel: string, f: (s: CSSStyleDeclaration) => string) => {
      const el = document.querySelector(sel);
      return el ? f(getComputedStyle(el)) : null;
    };
    return {
      headlineFont: pick('.dk-headline', (s) => s.fontFamily),
      btnBorder: pick('.dk-btn', (s) => `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`),
      btnShadow: pick('.dk-btn', (s) => s.boxShadow),
      cardBorder: pick('.dk-card', (s) => `${s.borderTopWidth} ${s.borderTopColor}`),
      tileBorder: pick('.dk-tile', (s) => `${s.borderTopWidth} ${s.borderTopColor}`),
    };
  });
}

/** Under reduced motion nothing moves (transitions, animations). */
export async function stillUnderReducedMotion(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const dur = (v: string) => v.split(',').some((x) => parseFloat(x) > 0);
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (dur(s.transitionDuration) || (s.animationName !== 'none' && dur(s.animationDuration))) out.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().replace(/\s+/g, '.')}`);
    }
    return { out, running: document.getAnimations().filter((a) => a.playState === 'running').length };
  });
}

/** Text anywhere on the page that hints at scoring. */
export const SCORE_WORDS = /\b(points?|score|scores|stars? earned|streak|reward|rewards|level up|xp|badge|sticker earned|\+\d+)\b/i;

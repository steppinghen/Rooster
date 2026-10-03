import { expect, type Browser, type Page } from '@playwright/test';
import { lit, sql } from './db';
import { addRoutine } from './fixtures';
import { family, kidPage, resetFamily, type Fam } from './kidqa';

/*
 * kid-ux-tester helpers for The Point (Phase 1.5 slice 5). Seeding follows the builder's spec
 * (e2e/slice15-5-point.spec.ts): sticker routines through save_routine, this week's deck with
 * placed awards, and check-in moments. Pinned clock, New York time, Thursday 2026-10-01.
 */

export const PORTRAIT = { width: 820, height: 1180 };
export const LANDSCAPE = { width: 1180, height: 820 };
export const MIN = { prereader: 80, reader: 64 } as const;

export const AT = {
  dawn: '2026-10-01T11:00:00Z', // 07:00, Dawn Patrol running, bus at 08:05
  noon: '2026-10-01T16:00:00Z', // 12:00, Dawn Patrol done: upcoming After school
  invite: '2026-10-01T19:10:00Z', // 15:10, the 15:00 moment open
  after: '2026-10-01T20:00:00Z', // 16:00, After school running
  evening2: '2026-10-01T22:10:00Z', // 18:10, the 18:00 moment open (second moment)
  lastRun: '2026-10-01T23:45:00Z', // 19:45, Last Run running
  late: '2026-10-02T01:30:00Z', // 21:30, everything done
};

export const PLACED: [string, number, number, number, number][] = [
  ['shell', 0.905, 0.46, 93, 5],
  ['surfboard', 0.086, 0.66, 95, -5],
  ['palm-island', 0.516, 0.31, 86, 5],
  ['barrel', 0.349, 0.69, 95, -6],
  ['flip-flop', 0.549, 0.67, 88, 5],
  ['rooster-rider', 0.344, 0.29, 96, -6],
  ['helmet', 0.684, 0.32, 91, -9],
  ['wheel', 0.168, 0.29, 86, -8],
];

export type PointFam = Fam & { r: { dawn: string; after: string; last: string } };

/** A family with Kid A (reader, cyan), Kid B (pre-reader, magenta) and optionally Kid C, and the three sticker routines. */
export async function pointFamily(o: { three?: boolean } = {}): Promise<PointFam> {
  const kids = [
    { nickname: 'Kid A', age_band: 'reader' as const, accent: 'cyan', avatar: 'rooster' },
    { nickname: 'Kid B', age_band: 'prereader' as const, accent: 'magenta', avatar: 'turtle' },
  ];
  if (o.three) kids.push({ nickname: 'Kid C', age_band: 'reader' as const, accent: 'lime', avatar: 'rooster' });
  const f = await family(kids, { events: true });
  sql(`delete from public.routines where family_id = ${lit(f.parent.familyId)}`);
  const r = {
    dawn: await addRoutine(f.parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: [{ id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }, { id: 'dress', text: 'Get dressed', icon: 'shirt' }, { id: 'breakfast', text: 'Eat breakfast', icon: 'breakfast' }], finish_by: '08:05', finish_label: 'bus', earns_sticker: true }),
    after: await addRoutine(f.parent, { name: 'After school', slot: 'after_school', starts_at: '15:30', steps: [{ id: 'hands', text: 'Wash hands', icon: 'soap' }, { id: 'snack', text: 'Snack', icon: 'water' }], earns_sticker: true }),
    last: await addRoutine(f.parent, { name: 'Last Run', slot: 'bedtime', starts_at: '19:30', steps: [{ id: 'pjs', text: 'Pajamas on', icon: 'shirt' }, { id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }], earns_sticker: true }),
  };
  return Object.assign(f, { r });
}

/** This week's deck with `stickers` placed, and check-in moments (15:00 by default). */
export function seedWeek(f: PointFam, kid: string, o: { stickers?: number; moments?: [string, string][] } = {}) {
  const fam = lit(f.parent.familyId);
  const k = lit(f.ids[kid]!);
  const moments = o.moments ?? [['Home from school', '15:00']];
  sql(`delete from public.sticker_awards where kid_id = ${k};
       delete from public.kid_decks where kid_id = ${k};
       delete from public.checkin_moments where kid_id = ${k};
       insert into public.kid_decks (id, family_id, kid_id, week_start, design_key, world)
         values (gen_random_uuid(), ${fam}, ${k}, '2026-09-28', 'sunset-stripes', 'surf');
       ${moments.map(([label, at], i) => `insert into public.checkin_moments (family_id, kid_id, label, at_time, sort_order) values (${fam}, ${k}, ${lit(label)}, '${at}', ${i});`).join('\n')}`);
  const src = [f.r.dawn, f.r.after, f.r.last];
  const rows = PLACED.slice(0, o.stickers ?? PLACED.length).map(([key, x, y, size, tilt], i) => {
    const day = `2026-09-${28 + Math.floor(i / 3)}`;
    return `(${fam}, ${k}, (select id from public.kid_decks where kid_id = ${k}), 'routine', ${lit(src[i % 3]!)}, '${day}', array[${lit(key)}], ${lit(key)}, ${x}, ${y}, ${size}, ${tilt}, '${day}T12:00:00Z')`;
  });
  if (rows.length) sql(`insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys, sticker_key, x, y, size, tilt, placed_at) values ${rows.join(',')}`);
}

export function doneSteps(f: PointFam, kid: string, routine: string, steps: string[], on = '2026-10-01') {
  sql(`insert into public.routine_completions (family_id, kid_id, routine_id, on_date, completed_steps, completed_at)
       values (${lit(f.parent.familyId)}, ${lit(f.ids[kid]!)}, ${lit(routine)}, '${on}', array[${steps.map(lit).join(',')}]::text[], null)
       on conflict (family_id, routine_id, kid_id, on_date) do update set completed_steps = excluded.completed_steps`);
}

/** Today's award for a routine: with a sticker (earned) or without one (the pick is waiting). */
export function awardToday(f: PointFam, kid: string, routine: string, sticker: string | null) {
  const k = lit(f.ids[kid]!);
  sql(`insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys, sticker_key, x, y, size, tilt, placed_at)
       values (${lit(f.parent.familyId)}, ${k}, (select id from public.kid_decks where kid_id = ${k}), 'routine', ${lit(routine)}, '2026-10-01', '{school-bus,apple,pencil}',
               ${sticker ? lit(sticker) : 'null'}, ${sticker ? '0.75' : 'null'}, ${sticker ? '0.6' : 'null'}, ${sticker ? '90' : 'null'}, ${sticker ? '7' : 'null'}, ${sticker ? `'2026-10-01T12:00:00Z'` : 'null'})`);
}

export function volume(f: PointFam, kid: string, v: 'normal' | 'focus') {
  sql(`update public.kids set default_volume = ${lit(v)} where id = ${lit(f.ids[kid]!)}`);
}

export function moduleSwitch(f: PointFam, key: string, enabled: boolean) {
  sql(`insert into public.family_modules (family_id, module_key, enabled) values (${lit(f.parent.familyId)}, ${lit(key)}, ${enabled})
       on conflict (family_id, module_key) do update set enabled = excluded.enabled`);
}

export function resetPoint(f: PointFam) {
  resetFamily(f);
  for (const kid of Object.keys(f.ids)) {
    volume(f, kid, 'normal');
    seedWeek(f, kid);
  }
  sql(`update public.kids set dock_picks = '{}' where family_id = ${lit(f.parent.familyId)};
       insert into public.family_modules (family_id, module_key, enabled) select ${lit(f.parent.familyId)}, k, true from unnest(array['tour_dates','routines','session']) k
         on conflict (family_id, module_key) do update set enabled = true;`);
}

export async function openPoint(browser: Browser, f: PointFam, kid: string, at: string, o: { viewport?: { width: number; height: number }; reduced?: boolean; path?: string; colorScheme?: 'light' | 'dark'; keepStill?: boolean } = {}) {
  return kidPage(browser, f, kid, at, { viewport: o.viewport ?? PORTRAIT, reduced: o.reduced ?? true, path: o.path, colorScheme: o.colorScheme, keepStill: o.keepStill });
}

export async function snap(page: Page, dir: string, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  return page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}

/**
 * What kidRules' "no scroll" can't see: .dk-kidscreen is 100dvh with overflow hidden, so the
 * document never scrolls; content that doesn't fit is clipped or slides under the dock instead.
 * Reports visible elements of the screen (outside the dock) that end below the dock's top or
 * outside the viewport, and the body overflowing its own box.
 */
export async function fitReport(page: Page) {
  return page.evaluate(() => {
    const qa = (window as any).__qa; // eslint-disable-line @typescript-eslint/no-explicit-any
    const main = document.querySelector('main[data-audience="kid"]');
    const dock = document.querySelector('nav.dk-dock');
    const dockTop = dock ? dock.getBoundingClientRect().top : innerHeight;
    const out: string[] = [];
    if (!main) return { out: ['no kid main'], dockTop, bodyOverflow: 0 };
    for (const el of main.querySelectorAll('*')) {
      if (dock && (dock === el || dock.contains(el))) continue;
      if (!qa.visible(el)) continue;
      if (el.closest('.dk-kidhead__corner, .dk-corner, [class*="corner"], .dk-trim, .sc-confetti')) continue;
      const own = qa.ownText(el);
      const ctl = el.matches('button, a[href], [role=button]');
      const card = el.matches('section, .pt-week, .pt-card, .pt-slot, .pt-hero, .dk-deck');
      if (!own && !ctl && !card) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > dockTop + 1) out.push(`${qa.name(el)} bottom ${Math.round(r.bottom)} > dock top ${Math.round(dockTop)}`);
      else if (r.right > innerWidth + 1 || r.left < -1 || r.top < -1) out.push(`${qa.name(el)} off screen (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)})`);
    }
    const body = main.querySelector('.dk-kidscreen__body') as HTMLElement | null;
    return { out, dockTop, bodyOverflow: body ? body.scrollHeight - body.clientHeight : 0 };
  });
}

/** Overlap between the main blocks of The Point (hero, stickers, My week, info cards, slots). */
export async function blockOverlaps(page: Page) {
  return page.evaluate(() => {
    const sel = ['.pt-hero', '.pt-stickers', '.pt-week', '.pt-cards', '.dk-kidhead', 'nav.dk-dock', '.focus-headsup'];
    const els = sel.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => (e as HTMLElement).offsetParent !== null || e.matches('.focus-headsup'));
    const out: string[] = [];
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i]!.getBoundingClientRect();
        const b = els[j]!.getBoundingClientRect();
        if (!a.width || !b.width) continue;
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 2 && iy > 2 && !els[i]!.contains(els[j]!) && !els[j]!.contains(els[i]!)) out.push(`${els[i]!.className} x ${els[j]!.className} (${Math.round(ix)}x${Math.round(iy)})`);
      }
    return out;
  });
}

/** The primary action of the screen is fully on screen and above the dock. */
export async function primaryAboveFold(page: Page, where: string) {
  const prim = page.locator('.pt-hero__go, .pt-still').first();
  if (!(await prim.count())) return null;
  const b = (await prim.boundingBox())!;
  const dock = await page.locator('nav.dk-dock').boundingBox();
  const limit = dock ? dock.y : page.viewportSize()!.height;
  expect.soft(b.y + b.height, `${where}: primary action above the dock`).toBeLessThanOrEqual(limit + 0.5);
  return b;
}

export async function dockRules(page: Page, where: string, o: { want?: string[]; active?: string } = {}) {
  const dock = page.locator('nav.dk-dock');
  await expect(dock, where).toBeVisible();
  const b = (await dock.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect.soft(b.y + b.height, `${where}: dock bottom on screen`).toBeLessThanOrEqual(vh + 0.5);
  expect.soft(await dock.locator('[aria-current="page"]').count(), `${where}: one active dock item`).toBe(1);
  await expect.soft(dock.getByTestId('dock-wave_check'), `${where}: Wave Check on the dock`).toHaveCount(1);
  if (o.active) await expect.soft(dock.locator('[aria-current="page"]'), `${where}: active item`).toHaveAttribute('data-dock', o.active);
  if (o.want) expect.soft(await dock.locator('[data-dock]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dock'))), `${where}: dock items`).toEqual(o.want);
}

/** Visible text or fills in a red hue (never red on kid screens). The day marker #B3124F is the brief's marker, not red. */
export async function reds(page: Page) {
  return page.evaluate(() => {
    const qa = (window as any).__qa; // eslint-disable-line @typescript-eslint/no-explicit-any
    const out: string[] = [];
    const red = (c: string) => {
      const p = qa.parse(c);
      if (!p || p[3] === 0) return false;
      const [r, g, b] = p;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 60 || r !== max) return false;
      let h = (60 * (g - b)) / (max - min);
      if (h < 0) h += 360;
      return (h <= 12 || h >= 350) && r > 150;
    };
    for (const el of document.querySelectorAll('main *')) {
      if (!qa.visible(el)) continue;
      const s = getComputedStyle(el);
      if (qa.ownText(el) && red(s.color)) out.push(`${qa.name(el)} text ${s.color}`);
      if (red(s.backgroundColor)) out.push(`${qa.name(el)} fill ${s.backgroundColor}`);
      if (red(s.borderTopColor) && parseFloat(s.borderTopWidth) > 0) out.push(`${qa.name(el)} border ${s.borderTopColor}`);
    }
    return out;
  });
}

export { resetFamily };

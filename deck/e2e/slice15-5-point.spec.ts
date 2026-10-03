import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { lit, sql } from './helpers/db';
import { addRoutine } from './helpers/fixtures';
import { composite, loadFrame } from './helpers/frames';
import { family, kidPage, kidRules, resetFamily, setGround, setMode, volumeRules, type Fam } from './helpers/kidqa';

// Phase 1.5 slice 5: The Point (layout B2). Pinned clock, New York time, Thursday 2026-10-01
// (week of Monday 2026-09-28). Kid A is a reader in cyan, Kid B a pre-reader in magenta, as the
// frames draw them.
const OUT = 'review/screenshots/phase15-slice5';
const MIN = { prereader: 80, reader: 64 } as const;
mkdirSync(`${OUT}/compare`, { recursive: true });

const AT = {
  dawn: '2026-10-01T11:00:00Z', // 07:00, Dawn Patrol running (1 of 3 done), bus at 08:05
  invite: '2026-10-01T19:10:00Z', // 15:10, the "Home from school" moment is open, nothing running
  after: '2026-10-01T20:00:00Z', // 16:00, After School running
  evening: '2026-10-02T01:00:00Z', // 21:00, everything done or past
};
const PORTRAIT = { width: 820, height: 1180 };
const LANDSCAPE = { width: 1180, height: 820 };

// The eight stickers the B2 frames draw, at their spots (x, y, size, tilt).
const PLACED: [string, number, number, number, number][] = [
  ['shell', 0.905, 0.46, 93, 5],
  ['surfboard', 0.086, 0.66, 95, -5],
  ['palm-island', 0.516, 0.31, 86, 5],
  ['barrel', 0.349, 0.69, 95, -6],
  ['flip-flop', 0.549, 0.67, 88, 5],
  ['rooster-rider', 0.344, 0.29, 96, -6],
  ['helmet', 0.684, 0.32, 91, -9],
  ['wheel', 0.168, 0.29, 86, -8],
];

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'The Point: one project, viewports set per context'));

let f: Fam;
let r: { dawn: string; after: string; last: string };
test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'ipad') return;
  f = await family(
    [
      { nickname: 'Kid A', age_band: 'reader', accent: 'cyan', avatar: 'rooster' },
      { nickname: 'Kid B', age_band: 'prereader', accent: 'magenta', avatar: 'turtle' },
    ],
    { events: true },
  );
  // Sticker routines of their own, so the Phase 1 three stay as they are.
  sql(`delete from public.routines where family_id = ${lit(f.parent.familyId)}`);
  r = {
    dawn: await addRoutine(f.parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: [{ id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }, { id: 'dress', text: 'Get dressed', icon: 'shirt' }, { id: 'breakfast', text: 'Eat breakfast', icon: 'breakfast' }], finish_by: '08:05', finish_label: 'bus', earns_sticker: true }),
    after: await addRoutine(f.parent, { name: 'After school', slot: 'after_school', starts_at: '15:30', steps: [{ id: 'hands', text: 'Wash hands', icon: 'soap' }, { id: 'snack', text: 'Snack', icon: 'water' }], earns_sticker: true }),
    last: await addRoutine(f.parent, { name: 'Last Run', slot: 'bedtime', starts_at: '19:30', steps: [{ id: 'pjs', text: 'Pajamas on', icon: 'shirt' }, { id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }], earns_sticker: true }),
  };
});

/** This week's deck with the frame's eight stickers (three a day, Monday to Wednesday), and an after-school check-in moment. */
function seedWeek(kid: string, stickers = PLACED.length) {
  const fam = lit(f.parent.familyId);
  const k = lit(f.ids[kid]!);
  sql(`delete from public.sticker_awards where kid_id = ${k};
       delete from public.kid_decks where kid_id = ${k};
       delete from public.checkin_moments where kid_id = ${k};
       insert into public.kid_decks (id, family_id, kid_id, week_start, design_key, world)
         values (gen_random_uuid(), ${fam}, ${k}, '2026-09-28', 'sunset-stripes', 'surf');
       insert into public.checkin_moments (family_id, kid_id, label, at_time) values (${fam}, ${k}, 'Home from school', '15:00');`);
  const src = [r.dawn, r.after, r.last];
  const rows = PLACED.slice(0, stickers).map(([key, x, y, size, tilt], i) => {
    const day = `2026-09-${28 + Math.floor(i / 3)}`;
    return `(${fam}, ${k}, (select id from public.kid_decks where kid_id = ${k}), 'routine', ${lit(src[i % 3]!)}, '${day}', array[${lit(key)}], ${lit(key)}, ${x}, ${y}, ${size}, ${tilt}, '${day}T12:00:00Z')`;
  });
  if (rows.length) sql(`insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys, sticker_key, x, y, size, tilt, placed_at) values ${rows.join(',')}`);
}

function doneSteps(kid: string, routine: string, steps: string[], on = '2026-10-01') {
  sql(`insert into public.routine_completions (family_id, kid_id, routine_id, on_date, completed_steps, completed_at)
       values (${lit(f.parent.familyId)}, ${lit(f.ids[kid]!)}, ${lit(routine)}, '${on}', array[${steps.map(lit).join(',')}]::text[], null)
       on conflict (family_id, routine_id, kid_id, on_date) do update set completed_steps = excluded.completed_steps`);
}

function volume(kid: string, v: 'normal' | 'focus') {
  sql(`update public.kids set default_volume = ${lit(v)} where id = ${lit(f.ids[kid]!)}`);
}

async function open(browser: Browser, kid: string, at: string, o: { viewport?: { width: number; height: number }; reduced?: boolean; path?: string; colorScheme?: 'light' | 'dark' } = {}) {
  return kidPage(browser, f, kid, at, { viewport: o.viewport ?? PORTRAIT, reduced: o.reduced ?? true, path: o.path, colorScheme: o.colorScheme });
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  return page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
}

/** The dock's bottom edge is on screen, and exactly one item is lit. */
async function dockRules(page: Page, where: string) {
  const dock = page.locator('nav.dk-dock');
  await expect(dock, where).toBeVisible();
  const b = (await dock.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect.soft(b.y + b.height, `${where}: dock bottom on screen`).toBeLessThanOrEqual(vh + 0.5);
  expect.soft(await dock.locator('[aria-current="page"]').count(), `${where}: one active dock item`).toBe(1);
}

test.beforeEach(() => {
  if (!f) return;
  resetFamily(f);
  volume('Kid A', 'normal');
  volume('Kid B', 'normal');
  seedWeek('Kid A');
  seedWeek('Kid B');
});

test('every variant fits with no scrolling: both bands, both orientations, day and night, normal and focus', async ({ browser }) => {
  test.setTimeout(240_000);
  doneSteps('Kid A', r.dawn, ['teeth']);
  doneSteps('Kid B', r.dawn, ['teeth']);
  for (const kid of ['Kid A', 'Kid B'] as const) {
    const age = kid === 'Kid A' ? 'reader' : 'prereader';
    for (const v of ['normal', 'focus'] as const) {
      volume(kid, v);
      for (const ground of ['day', 'night'] as const) {
        setGround(f, ground);
        for (const [orient, viewport] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
          const where = `${kid} ${age} ${orient} ${ground} ${v}`;
          const { ctx, page } = await open(browser, kid, AT.dawn, { viewport });
          await expect(page.getByTestId('right-now'), where).toHaveAttribute('data-state', 'routine');
          await kidRules(page, where, age === 'reader' ? MIN.reader : MIN.prereader, ground);
          await volumeRules(page, where, v, v === 'focus' ? (kid === 'Kid A' ? 'rgb(41, 211, 255)' : 'rgb(255, 62, 138)') : undefined);
          await dockRules(page, where);
          await shot(page, `point-${age}-${orient}-${ground}-${v}`);
          await ctx.close();
        }
      }
    }
    volume(kid, 'normal');
  }
});

test('opening The Point checks the iPad in: Back Office shows when it was last seen', async ({ browser }) => {
  sql(`update public.devices set last_seen_at = null where family_id = ${lit(f.parent.familyId)}`);
  const { ctx } = await open(browser, 'Kid A', AT.dawn);
  await expect.poll(() => sql(`select count(*) from public.devices where family_id = ${lit(f.parent.familyId)} and last_seen_at is not null`)[0], { timeout: 10_000 }).not.toBe('0');
  await ctx.close();
});

test('Right now: the routine with its bus chip; Keep going opens the checklist; Home on the dock comes back', async ({ browser }) => {
  doneSteps('Kid A', r.dawn, ['teeth']);
  const { ctx, page } = await open(browser, 'Kid A', AT.dawn);
  const hero = page.getByTestId('right-now');
  await expect(hero).toContainText('Dawn Patrol');
  await expect(hero.getByTestId('up-next')).toHaveText('Get dressed');
  await expect(hero).toContainText('1 of 3 done');
  await expect(hero.getByTestId('finish-chip')).toHaveText(/BUS IN\s*65 min/);
  await hero.getByRole('button', { name: /Keep going/ }).click();
  await expect(page).toHaveURL(new RegExp(`/kid/${f.ids['Kid A']}/routine/${r.dawn}$`));
  await expect(page.getByTestId('step-text')).toHaveText('Get dressed');
  await page.getByRole('button', { name: 'Home' }).first().click();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await ctx.close();
});

test('Right now: an open check-in moment invites (turtle, Wave Check, Not now) with the dock tag; Not now rests both, even after a reload', async ({ browser }) => {
  doneSteps('Kid A', r.dawn, ['teeth', 'dress', 'breakfast']);
  const { ctx, page } = await open(browser, 'Kid A', AT.invite, { reduced: false });
  const invite = page.getByTestId('wave-prompt');
  await expect(invite).toContainText('How’s your wave?');
  await expect(invite).toContainText('Home from school. Check in?');
  await expect(invite.locator('[data-who="turtle"]')).toHaveCount(1);
  const wave = page.getByTestId('dock-wave_check');
  await expect(wave).toHaveAttribute('aria-label', 'Wave Check — check-in waiting');
  await expect(wave.locator('.dk-dock__tag--checkin')).toHaveText('Check in');
  // Never red, never a count.
  const tagColor = await wave.locator('.dk-dock__tag').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(tagColor).toBe('rgb(41, 211, 255)');
  await invite.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByTestId('wave-prompt')).toHaveCount(0);
  await expect(page.getByTestId('right-now')).toHaveAttribute('data-state', 'upcoming');
  await expect(wave.locator('.dk-dock__tag')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await expect(page.getByTestId('wave-prompt')).toHaveCount(0);
  await ctx.close();
  // Another iPad hasn't been told "Not now": the invite's Wave Check button opens Wave Check.
  const b = await open(browser, 'Kid A', AT.invite);
  await b.page.getByTestId('wave-prompt').getByRole('button', { name: /Wave Check/ }).click();
  await expect(b.page).toHaveURL(/\/wave$/);
  await b.ctx.close();
});

test('whichever started last leads: the 3:00 moment beats an unfinished Dawn Patrol, the 3:30 routine beats the moment; with nothing open, what is next', async ({ browser }) => {
  const m = await open(browser, 'Kid A', AT.invite);
  await expect(m.page.getByTestId('wave-prompt')).toBeVisible();
  await m.ctx.close();
  const a = await open(browser, 'Kid A', AT.after);
  await expect(a.page.getByTestId('right-now')).toHaveAttribute('data-state', 'routine');
  await expect(a.page.getByTestId('right-now')).toContainText('After school');
  // The moment is still open, so the tag stays on the dock.
  await expect(a.page.getByTestId('dock-wave_check').locator('.dk-dock__tag--checkin')).toBeVisible();
  await a.ctx.close();
  sql(`delete from public.checkin_moments where kid_id = ${lit(f.ids['Kid A']!)}`);
  doneSteps('Kid A', r.dawn, ['teeth', 'dress', 'breakfast']);
  const b = await open(browser, 'Kid A', AT.invite);
  await expect(b.page.getByTestId('right-now')).toHaveAttribute('data-state', 'upcoming');
  await expect(b.page.getByTestId('right-now')).toContainText('Next: After school');
  await expect(b.page.getByTestId('dock-wave_check').locator('.dk-dock__tag')).toHaveCount(0);
  await b.ctx.close();
});

test('a real check-in after the moment starts closes the invite (real clock)', async ({ browser }) => {
  // The live zone is 09:00-13:59 now; the moment opened an hour ago.
  const zone = (await import('./helpers/kidqa')).liveZone();
  sql(`update public.families set timezone = ${lit(zone)} where id = ${lit(f.parent.familyId)};
       update public.checkin_moments set at_time = (now() at time zone ${lit(zone)} - interval '1 hour')::time where kid_id = ${lit(f.ids['Kid A']!)};
       delete from public.routine_kids where family_id = ${lit(f.parent.familyId)};
       insert into public.routine_kids (family_id, routine_id, kid_id) select ${lit(f.parent.familyId)}, id, ${lit(f.ids['Kid B']!)} from public.routines where family_id = ${lit(f.parent.familyId)};`);
  try {
    const { ctx, page } = await kidPage(browser, f, 'Kid A', new Date().toISOString(), { reduced: true });
    await expect(page.getByTestId('wave-prompt')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('wave-prompt').getByRole('button', { name: /Wave Check/ }).click();
    await page.getByTestId('feeling-rolling').click();
    await page.getByTestId('size-2').click();
    await expect(page.getByTestId('wave-thanks')).toBeVisible();
    await page.getByTestId('dock-home').or(page.getByRole('button', { name: 'Home' })).first().click();
    await expect(page.getByTestId('the-point')).toBeVisible();
    await expect(page.getByTestId('wave-prompt')).toHaveCount(0);
    await expect(page.getByTestId('dock-wave_check').locator('.dk-dock__tag')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('the-point')).toBeVisible();
    await expect(page.getByTestId('wave-prompt')).toHaveCount(0);
    await ctx.close();
  } finally {
    sql(`update public.families set timezone = 'America/New_York' where id = ${lit(f.parent.familyId)};
         delete from public.routine_kids where family_id = ${lit(f.parent.familyId)};`);
  }
});

test("Today's stickers: earned, the ? on the routine running now, the rest by time; a slot opens its routine; nothing reads as missed", async ({ browser }) => {
  const fam = lit(f.parent.familyId);
  const k = lit(f.ids['Kid A']!);
  doneSteps('Kid A', r.dawn, ['teeth', 'dress', 'breakfast']);
  sql(`insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys, sticker_key, x, y, size, tilt, placed_at)
       values (${fam}, ${k}, (select id from public.kid_decks where kid_id = ${k}), 'routine', ${lit(r.dawn)}, '2026-10-01', '{school-bus,apple,pencil}', 'school-bus', 0.75, 0.6, 90, 7, '2026-10-01T12:00:00Z')`);
  doneSteps('Kid A', r.after, ['hands']);
  const { ctx, page } = await open(browser, 'Kid A', AT.after);
  const slots = page.getByTestId('sticker-slot');
  await expect(slots).toHaveCount(3);
  expect(await slots.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))).toEqual(['earned', 'next', 'later']);
  await expect(slots.nth(0)).toContainText('Got it!');
  await expect(slots.nth(0).locator('img')).toHaveCount(1);
  await expect(slots.nth(1)).toContainText('1 step to go');
  await expect(slots.nth(1).locator('.pt-q')).toHaveText('?');
  await expect(slots.nth(2)).toContainText('7:30 pm');
  // The new sticker is on the deck too: nine now.
  await expect(page.getByTestId('my-week-card')).toContainText('9 stickers · Sunset Stripes');
  await expect(page.getByTestId('the-point')).not.toContainText(/\bmissed\b|\blate\b|didn.t/i);
  await slots.nth(2).click();
  await expect(page).toHaveURL(new RegExp(`/routine/${r.last}$`));
  await ctx.close();
  // That evening the After School left half done reads like any other slot; the ? has moved to Last Run.
  const e = await open(browser, 'Kid A', AT.evening);
  expect(await e.page.getByTestId('sticker-slot').evaluateAll((els) => els.map((x) => x.getAttribute('data-kind')))).toEqual(['earned', 'later', 'next']);
  await expect(e.page.getByTestId('sticker-slot').nth(1)).toContainText('3:30 pm');
  await e.ctx.close();
});

test('My week: the card and the dock open it with My week lit; the deck keeps every saved spot; Home comes back', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'Kid A', AT.dawn);
  const card = page.getByTestId('my-week-card');
  await expect(card).toContainText('8 stickers · Sunset Stripes');
  const spots = await card.locator('[data-sticker]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-sticker'), (e as HTMLElement).style.left, (e as HTMLElement).style.top]));
  expect(spots).toHaveLength(8);
  await card.click();
  await expect(page.getByTestId('my-week')).toBeVisible();
  await expect(page.getByTestId('dock-my_week')).toHaveAttribute('aria-current', 'page');
  const full = await page.getByTestId('my-week').locator('[data-sticker]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-sticker'), (e as HTMLElement).style.left, (e as HTMLElement).style.top]));
  expect(full).toEqual(spots);
  await kidRules(page, 'My week', MIN.reader);
  await dockRules(page, 'My week');
  await shot(page, 'my-week-reader-portrait');
  await page.getByTestId('dock-home').click();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await page.getByTestId('dock-my_week').click();
  await expect(page.getByTestId('my-week')).toBeVisible();
  await ctx.close();
});

test('a birthday countdown reads Birthday on the pre-reader card, not the kid\'s name', async ({ browser }) => {
  sql(`update public.kids set birthday_month = 10, birthday_day = 3 where id = ${lit(f.ids['Kid A']!)}`);
  try {
    const { ctx, page } = await open(browser, 'Kid B', AT.dawn, { viewport: LANDSCAPE });
    const card = page.getByTestId('card-countdown');
    await expect(card.locator('.pt-card__title')).toHaveText('Birthday');
    await expect(card.locator('.pt-card__badge')).toHaveText('2');
    await card.click();
    const said = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken ?? []);
    expect(said).toContain("2 sleeps until Kid A's birthday.");
    await ctx.close();
  } finally {
    sql(`update public.kids set birthday_month = null, birthday_day = null where id = ${lit(f.ids['Kid A']!)}`);
  }
});

test('info cards: three fixed slots; the countdown opens Tour Dates, weather and dinner rest until their slices; the pre-reader hears each one', async ({ browser }) => {
  const a = await open(browser, 'Kid A', AT.dawn);
  await expect(a.page.getByTestId('card-countdown')).toContainText('4 sleeps');
  await expect(a.page.getByTestId('card-countdown')).toContainText('Pumpkin patch');
  await expect(a.page.getByTestId('card-weather').locator('.pt-card__arrow')).toHaveCount(0);
  await expect(a.page.getByTestId('card-dinner').locator('.pt-card__arrow')).toHaveCount(0);
  await expect(a.page.getByTestId('card-countdown').locator('.pt-card__arrow')).toHaveCount(1);
  await a.page.getByTestId('card-countdown').click();
  await expect(a.page).toHaveURL(/\/dates$/);
  await a.ctx.close();
  const b = await open(browser, 'Kid B', AT.dawn, { viewport: LANDSCAPE });
  // Pre-reader: large picture cards with one word each; the count is a badge on the picture.
  await expect(b.page.getByTestId('card-countdown').locator('.pt-card__title')).toHaveText('Pumpkin');
  await expect(b.page.getByTestId('card-countdown').locator('.pt-card__badge')).toHaveText('4');
  await expect(b.page.getByTestId('card-dinner').locator('.pt-card__line')).toHaveCount(0);
  await expect(b.page.getByTestId('card-weather').locator('.pt-card__title')).toHaveText('Weather');
  await b.page.getByTestId('card-dinner').click();
  await b.page.getByTestId('card-countdown').click();
  await expect(b.page).toHaveURL(/\/dates$/);
  const said = await b.page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken ?? []);
  expect(said).toEqual(expect.arrayContaining(['Dinner later.', '4 sleeps until Pumpkin patch.']));
  await b.ctx.close();
});

test('Session mode: Right now is the assigned Session; the dock is Home, Session, Wave Check; My week and the countdown are gone', async ({ browser }) => {
  setMode(f, 'Kid A', 'session');
  const { ctx, page } = await open(browser, 'Kid A', AT.dawn);
  await expect(page.getByTestId('session-home')).toContainText('Session time');
  expect(await page.locator('nav.dk-dock [data-dock]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dock')))).toEqual(['home', 'session', 'wave_check']);
  await expect(page.getByTestId('sticker-slot')).toHaveCount(0);
  // Nothing on The Point leads to a hidden module: no countdown card, no My week card.
  await expect(page.getByTestId('card-countdown')).toHaveCount(0);
  await expect(page.getByTestId('my-week-card')).toHaveCount(0);
  await page.goto(`/kid/${f.ids['Kid A']}/week`);
  await expect(page.getByTestId('the-point')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/kid/${f.ids['Kid A']}$`));
  await ctx.close();
});

test('scene stills: the morning still plays in the Right now slot once a day (a tap skips it); the dock stays reachable', async ({ browser }) => {
  const { ctx, page } = await kidPage(browser, f, 'Kid A', AT.dawn, { reduced: true, keepStill: true });
  const still = page.getByTestId('point-still');
  await expect(still).toHaveAttribute('data-kind', 'morning');
  await expect(still).toContainText('Good morning, Kid A!');
  await expect(page.getByTestId('dock-wave_check')).toBeVisible();
  await still.click();
  await expect(still).toHaveCount(0);
  await expect(page.getByTestId('right-now')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await expect(page.getByTestId('point-still')).toHaveCount(0);
  await ctx.close();
  setMode(f, 'Kid A', 'session');
  const s = await kidPage(browser, f, 'Kid A', AT.after, { reduced: true, keepStill: true });
  await expect(s.page.getByTestId('point-still')).toHaveAttribute('data-kind', 'session');
  await expect(s.page.getByTestId('point-still')).toHaveCount(0, { timeout: 6000 });
  await s.ctx.close();
});

test('idle: the hero rooster says hello, settles, and idles every 8–15 s; never with Reduce Motion or in focus', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'Kid A', AT.invite, { reduced: false });
  sql(`delete from public.checkin_moments where kid_id = ${lit(f.ids['Kid A']!)}`);
  await page.reload();
  await expect(page.getByTestId('the-point')).toBeVisible();
  const hero = page.getByTestId('right-now');
  await expect(hero.locator('.sc-mascot')).toHaveAttribute('data-pose', 'hello');
  await page.clock.runFor(2600);
  await expect(hero.locator('.sc-idle')).toHaveCount(1);
  let moved = false;
  for (let t = 0; t < 16_000 && !moved; t += 50) {
    await page.clock.runFor(50);
    moved = (await hero.locator('[data-moving="true"]').count()) > 0;
  }
  expect(moved, 'the rooster idled within 16 s').toBe(true);
  await ctx.close();
  for (const [what, setup] of [['reduced', () => {}], ['focus', () => volume('Kid A', 'focus')]] as const) {
    setup();
    const p = await open(browser, 'Kid A', AT.invite, { reduced: what === 'reduced' });
    await p.page.clock.runFor(40_000);
    expect(await p.page.getByTestId('the-point').locator('[data-moving="true"]').count(), what).toBe(0);
    if (what === 'focus') await expect(p.page.getByTestId('right-now').locator('.sc-mascot')).toHaveAttribute('data-pose', 'calm');
    await p.ctx.close();
  }
});

test('B2 side by side: the app next to each frame', async ({ browser }) => {
  test.setTimeout(180_000);
  doneSteps('Kid A', r.dawn, ['teeth']);
  doneSteps('Kid B', r.dawn, ['teeth']);
  const cases: { kid: string; viewport: { width: number; height: number }; frame: string; focus?: boolean; label: string }[] = [
    { kid: 'Kid A', viewport: PORTRAIT, frame: 'Phase15PointB2.dc.html', label: 'Kid A reader portrait' },
    { kid: 'Kid A', viewport: LANDSCAPE, frame: 'Phase15PointB2Land.dc.html', label: 'Kid A reader landscape' },
    { kid: 'Kid A', viewport: PORTRAIT, frame: 'Phase15PointB2Focus.dc.html', focus: true, label: 'Kid A reader portrait focus' },
    { kid: 'Kid B', viewport: LANDSCAPE, frame: 'Phase15PointB2Pre.dc.html', label: 'Kid B pre-reader landscape' },
    { kid: 'Kid B', viewport: LANDSCAPE, frame: 'Phase15PointB2PreFocus.dc.html', focus: true, label: 'Kid B pre-reader landscape focus' },
  ];
  setGround(f, 'day');
  for (const c of cases) {
    volume(c.kid, c.focus ? 'focus' : 'normal');
    const { ctx, page } = await open(browser, c.kid, AT.dawn, { viewport: c.viewport });
    const app = await shot(page, `compare-app-${c.frame.replace('.dc.html', '')}`);
    const fctx = await browser.newContext({ viewport: c.viewport });
    const fp = await fctx.newPage();
    const fr = await (await loadFrame(fp, c.frame, { markers: 'None' })).screenshot();
    await composite(fp, `${OUT}/compare/${c.frame.replace('.dc.html', '')}.png`, [{ label: `APP ${c.label} (day)`, png: app }, { label: `FRAME ${c.frame}`, png: fr }], c.viewport.height === 1180 ? 1000 : 700);
    await fctx.close();
    await ctx.close();
    volume(c.kid, 'normal');
  }
});

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { lit, sql } from './helpers/db';
import { kidRules, setMode, stillUnderReducedMotion, volumeRules } from './helpers/kidqa';
import { AT, LANDSCAPE, MIN, PORTRAIT, awardToday, dockRules, doneSteps, openPoint, pointFamily, reds, resetPoint, seedWeek, snap, volume, type PointFam } from './helpers/pointqa';

// kid-ux-tester, Phase 1.5 slice 5 (The Point, B2): dock tags, Not now, reloads mid-flow,
// sticker slots, motion, and every screen The Point opens.
const OUT = 'review/screenshots/phase15-slice5-kidux';
mkdirSync(OUT, { recursive: true });

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'viewports set per context'));

let f: PointFam;
test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'ipad') return;
  f = await pointFamily();
});
test.beforeEach(() => f && resetPoint(f));

/** Move the pinned clock (browser and server_now) without losing the page's storage. */
async function moveClock(page: Page, iso: string) {
  await page.unroute('**/rest/v1/rpc/server_now');
  await page.route('**/rest/v1/rpc/server_now', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(iso) }));
  await page.clock.setSystemTime(new Date(iso));
}

/** Screens without the dock yet (Phase 1 KidFrame until slices 6, 7 and 13): Home and Wave Check one tap away. */
async function exits(page: Page, where: string) {
  if (await page.locator('nav.dk-dock').count()) return dockRules(page, where);
  await expect.soft(page.getByRole('button', { name: 'Home' }).first(), `${where}: Home`).toBeVisible();
  if (!/\/wave$/.test(page.url())) await expect.soft(page.getByRole('button', { name: /Wave Check/ }).or(page.getByRole('link', { name: /Wave Check/ })).first(), `${where}: Wave Check`).toBeVisible();
}
const home = (page: Page) => page.getByTestId('dock-home').or(page.getByRole('button', { name: 'Home' })).first();

const tagInfo = (page: Page) =>
  page.getByTestId('dock-wave_check').locator('.dk-dock__tag').evaluate((e) => {
    const s = getComputedStyle(e);
    return { cls: e.className, anim: s.animationName, transform: s.transform, bg: s.backgroundColor, text: e.textContent };
  });

test('dock: Check in tag pops (stepped) at normal, is still and straight in focus and Reduce Motion; never red, never a count; picks and Session trim', async ({ browser }) => {
  test.setTimeout(150_000);
  doneSteps(f, 'Kid A', f.r.dawn, ['teeth', 'dress', 'breakfast']);
  // Normal, motion allowed.
  const n = await openPoint(browser, f, 'Kid A', AT.invite, { reduced: false });
  await dockRules(n.page, 'normal', { active: 'home', want: ['home', 'my_week', 'wave_check'] });
  const t = await tagInfo(n.page);
  expect.soft(t.cls, 'normal: tag pops').toContain('dk-pop');
  expect.soft(t.anim, 'normal: tag pop animation').toBe('dk-pop-checkin');
  expect.soft(t.transform, 'normal: tag tilted').not.toBe('none');
  expect.soft(t.text?.trim(), 'tag text').toBe('Check in');
  expect.soft(t.text ?? '', 'no count').not.toMatch(/\d/);
  expect.soft(await n.page.getByTestId('dock-wave_check').getAttribute('aria-label'), 'no count in the label').not.toMatch(/\d/);
  expect.soft(await reds(n.page), 'normal: red on The Point').toEqual([]);
  await snap(n.page, OUT, 'dock-tag-normal');
  // Back from My week: does the tag pop again? (It should pop once.)
  await n.page.getByTestId('dock-my_week').click();
  await expect(n.page.getByTestId('my-week')).toBeVisible();
  await n.page.getByTestId('dock-home').click();
  await expect(n.page.getByTestId('the-point')).toBeVisible();
  const again = await tagInfo(n.page);
  test.info().annotations.push({ type: 'tag pop on return to The Point', description: `${again.cls} / ${again.anim}` });
  expect.soft(again.cls, 'tag pops once, not every time The Point mounts').not.toContain('dk-pop');
  await n.ctx.close();
  // Reduce Motion.
  const r = await openPoint(browser, f, 'Kid A', AT.invite, { reduced: true });
  const tr = await tagInfo(r.page);
  expect.soft(tr.anim, 'reduced: tag simply appears').toBe('none');
  const still = await stillUnderReducedMotion(r.page);
  expect.soft(still.out, 'reduced: nothing animates or transitions on The Point').toEqual([]);
  expect.soft(still.running, 'reduced: running animations').toBe(0);
  await r.ctx.close();
  // Focus volume, motion allowed.
  volume(f, 'Kid A', 'focus');
  const fo = await openPoint(browser, f, 'Kid A', AT.invite, { reduced: false });
  const tf = await tagInfo(fo.page);
  expect.soft(tf.anim, 'focus: tag still').toBe('none');
  expect.soft(['none', 'matrix(1, 0, 0, 1, 0, 0)'], 'focus: tag straight').toContain(tf.transform);
  await volumeRules(fo.page, 'focus invite', 'focus', 'rgb(41, 211, 255)');
  await snap(fo.page, OUT, 'dock-tag-focus');
  await fo.ctx.close();
  volume(f, 'Kid A', 'normal');
  // Session mode: Home, Session, Wave Check, and the tag still shows while the moment is open.
  setMode(f, 'Kid A', 'session');
  const s = await openPoint(browser, f, 'Kid A', AT.invite);
  await dockRules(s.page, 'session mode', { active: 'home', want: ['home', 'session', 'wave_check'] });
  await expect.soft(s.page.getByTestId('dock-wave_check').locator('.dk-dock__tag--checkin')).toHaveCount(1);
  await s.ctx.close();
  // Session switched off by the family: the pick drops off the dock in Everything mode.
  setMode(f, 'Kid A', 'everything');
  sql(`update public.family_modules set enabled = false where family_id = ${lit(f.parent.familyId)} and module_key = 'session'`);
  const o = await openPoint(browser, f, 'Kid A', AT.invite);
  await dockRules(o.page, 'session off', { active: 'home', want: ['home', 'my_week', 'wave_check'] });
  await o.ctx.close();
});

test('Not now rests until the next moment, per kid, and survives a reload; the next moment invites again', async ({ browser }) => {
  for (const kid of ['Kid A', 'Kid B']) {
    seedWeek(f, kid, { moments: [['Home from school', '15:00'], ['Dinner time', '18:00']] });
    doneSteps(f, kid, f.r.dawn, ['teeth', 'dress', 'breakfast']);
    doneSteps(f, kid, f.r.after, ['hands', 'snack']);
  }
  const { ctx, page } = await openPoint(browser, f, 'Kid A', AT.invite);
  await page.getByTestId('wave-prompt').getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByTestId('wave-prompt')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await expect.soft(page.getByTestId('wave-prompt'), 'rests after reload').toHaveCount(0);
  // The next moment opens: the invite is back (no escalation: same card, same tag).
  await moveClock(page, AT.evening2);
  await page.reload();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await expect.soft(page.getByTestId('wave-prompt'), 'the next moment invites').toContainText('Dinner time. Check in?');
  await expect.soft(page.getByTestId('dock-wave_check').locator('.dk-dock__tag--checkin')).toHaveText('Check in');
  await snap(page, OUT, 'invite-second-moment-reader');
  // Kid B on the same iPad was never told Not now: switch riders.
  await moveClock(page, AT.invite);
  await page.locator('.dk-head-avatar').first().click();
  await page.getByTestId('pick-kid').nth(1).click();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await expect(page.getByTestId('point-still')).toHaveCount(0, { timeout: 6000 });
  await expect.soft(page.getByTestId('wave-prompt'), 'Kid B still invited').toBeVisible();
  // Pre-reader: Not now with the speaker; Wave Check speaks.
  await page.getByTestId('wave-prompt').getByRole('button', { name: /Wave Check/ }).click();
  await expect(page).toHaveURL(/\/wave$/);
  const said = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect.soft(said, 'pre-reader hears the invite').toContain('How\'s your wave?');
  await ctx.close();
});

test('reload mid-flow: after Keep going, mid-routine, and in Wave Check opened from the invite; nothing half-saved', async ({ browser }) => {
  test.setTimeout(120_000);
  doneSteps(f, 'Kid A', f.r.dawn, ['teeth']);
  const { ctx, page } = await openPoint(browser, f, 'Kid A', AT.dawn);
  await page.getByRole('button', { name: /Keep going/ }).click();
  await expect(page.getByTestId('step-text')).toHaveText('Get dressed');
  await page.reload();
  await expect.soft(page.getByTestId('step-text'), 'after Keep going + reload').toHaveText('Get dressed');
  await exits(page, 'routine (task screen)');
  await kidRules(page, 'routine reader', MIN.reader);
  await page.getByRole('button', { name: 'I did it!' }).click();
  await expect(page.getByTestId('step-text')).toHaveText('Eat breakfast');
  await page.reload();
  await expect.soft(page.getByTestId('step-text'), 'mid-routine reload').toHaveText('Eat breakfast');
  const [row] = sql(`select array_to_string(completed_steps, ',') from public.routine_completions where kid_id = ${lit(f.ids['Kid A']!)} and routine_id = ${lit(f.r.dawn)}`);
  expect.soft(row, 'saved steps').toBe('teeth,dress');
  await home(page).click();
  await expect(page.getByTestId('the-point')).toBeVisible();
  await expect.soft(page.getByTestId('right-now')).toContainText('2 of 3 done');
  await expect.soft(page.getByTestId('sticker-slot').first()).toContainText('1 step to go');
  await ctx.close();

  // Wave Check from the invite: pick a feeling, reload before the size; nothing saved.
  resetPoint(f);
  doneSteps(f, 'Kid A', f.r.dawn, ['teeth', 'dress', 'breakfast']);
  const w = await openPoint(browser, f, 'Kid A', AT.invite);
  await w.page.getByTestId('wave-prompt').getByRole('button', { name: /Wave Check/ }).click();
  await expect(w.page).toHaveURL(/\/wave$/);
  await exits(w.page, 'Wave Check');
  await w.page.getByTestId('feeling-rolling').click();
  await w.page.reload();
  await expect(w.page.locator('main[data-audience="kid"]').first()).toBeVisible();
  await snap(w.page, OUT, 'wave-reload-mid-checkin');
  const [count] = sql(`select count(*) from public.feelings_checkins where kid_id = ${lit(f.ids['Kid A']!)}`);
  expect.soft(count, 'no half check-in saved').toBe('0');
  await home(w.page).click();
  await expect.soft(w.page.getByTestId('wave-prompt'), 'invite still open after an unfinished Wave Check').toBeVisible();
  await w.ctx.close();
});

test('a focus-default kid finishes a routine from The Point: focus Point, normal-styling celebration, back home with the slot settled', async ({ browser }) => {
  volume(f, 'Kid B', 'focus');
  doneSteps(f, 'Kid B', f.r.dawn, ['teeth', 'dress']);
  const { ctx, page } = await openPoint(browser, f, 'Kid B', AT.dawn, { reduced: false });
  expect(await page.evaluate(() => document.documentElement.dataset.volume)).toBe('focus');
  await page.getByRole('button', { name: /Keep going/ }).click();
  await page.getByRole('button', { name: 'I did it!' }).click();
  const cel = page.locator('.home__celebrate');
  await expect(cel).toBeVisible();
  expect.soft(await cel.getAttribute('data-volume'), 'celebration volume for a focus-default kid').toBe('normal');
  await expect.soft(page.locator('nav.dk-dock'), 'no dock on a celebration').toHaveCount(0);
  await snap(page, OUT, 'celebration-focus-default-prereader');
  // Reload during the celebration.
  await page.reload();
  await expect(page.locator('main[data-audience="kid"]').first()).toBeVisible();
  await snap(page, OUT, 'celebration-after-reload');
  test.info().annotations.push({ type: 'reload in celebration', description: `${page.url()} :: ${(await page.locator('main').first().innerText()).replace(/\s+/g, ' ').slice(0, 160)}` });
  await page.goto(`/kid/${f.ids['Kid B']}`);
  await expect(page.getByTestId('the-point')).toBeVisible();
  const kinds = await page.getByTestId('sticker-slot').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  test.info().annotations.push({ type: 'slots after finishing', description: kinds.join(',') });
  expect.soft(kinds[0], 'the finished routine no longer shows ?').not.toBe('next');
  await ctx.close();
});

test("Today's stickers: earned, pick waiting, ? and later; pre-reader circles; focus untilts; no red, nothing missed", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const kid of ['Kid A', 'Kid B']) {
    doneSteps(f, kid, f.r.dawn, ['teeth', 'dress', 'breakfast']);
    awardToday(f, kid, f.r.dawn, 'school-bus');
    doneSteps(f, kid, f.r.after, ['hands', 'snack']);
    awardToday(f, kid, f.r.after, null);
  }
  for (const kid of ['Kid A', 'Kid B'] as const) {
    const age = kid === 'Kid A' ? 'reader' : 'prereader';
    for (const v of ['normal', 'focus'] as const) {
      volume(f, kid, v);
      for (const [orient, viewport] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
        const where = `stickers ${kid} ${orient} ${v}`;
        const { ctx, page } = await openPoint(browser, f, kid, AT.lastRun, { viewport });
        const slots = page.getByTestId('sticker-slot');
        expect.soft(await slots.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind'))), where).toEqual(['earned', 'pick', 'next']);
        if (age === 'reader') {
          await expect.soft(slots.nth(1), `${where}: pick`).toContainText('Pick one!');
          await expect.soft(slots.nth(2), `${where}: next`).toContainText('2 steps to go');
        }
        expect.soft(await reds(page), `${where}: red`).toEqual([]);
        await expect.soft(page.getByTestId('the-point'), `${where}: missed`).not.toContainText(/\bmissed\b|\blate\b|didn.t/i);
        await kidRules(page, where, MIN[age], 'night');
        if (v === 'focus') await volumeRules(page, where, 'focus');
        await snap(page, OUT, `stickers-${age}-${orient}-${v}`);
        await ctx.close();
      }
    }
    volume(f, kid, 'normal');
  }
});

test('pre-reader: from The Point, can a later routine be started (reader slots open it)?', async ({ browser }) => {
  doneSteps(f, 'Kid B', f.r.dawn, ['teeth', 'dress', 'breakfast']);
  const { ctx, page } = await openPoint(browser, f, 'Kid B', AT.noon);
  await expect(page.getByTestId('right-now')).toHaveAttribute('data-state', 'upcoming');
  const tappable = await page.getByTestId('sticker-slot').evaluateAll((els) => els.map((e) => e.tagName.toLowerCase() + (e.closest('button') ? ' in ' + e.closest('button')!.getAttribute('data-testid') : '')));
  test.info().annotations.push({ type: 'pre-reader slot elements', description: tappable.join(' | ') });
  await page.getByTestId('sticker-slot').nth(1).click();
  const url = page.url();
  test.info().annotations.push({ type: 'pre-reader slot tap goes to', description: url });
  expect.soft(url, 'a pre-reader sticker circle opens its routine (as a reader slot does)').toMatch(new RegExp(`/routine/${f.r.after}$`));
  await ctx.close();
});

test('every screen The Point opens has the dock, one active item, Wave Check, and Home one tap away', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const kid of ['Kid A', 'Kid B'] as const) {
    const age = kid === 'Kid A' ? 'reader' : 'prereader';
    doneSteps(f, kid, f.r.dawn, ['teeth']);
    const { ctx, page } = await openPoint(browser, f, kid, AT.dawn);
    const visits: [string, () => Promise<void>, string | undefined][] = [
      ['routine', () => page.getByRole('button', { name: /Keep going/ }).click(), 'home'],
      ['my week', () => page.getByTestId('my-week-card').click(), 'my_week'],
      ['tour dates', () => page.getByTestId('card-countdown').click(), 'home'],
      ['wave check', () => page.getByTestId('dock-wave_check').click(), 'wave_check'],
    ];
    for (const [name, go, active] of visits) {
      await go();
      await expect(page.getByTestId('the-point')).toHaveCount(0);
      const where = `${kid} ${name}`;
      if (await page.locator('nav.dk-dock').count()) await dockRules(page, where, { active });
      else await exits(page, where);
      await kidRules(page, where, MIN[age]);
      await snap(page, OUT, `opened-${name.replace(' ', '-')}-${age}`);
      await home(page).click();
      await expect(page.getByTestId('the-point'), `${where}: Home in one tap`).toBeVisible();
    }
    await ctx.close();
  }
});

test('motion: without Reduce Motion at most one thing idles at a time; the hero settles; with Reduce Motion nothing moves (morning still too)', async ({ browser }) => {
  test.setTimeout(120_000);
  sql(`delete from public.checkin_moments where kid_id = ${lit(f.ids['Kid A']!)}`);
  doneSteps(f, 'Kid A', f.r.dawn, ['teeth', 'dress', 'breakfast']);
  const { ctx, page } = await openPoint(browser, f, 'Kid A', AT.noon, { reduced: false });
  let maxMoving = 0;
  let maxAnims = 0;
  for (let t = 0; t < 30_000; t += 100) {
    await page.clock.runFor(100);
    const m = await page.evaluate(() => ({ moving: document.querySelectorAll('[data-moving="true"]').length, anims: document.getAnimations().filter((a) => a.playState === 'running').length }));
    maxMoving = Math.max(maxMoving, m.moving);
    maxAnims = Math.max(maxAnims, m.anims);
  }
  expect.soft(maxMoving, 'never two idling at once').toBeLessThanOrEqual(1);
  test.info().annotations.push({ type: 'max running animations', description: String(maxAnims) });
  await ctx.close();
  // Reduce Motion, the morning still in the slot: a still, its text, nothing moving.
  const r = await openPoint(browser, f, 'Kid A', AT.dawn, { reduced: true, keepStill: true });
  await expect(r.page.getByTestId('point-still')).toBeVisible();
  await expect(r.page.getByTestId('point-still')).toContainText('Good morning');
  const st = await stillUnderReducedMotion(r.page);
  expect.soft(st.out, 'reduced: morning still').toEqual([]);
  expect.soft(st.running, 'reduced: running animations').toBe(0);
  await snap(r.page, OUT, 'still-morning-reduced');
  await r.ctx.close();
});

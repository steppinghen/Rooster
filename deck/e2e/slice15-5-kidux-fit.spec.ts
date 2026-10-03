import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { lit, sql } from './helpers/db';
import { composite, loadFrame } from './helpers/frames';
import { coveredControls, liveKidPage, overlapsOf, setFocus } from './helpers/focusqa';
import { ACCENT_RGB, kidRules, liveZone, setGround, setMode, volumeRules } from './helpers/kidqa';
import { AT, LANDSCAPE, MIN, PORTRAIT, blockOverlaps, dockRules, doneSteps, fitReport, moduleSwitch, openPoint, pointFamily, primaryAboveFold, resetPoint, seedWeek, snap, volume, type PointFam } from './helpers/pointqa';

// kid-ux-tester, Phase 1.5 slice 5 (The Point, B2): fit and rules for every Right now state,
// not only the running routine; the heads-up banner on The Point; three kids; My week.
const OUT = 'review/screenshots/phase15-slice5-kidux';
mkdirSync(`${OUT}/compare`, { recursive: true });

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'viewports set per context'));

let f: PointFam;
test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'ipad') return;
  f = await pointFamily({ three: true });
});
test.beforeEach(() => f && resetPoint(f));

type State = 'routine' | 'invite' | 'upcoming' | 'done' | 'free' | 'session' | 'lastrun';
const STATES: { state: State; at: string; testid: string; dataState?: string; focusToo?: boolean; setup: (kid: string) => void }[] = [
  { state: 'routine', at: AT.dawn, testid: 'right-now', dataState: 'routine', setup: (k) => doneSteps(f, k, f.r.dawn, ['teeth']) },
  { state: 'invite', at: AT.invite, testid: 'wave-prompt', dataState: 'wave', focusToo: true, setup: (k) => doneSteps(f, k, f.r.dawn, ['teeth', 'dress', 'breakfast']) },
  { state: 'upcoming', at: AT.noon, testid: 'right-now', dataState: 'upcoming', focusToo: true, setup: (k) => doneSteps(f, k, f.r.dawn, ['teeth', 'dress', 'breakfast']) },
  {
    state: 'done',
    at: AT.late,
    testid: 'right-now',
    dataState: 'done',
    focusToo: true,
    setup: (k) => {
      seedWeek(f, k, { moments: [] });
      doneSteps(f, k, f.r.dawn, ['teeth', 'dress', 'breakfast']);
      doneSteps(f, k, f.r.after, ['hands', 'snack']);
      doneSteps(f, k, f.r.last, ['pjs', 'teeth']);
    },
  },
  {
    state: 'free',
    at: AT.noon,
    testid: 'right-now',
    dataState: 'free',
    setup: (k) => {
      seedWeek(f, k, { moments: [] });
      moduleSwitch(f, 'routines', false);
    },
  },
  { state: 'session', at: AT.after, testid: 'session-home', dataState: 'session', setup: (k) => setMode(f, k, 'session') },
  {
    state: 'lastrun',
    at: AT.lastRun,
    testid: 'right-now',
    dataState: 'routine',
    setup: (k) => {
      seedWeek(f, k, { moments: [] });
      doneSteps(f, k, f.r.dawn, ['teeth', 'dress', 'breakfast']);
      doneSteps(f, k, f.r.after, ['hands', 'snack']);
    },
  },
];

for (const s of STATES) {
  test(`fit: Right now "${s.state}" on both bands, both orientations, day and night${s.focusToo ? ', normal and focus' : ''}`, async ({ browser }) => {
    test.setTimeout(240_000);
    for (const kid of ['Kid A', 'Kid B'] as const) {
      const age = kid === 'Kid A' ? 'reader' : 'prereader';
      resetPoint(f);
      s.setup(kid);
      for (const v of s.focusToo ? (['normal', 'focus'] as const) : (['normal'] as const)) {
        volume(f, kid, v);
        for (const ground of ['day', 'night'] as const) {
          setGround(f, ground);
          for (const [orient, viewport] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
            const where = `${s.state} ${kid} ${age} ${orient} ${ground} ${v}`;
            const { ctx, page } = await openPoint(browser, f, kid, s.at, { viewport, colorScheme: ground === 'day' ? 'light' : 'dark' });
            const hero = page.getByTestId(s.testid);
            await expect(hero, where).toBeVisible();
            if (s.dataState) await expect.soft(hero, where).toHaveAttribute('data-state', s.dataState);
            // Last Run is always night, whatever the device's ground setting; once it has started
            // (and after it's done) The Point is in the Last Run scene: night and focus volume.
            const lastRunScene = s.state === 'lastrun' || s.state === 'done';
            await kidRules(page, where, MIN[age], lastRunScene ? 'night' : ground);
            const fit = await fitReport(page);
            expect.soft(fit.out, `${where}: content under the dock or off screen`).toEqual([]);
            expect.soft(fit.bodyOverflow, `${where}: body content overflows its box`).toBeLessThanOrEqual(1);
            expect.soft(await blockOverlaps(page), `${where}: blocks overlap`).toEqual([]);
            expect.soft(await coveredControls(page), `${where}: covered controls`).toEqual([]);
            await primaryAboveFold(page, where);
            await dockRules(page, where, { active: 'home', want: s.state === 'session' ? ['home', 'session', 'wave_check'] : ['home', 'my_week', 'wave_check'] });
            const vol = await page.evaluate(() => document.documentElement.dataset.volume);
            if (s.state === 'session' || v === 'focus' || lastRunScene) {
              expect.soft(vol, `${where}: volume`).toBe('focus');
              await volumeRules(page, where, 'focus', ACCENT_RGB[kid === 'Kid A' ? 'cyan' : 'magenta']);
            } else {
              expect.soft(vol, `${where}: volume`).toBe('normal');
              await volumeRules(page, where, 'normal');
            }
            await snap(page, OUT, `point-${s.state}-${age}-${orient}-${ground}-${v}`);
            await ctx.close();
          }
        }
      }
      volume(f, kid, 'normal');
    }
  });
}

test('hidden modules: in Session mode the cards and My week that lead to hidden modules are not on The Point', async ({ browser }) => {
  test.setTimeout(150_000);
  setMode(f, 'Kid A', 'session');
  setMode(f, 'Kid B', 'session');
  for (const kid of ['Kid A', 'Kid B']) {
    const { ctx, page } = await openPoint(browser, f, kid, AT.after);
    await expect(page.getByTestId('session-home')).toBeVisible();
    await snap(page, OUT, `hidden-session-mode-${kid.replace(' ', '')}`);
    // Tour Dates is hidden in Session mode (module_catalog visible_in = {everything}).
    await expect.soft(page.getByTestId('card-countdown'), `${kid}: Tour Dates card in Session mode`).toHaveCount(0);
    await expect.soft(page.getByTestId('the-point'), `${kid}: names Tour Dates in Session mode`).not.toContainText(/Tour Dates|sleeps?\b/);
    // My week is off the Session dock, and its route redirects; a card that opens it is a dead tap.
    const week = page.getByTestId('my-week-card');
    if (await week.count()) {
      await week.click();
      const stayed = await page.getByTestId('my-week').count();
      expect.soft(stayed, `${kid}: the My week card goes somewhere in Session mode`).toBe(1);
    }
    await ctx.close();
  }
  // Family switch off: Tour Dates.
  resetPoint(f);
  moduleSwitch(f, 'tour_dates', false);
  const { ctx, page } = await openPoint(browser, f, 'Kid A', AT.dawn);
  await expect.soft(page.getByTestId('card-countdown'), 'Tour Dates switched off: card').toHaveCount(0);
  await expect.soft(page.getByTestId('the-point'), 'Tour Dates switched off: named').not.toContainText(/Tour Dates|Countdowns/);
  await snap(page, OUT, 'hidden-tour-dates-off-reader');
  await ctx.close();
});

test('heads-up banner on The Point: above the dock, covers nothing, nothing below the fold (both bands, both orientations)', async ({ browser }) => {
  test.setTimeout(240_000);
  const zone = liveZone();
  sql(`update public.families set timezone = ${lit(zone)} where id = ${lit(f.parent.familyId)};`);
  try {
    for (const kid of ['Kid A', 'Kid B'] as const) {
      const age = kid === 'Kid A' ? 'reader' : 'prereader';
      for (const [orient, viewport] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
        for (const state of ['plain', 'invite'] as const) {
          resetPoint(f);
          sql(`update public.families set timezone = ${lit(zone)} where id = ${lit(f.parent.familyId)};`);
          // A moment that opened an hour ago (invite) or none.
          sql(`delete from public.checkin_moments where kid_id = ${lit(f.ids[kid]!)};`);
          if (state === 'invite') sql(`insert into public.checkin_moments (family_id, kid_id, label, at_time) values (${lit(f.parent.familyId)}, ${lit(f.ids[kid]!)}, 'Lunch', (now() at time zone ${lit(zone)} - interval '1 hour')::time)`);
          setFocus(f, kid, { mode: 'everything', pending: 'session', switchIn: 110 });
          const where = `heads-up ${state} ${kid} ${age} ${orient}`;
          const { ctx, page } = await liveKidPage(browser, f, kid, { viewport, reduced: true, ground: 'day', colorScheme: 'light' });
          await expect(page.getByTestId('the-point')).toBeVisible();
          await expect(page.getByTestId('point-still')).toHaveCount(0, { timeout: 6000 });
          const hu = page.getByTestId('heads-up');
          await expect(hu, where).toBeVisible({ timeout: 8000 });
          const hb = (await hu.boundingBox())!;
          const db = (await page.locator('nav.dk-dock').boundingBox())!;
          expect.soft(hb.y + hb.height, `${where}: banner above the dock`).toBeLessThanOrEqual(db.y + 0.5);
          expect.soft(hb.y, `${where}: banner on screen`).toBeGreaterThanOrEqual(0);
          expect.soft(await overlapsOf(page, '[data-testid="heads-up"]'), `${where}: content under the banner`).toEqual([]);
          expect.soft(await coveredControls(page), `${where}: covered controls`).toEqual([]);
          const fit = await fitReport(page);
          expect.soft(fit.out, `${where}: content under the dock or off screen`).toEqual([]);
          await primaryAboveFold(page, where);
          await kidRules(page, where, MIN[age]);
          await dockRules(page, where, { active: 'home' });
          await snap(page, OUT, `headsup-${state}-${age}-${orient}`);
          await ctx.close();
        }
      }
    }
  } finally {
    sql(`update public.families set timezone = 'America/New_York' where id = ${lit(f.parent.familyId)};`);
  }
});

test('three kids: the picker and each kid’s Point fit in both orientations; nothing compares siblings', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const kid of ['Kid A', 'Kid B', 'Kid C'] as const) doneSteps(f, kid, f.r.dawn, ['teeth']);
  for (const [orient, viewport] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
    for (const ground of ['day', 'night'] as const) {
      setGround(f, ground);
      // The picker, the way back from The Point's avatar.
      const p = await openPoint(browser, f, 'Kid C', AT.dawn, { viewport, colorScheme: ground === 'day' ? 'light' : 'dark' });
      await p.page.locator('.dk-head-avatar').first().click();
      await expect(p.page.getByTestId('pick-kid')).toHaveCount(3);
      await kidRules(p.page, `picker 3 kids ${orient} ${ground}`, MIN.prereader, ground);
      await snap(p.page, OUT, `picker-3kids-${orient}-${ground}`);
      await p.page.getByTestId('pick-kid').nth(2).click();
      await expect(p.page.getByTestId('the-point')).toBeVisible();
      await expect(p.page.getByTestId('point-still')).toHaveCount(0, { timeout: 6000 });
      const where = `Kid C (reader, lime) ${orient} ${ground}`;
      await kidRules(p.page, where, MIN.reader, ground);
      expect.soft((await fitReport(p.page)).out, `${where}: fit`).toEqual([]);
      await dockRules(p.page, where, { active: 'home' });
      await expect.soft(p.page.getByTestId('the-point'), `${where}: siblings`).not.toContainText(/Kid A|Kid B/);
      await snap(p.page, OUT, `point-3kids-kidC-${orient}-${ground}`);
      await p.ctx.close();
    }
  }
});

test('My week: both bands, both orientations, day and night, normal and focus; dock, fit, targets, volume', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const kid of ['Kid A', 'Kid B'] as const) {
    const age = kid === 'Kid A' ? 'reader' : 'prereader';
    for (const v of ['normal', 'focus'] as const) {
      volume(f, kid, v);
      for (const ground of ['day', 'night'] as const) {
        setGround(f, ground);
        for (const [orient, viewport] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
          const where = `My week ${kid} ${age} ${orient} ${ground} ${v}`;
          const { ctx, page } = await openPoint(browser, f, kid, AT.invite, { viewport, path: '/week', colorScheme: ground === 'day' ? 'light' : 'dark' });
          await expect(page.getByTestId('my-week'), where).toBeVisible();
          await kidRules(page, where, MIN[age], ground);
          expect.soft((await fitReport(page)).out, `${where}: fit`).toEqual([]);
          await dockRules(page, where, { active: 'my_week', want: ['home', 'my_week', 'wave_check'] });
          await volumeRules(page, where, v, v === 'focus' ? ACCENT_RGB[kid === 'Kid A' ? 'cyan' : 'magenta'] : undefined);
          // The check-in moment is open: the tag is on My week's dock too.
          await expect.soft(page.getByTestId('dock-wave_check').locator('.dk-dock__tag--checkin'), `${where}: check-in tag`).toHaveCount(1);
          await snap(page, OUT, `myweek-${age}-${orient}-${ground}-${v}`);
          await ctx.close();
        }
      }
    }
    volume(f, kid, 'normal');
  }
});

test('B2 side by side (kidux): app at day next to each frame', async ({ browser }) => {
  test.setTimeout(180_000);
  doneSteps(f, 'Kid A', f.r.dawn, ['teeth']);
  doneSteps(f, 'Kid B', f.r.dawn, ['teeth']);
  setGround(f, 'day');
  const cases = [
    { kid: 'Kid A', viewport: PORTRAIT, frame: 'Phase15PointB2.dc.html' },
    { kid: 'Kid A', viewport: LANDSCAPE, frame: 'Phase15PointB2Land.dc.html' },
    { kid: 'Kid A', viewport: PORTRAIT, frame: 'Phase15PointB2Focus.dc.html', focus: true },
    { kid: 'Kid B', viewport: LANDSCAPE, frame: 'Phase15PointB2Pre.dc.html' },
    { kid: 'Kid B', viewport: LANDSCAPE, frame: 'Phase15PointB2PreFocus.dc.html', focus: true },
  ];
  for (const c of cases) {
    volume(f, c.kid, c.focus ? 'focus' : 'normal');
    const { ctx, page } = await openPoint(browser, f, c.kid, AT.dawn, { viewport: c.viewport, colorScheme: 'light' });
    const app = await snap(page, OUT, `compare-app-${c.frame.replace('.dc.html', '')}`);
    const fctx = await browser.newContext({ viewport: c.viewport });
    const fp = await fctx.newPage();
    const fr = await (await loadFrame(fp, c.frame, { markers: 'None' })).screenshot();
    await composite(fp, `${OUT}/compare/${c.frame.replace('.dc.html', '')}.png`, [{ label: `APP ${c.kid} (day)`, png: app }, { label: `FRAME ${c.frame}`, png: fr }], c.viewport.height === 1180 ? 1000 : 700);
    await fctx.close();
    await ctx.close();
    volume(f, c.kid, 'normal');
  }
});

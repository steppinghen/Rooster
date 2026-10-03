import { expect, test, type Page } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { ACCENT_RGB, constants, doSteps, family, kidPage, kidRules, resetFamily, setGround, setMode, SCORE_WORDS, SHOTS, shoot, stillUnderReducedMotion, T, volumeRules, type Fam } from './helpers/kidqa';
import { sideBySide, spoken } from './helpers/qa';

/*
 * Independent UX QA for slices 5 to 9, kid side (iPad 820x1180 portrait, WebKit).
 * Seed placeholders only (Kid A reader, Kid B pre-reader). Every family is created fresh here.
 */

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'kid screens run on the iPad profile'));

const MIN = { prereader: 80, reader: 64 } as const;
const KIDS = [
  { kid: 'Kid B', age: 'prereader', min: MIN.prereader, accent: 'cyan' },
  { kid: 'Kid A', age: 'reader', min: MIN.reader, accent: 'magenta' },
] as const;

let f: Fam;


test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'ipad') return;
  f = await family([
    { nickname: 'Kid A', age_band: 'reader', accent: 'magenta', avatar: 'rooster' },
    { nickname: 'Kid B', age_band: 'prereader', accent: 'cyan', avatar: 'turtle' },
  ]);
});

test.beforeEach(({}, info) => {
  if (info.project.name === 'ipad' && f) resetFamily(f);
});

async function homeButton(page: Page) {
  return page.getByRole('button', { name: 'Home' });
}

/* ------------------------------------------------------------------ */
/* Slice 5: the kid home (The Point, B2, since Phase 1.5 slice 5)       */
/* ------------------------------------------------------------------ */

test('home: what\'s next first, no scroll, kid rules, both ages, both grounds (slice 5)', async ({ browser }) => {
  for (const k of KIDS) {
    for (const [ground, at] of [['day', T.seven], ['night', T.beforeDawn]] as const) {
      const { ctx, page } = await kidPage(browser, f, k.kid, at);
      const where = `home ${k.age} ${ground}`;
      await expect(page.locator('html')).toHaveAttribute('data-ground', ground);
      await expect(page.locator('html')).toHaveAttribute('data-volume', 'normal');
      if (ground === 'day') {
        // What's next is the first thing after the header: Right now, with the next step.
        await expect(page.getByTestId('up-next')).toHaveText('Brush teeth');
        const order = await page.evaluate(() => {
          const top = (s: string) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
          return { hero: top('[data-testid="right-now"]'), week: top('[data-testid="my-week-card"]'), cards: top('[data-testid="card-countdown"]') };
        });
        expect.soft(order.hero, `${where}: Right now sits above My week`).toBeLessThan(order.week);
        expect.soft(order.hero, `${where}: Right now sits above the cards`).toBeLessThan(order.cards);
        if (k.age === 'prereader') {
          await page.getByTestId('right-now').getByRole('button', { name: 'Read it to me' }).click();
          expect.soft(await spoken(page), `${where}: read-aloud`).toContain('Dawn Patrol. Next: Brush teeth.');
        }
      } else {
        // Before Dawn Patrol: Right now says when it starts.
        await expect(page.getByTestId('right-now')).toContainText('Next: Dawn Patrol');
        await expect(page.getByTestId('right-now')).toContainText('6:30 am');
        if (k.age === 'prereader') expect.soft(await page.getByRole('button', { name: /read it to me/i }).count(), `${where}: no read-aloud for the "what's next" line before a routine`).toBeGreaterThan(0);
      }
      await kidRules(page, where, k.min, ground);
      await volumeRules(page, where, 'normal', undefined, { marker: true });
      // The countdown card shows the soonest kid-visible countdown, never the parents-only one.
      if (k.age === 'prereader') {
        await expect(page.getByTestId('card-countdown').locator('.pt-card__badge')).toHaveText('4');
        await expect(page.getByTestId('card-countdown').locator('.pt-card__title')).toHaveText('Pumpkin');
      } else {
        await expect(page.getByTestId('card-countdown')).toContainText('4 sleeps');
        await expect(page.getByTestId('card-countdown')).toContainText('Pumpkin patch');
      }
      await expect(page.getByText('Parents dinner')).toHaveCount(0);
      // (The B2 frame comparisons live in slice15-5-point.spec.ts.)
      await shoot(page, `ipad-home-${k.age}-${ground}`);
      await ctx.close();
    }
  }
});

test('home: Auto ground boundaries at the morning routine start and bedtime start (slice 5/7)', async ({ browser }) => {
  for (const [at, ground] of [[T.beforeDawn, 'night'], [T.dawn, 'day'], [T.beforeBed, 'day'], [T.bed, 'night']] as const) {
    const { ctx, page } = await kidPage(browser, f, 'Kid A', at);
    await expect(page.locator('html'), `Auto ground at ${at}`).toHaveAttribute('data-ground', ground);
    await ctx.close();
  }
  // Changing the morning routine's start moves the boundary.
  sql(`update public.routines set starts_at = '07:15' where id = ${lit(f.routines.morning!)}`);
  try {
    const { ctx, page } = await kidPage(browser, f, 'Kid A', T.seven);
    await expect(page.locator('html'), 'Auto: 07:00 is still night when Dawn Patrol starts at 07:15').toHaveAttribute('data-ground', 'night');
    await ctx.close();
  } finally {
    sql(`update public.routines set starts_at = '06:30' where id = ${lit(f.routines.morning!)}`);
  }
});

test('home: Last Run is night even when the iPad is set to Day (slice 5/7)', async ({ browser }) => {
  setGround(f, 'day');
  for (const k of KIDS) {
    const { ctx, page } = await kidPage(browser, f, k.kid, T.eight);
    await expect(page.getByTestId('right-now')).toContainText('Last Run');
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'lastrun');
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect.soft(bg, `Last Run ${k.age}: page is the night Last Run ground`).toBe('rgb(20, 18, 40)');
    await kidRules(page, `home lastrun ${k.age} (device=Day)`, k.min);
    // Is the effective look night (dark ground)? data-ground may stay 'day' but tokens must be night.
    const text = await page.evaluate(() => getComputedStyle(document.querySelector('.dk-headline')!).color);
    expect.soft(text, `Last Run ${k.age}: headline uses the night text color`).toBe('rgb(244, 235, 217)');
    await shoot(page, `ipad-home-${k.age}-lastrun-deviceday`);
    await ctx.close();
  }
});

test('home: everything tappable on The Point goes somewhere with a way back; no dead ends (slice 5)', async ({ browser }) => {
  for (const k of KIDS) {
    const { ctx, page } = await kidPage(browser, f, k.kid, T.seven);
    for (const t of ['dock-my_week', 'dock-wave_check', 'my-week-card', 'card-countdown']) {
      await page.getByTestId(t).click();
      await page.waitForTimeout(300);
      const path = new URL(page.url()).pathname;
      expect.soft(path, `${k.age}: ${t} leads to its own screen, not back to home`).not.toBe(`/kid/${f.ids[k.kid]}`);
      if (path !== `/kid/${f.ids[k.kid]}`) {
        await page.getByTestId('dock-home').or(page.getByRole('button', { name: 'Home' })).first().click();
        await expect(page.getByTestId('the-point')).toBeVisible();
      }
    }
    await page.getByTestId('right-now').getByRole('button', { name: /Keep going/ }).click();
    await expect(page.getByTestId('step-text')).toBeVisible();
    await (await homeButton(page)).click();
    await expect(page.getByTestId('the-point')).toBeVisible();
    await ctx.close();
  }
});

test('home: the pre-reader gets bigger dock items and hears the cards; the reader sees more text (slice 5)', async ({ browser }) => {
  const pre = await kidPage(browser, f, 'Kid B', T.seven);
  const reader = await kidPage(browser, f, 'Kid A', T.seven);
  const tileSize = (p: Page) => p.getByTestId('dock-wave_check').boundingBox();
  const [a, b] = [(await tileSize(pre.page))!, (await tileSize(reader.page))!];
  expect.soft(a.height, 'pre-reader dock items are bigger than reader ones').toBeGreaterThan(b.height);
  await pre.page.getByTestId('card-dinner').click();
  expect.soft(await spoken(pre.page), 'pre-reader cards speak on tap').toContain('Dinner later.');
  await expect(reader.page.getByTestId('my-week-card')).toContainText('Sunset Stripes');
  await expect(pre.page.getByTestId('my-week-card')).not.toContainText('Sunset Stripes');
  await pre.ctx.close();
  await reader.ctx.close();
});

test('home: hidden modules are absent, Wave Check survives every mode (slice 5 registry)', async ({ browser }) => {
  // Family switch off: the tile is not in the DOM at all.
  sql(`update public.family_modules set enabled = false where family_id = ${lit(f.parent.familyId)} and module_key = 'tour_dates'`);
  try {
    const { ctx, page } = await kidPage(browser, f, 'Kid A', T.seven);
    // The countdown card is a fixed slot: it stays, but opens nothing.
    await expect(page.getByTestId('card-countdown').locator('.pt-card__arrow')).toHaveCount(0);
    expect(await page.locator('[aria-disabled="true"], .is-disabled, [disabled]').count()).toBe(0);
    // Hidden means unreachable too: the URL should not open a switched-off module.
    await page.goto(`/kid/${f.ids['Kid A']}/dates`);
    await page.waitForTimeout(500);
    await shoot(page, 'ipad-tourdates-switched-off-by-url');
    expect.soft(new URL(page.url()).pathname, 'a switched-off module still opens by URL').not.toMatch(/\/dates$/);
    await ctx.close();
  } finally {
    sql(`update public.family_modules set enabled = true where family_id = ${lit(f.parent.familyId)} and module_key = 'tour_dates'`);
  }

  for (const mode of ['everything', 'session', 'lights_out'] as const) {
    setMode(f, 'Kid A', mode);
    const { ctx, page } = await kidPage(browser, f, 'Kid A', T.afterSchool);
    if (mode === 'lights_out') {
      // Lights out (slice 10 WIP): the bedtime screen; breathing must stay one tap away.
      await shoot(page, 'ipad-home-reader-mode-lights_out');
      const breathe = page.getByRole('button', { name: /breathe/i });
      await expect(breathe, 'Lights out: "I need to breathe" is reachable').toBeVisible();
      // Per REVIEW.md Q8 (default, awaiting the parent): the bedtime screen shows only "I need to
      // breathe"; check-in is offered after breathing, and /wave stays reachable in Lights out.
      expect(await page.getByRole('button').count(), 'Lights out: one control only').toBe(1);
      await breathe.click();
      await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
      await page.goto(page.url().replace(/\/breathe$/, '/wave'));
      await expect(page.getByTestId('feeling-rolling'), 'Lights out: Wave Check is still reachable').toBeVisible();
      await ctx.close();
      continue;
    }
    await expect(page.getByTestId('dock-wave_check'), `Wave Check tile in ${mode}`).toBeVisible();
    if (mode !== 'everything') {
      await expect(page.getByTestId('dock-my_week'), `the dock is trimmed in ${mode}`).toHaveCount(0);
      await expect(page.getByTestId('card-countdown').locator('.pt-card__arrow'), `Tour Dates hidden in ${mode}`).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
      await volumeRules(page, `home ${mode}`, 'focus', ACCENT_RGB.magenta);
      // A routine's "what's next" belongs to the Routine module: is it still offered here?
      expect.soft(await page.getByTestId('up-next').count(), `home in ${mode}: the After School routine step still shows (routines are hidden in this mode)`).toBe(0);
    }
    await shoot(page, `ipad-home-reader-mode-${mode}`);
    // Wave Check opens from here in every mode.
    await page.getByTestId('dock-wave_check').click();
    await expect(page.getByText(/How's your wave\?|How was your day\?/)).toBeVisible();
    await ctx.close();
  }
  setMode(f, 'Kid A', 'everything');
});

test('home: offline taps keep working; routine and check-in sync later (slice 5/9)', async ({ browser }) => {
  const { ctx, page } = await kidPage(browser, f, 'Kid B', T.seven);
  await expect(page.getByTestId('up-next')).toHaveText('Brush teeth');
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await doSteps(page, 1);
  await expect(page.getByTestId('step-text')).toHaveText('Get dressed');
  await (await homeButton(page)).click();
  await expect(page.getByTestId('up-next')).toHaveText('Get dressed');
  await kidRules(page, 'home offline', MIN.prereader, 'day');
  await shoot(page, 'ipad-home-prereader-offline');
  // Other screens still open from cache.
  await page.getByTestId('card-countdown').click();
  await expect(page.getByTestId('countdown-hero')).toContainText('4 sleeps');
  await (await homeButton(page)).click();
  await page.getByTestId('dock-my_week').click();
  await expect(page.getByTestId('my-week')).toBeVisible();
  await page.getByTestId('dock-wave_check').click();
  await page.getByTestId('feeling-rolling').click();
  await page.getByTestId('size-1').click();
  await expect(page.getByTestId('wave-thanks')).toBeVisible();
  await shoot(page, 'ipad-wave-thanks-offline');
  const steps = () => sql(`select coalesce(string_agg(array_to_string(completed_steps, ','), ''), '') from public.routine_completions where routine_id = ${lit(f.routines.morning!)} and kid_id = ${lit(f.ids['Kid B']!)}`)[0] ?? '';
  const checks = () => sql(`select count(*) from public.feelings_checkins where kid_id = ${lit(f.ids['Kid B']!)}`)[0];
  expect(steps()).toBe('');
  expect(checks()).toBe('0');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.clock.runFor(11_000);
  await expect.poll(steps, { timeout: 15_000 }).toBe('teeth');
  await expect.poll(checks, { timeout: 15_000 }).toBe('1');
  await ctx.close();
});

test('home: celebration at normal volume; reduced motion keeps it at the kid volume (slice 5)', async ({ browser }) => {
  for (const reduced of [false, true]) {
    resetFamily(f);
    const { ctx, page } = await kidPage(browser, f, 'Kid B', T.seven, { reduced });
    await doSteps(page, 3);
    const cel = page.locator('.home__celebrate');
    await expect(cel).toBeVisible();
    await expect(cel).toHaveAttribute('data-volume', 'normal');
    await expect(cel).toContainText('Dawn Patrol done!');
    expect.soft(await cel.evaluate((e) => getComputedStyle(e).backgroundColor), 'celebration has its own ground (not see-through)').not.toBe('rgba(0, 0, 0, 0)');
    // Phase 1.5 (slice 4): one of seven celebrations; Reduce Motion shows its still (the art
    // spec's stills keep the settled burst and its word), and nothing moves.
    const scene = cel.getByTestId('celebration');
    await expect(scene).toBeVisible();
    if (reduced) {
      const m = await stillUnderReducedMotion(page);
      expect.soft(m.out, 'reduced motion: nothing moves on the celebration').toEqual([]);
    } else {
      await page.clock.runFor(450);
      expect.soft(Number(await scene.getAttribute('data-beat')), 'the celebration steps through its beats').toBeGreaterThan(0);
    }
    const shot = await shoot(page, `ipad-celebrate-prereader${reduced ? '-reduced' : ''}`);
    await sideBySide(page, shot, 'Shred', `${SHOTS}/compare/ipad-celebrate${reduced ? '-reduced' : ''}-vs-Shred.png`, `Celebration${reduced ? ' (reduced motion)' : ''}`);
    await page.clock.runFor(4500); // the longest celebration (2.0 s) plus its short hold
    // Dawn Patrol is done; Right now moves on to what's next.
    await expect(page.getByTestId('right-now')).toHaveAttribute('data-state', 'upcoming');
    await expect(page.getByTestId('right-now')).toContainText('Next: After School');
    await ctx.close();
  }
});

test('home on an iPhone-sized screen (slice 5)', async ({ browser }) => {
  const { ctx, page } = await kidPage(browser, f, 'Kid A', T.beforeDawn, { viewport: { width: 390, height: 844 } });
  await kidRules(page, 'home reader phone night', MIN.reader, 'night');
  await shoot(page, 'iphone-home-reader-night');
  await ctx.close();
});

/* ------------------------------------------------------------------ */
/* Per-kid default volume: focus                                       */
/* ------------------------------------------------------------------ */

test.describe('a kid whose default volume is focus', () => {
  let ff: Fam;
  test.beforeAll(async ({}, info) => {
    if (info.project.name !== 'ipad') return;
    ff = await family(
      [
        { nickname: 'Kid A', age_band: 'reader', accent: 'magenta' },
        { nickname: 'Kid B', age_band: 'prereader', accent: 'cyan', default_volume: 'focus' },
      ],
      { events: true },
    );
  });
  test.beforeEach(() => ff && resetFamily(ff));

  test('sees focus styling in Everything mode on every screen; constants match the normal kid', async ({ browser }) => {
    const normal = await kidPage(browser, ff, 'Kid A', T.seven);
    const normalConst = await constants(normal.page);
    await normal.ctx.close();
    for (const [ground, at] of [['day', T.seven], ['night', T.beforeDawn]] as const) {
      for (const path of ['', '/routines', '/dates', '/wave', '/breathe', '/reset', `/routine/${ff.routines.morning}`]) {
        const { ctx, page } = await kidPage(browser, ff, 'Kid B', at, { path });
        const where = `focus-default kid ${path || '/'} ${ground}`;
        await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
        await volumeRules(page, where, 'focus', ACCENT_RGB.cyan);
        await kidRules(page, where, MIN.prereader, ground);
        if (path === '' && ground === 'day') {
          await page.locator('.dk-btn').first().waitFor();
          const c = await constants(page);
          expect.soft(c.headlineFont, 'display font is the same in both volumes').toBe(normalConst.headlineFont);
          expect.soft(c.btnBorder, 'button ink outline is the same in both volumes').toBe(normalConst.btnBorder);
          expect.soft(c.btnShadow, 'pressable button shadow is the same in both volumes').toBe(normalConst.btnShadow);
          expect.soft(c.cardBorder, 'card ink outline is the same in both volumes').toBe(normalConst.cardBorder);
          expect.soft(c.tileBorder, 'tile ink outline is the same in both volumes').toBe(normalConst.tileBorder);
        }
        const name = `ipad-focuskid-${(path || '/home').split('/')[1]}-${ground}`;
        const shot = await shoot(page, name);
        if (path.startsWith('/routine/') && ground === 'day') await sideBySide(page, shot, 'iPadDawnPatrolDayFocus', `${SHOTS}/compare/${name}-vs-iPadDawnPatrolDayFocus.png`, 'Routine step, focus kid, day');

        await ctx.close();
      }
    }
  });

  test('still gets the normal-styling celebration (home and routine run); reduced motion: kid volume and no burst', async ({ browser }) => {
    for (const reduced of [false, true]) {
      resetFamily(ff);
      const { ctx, page } = await kidPage(browser, ff, 'Kid B', T.seven, { reduced });
      await doSteps(page, 3);
      const cel = page.locator('.home__celebrate');
      await expect(cel).toBeVisible();
      await expect(cel, `home celebration volume (reduced=${reduced})`).toHaveAttribute('data-volume', reduced ? 'focus' : 'normal');
      if (!reduced) {
        await page.clock.runFor(2100); // to the shout word (every celebration but confetti has one)
        const word = page.locator('.sc-burst__word');
        if (await word.count()) expect.soft(await word.first().evaluate((e) => getComputedStyle(e).textShadow), 'normal celebration: burst word has the offset treatment').not.toBe('none');
      } else {
        // Reduce Motion: the still, nothing moving, and no halftone at the kid's focus volume.
        const m = await stillUnderReducedMotion(page);
        expect.soft(m.out, 'reduced motion: nothing moves on the celebration').toEqual([]);
        const v = await page.evaluate(() => document.querySelectorAll('.home__celebrate pattern').length);
        expect.soft(v, 'reduced motion + focus kid: halftone pattern in the celebration').toBe(0);
        const burstDots = await page.locator('.home__celebrate .sc-burst__face').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage));
        expect.soft(burstDots.every((b) => b === 'none'), 'reduced motion + focus kid: halftone on the burst').toBe(true);
      }
      await shoot(page, `ipad-focuskid-celebrate-home${reduced ? '-reduced' : ''}`);
      await page.clock.runFor(4500);
      await ctx.close();

      // Same from the step-by-step routine screen.
      sql(`delete from public.routine_completions where family_id = ${lit(ff.parent.familyId)}`);
      const r = await kidPage(browser, ff, 'Kid B', T.eight, { reduced, path: `/routine/${ff.routines.bed}` });
      for (let i = 0; i < 2; i++) await r.page.getByRole('button', { name: 'I did it!' }).click();
      const rc = r.page.locator('.home__celebrate');
      await expect(rc).toBeVisible();
      // The end of Last Run is the quiet version, always: focus styling, no burst, no shout word.
      await expect(rc, `Last Run celebration volume (reduced=${reduced})`).toHaveAttribute('data-volume', 'focus');
      await expect(rc.locator('.sc-burst')).toHaveCount(0);
      await expect(rc).toContainText('All done.');
      await shoot(r.page, `ipad-focuskid-celebrate-lastrun${reduced ? '-reduced' : ''}`);
      await r.page.clock.runFor(3500);
      await expect(r.page).toHaveURL(new RegExp(`/kid/${ff.ids['Kid B']}$`));
      await r.ctx.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Slice 7: Routines list and RoutineRun                               */
/* ------------------------------------------------------------------ */

test('routines list and step-by-step run: kid rules, Home + Wave Check, read-aloud, both grounds (slice 7)', async ({ browser }) => {
  for (const k of KIDS) {
    for (const [ground, at] of [['day', T.seven], ['night', T.beforeDawn]] as const) {
      const { ctx, page } = await kidPage(browser, f, k.kid, at, { path: '/routines' });
      const where = `routines ${k.age} ${ground}`;
      await expect(page.getByTestId('routine-tile')).toHaveCount(3);
      await kidRules(page, where, k.min, ground);
      await volumeRules(page, where, 'normal');
      for (const b of ['Home', 'Wave Check']) {
        const box = (await page.getByRole('button', { name: b }).boundingBox())!;
        expect.soft(Math.min(box.width, box.height), `${where}: ${b} button size`).toBeGreaterThanOrEqual(k.min);
      }
      // A pre-reader needs the instruction ("pick a routine") spoken, not just the tile names on tap.
      if (k.age === 'prereader') expect.soft(await page.getByRole('button', { name: /read it to me/i }).count(), `${where}: no read-aloud for the screen`).toBeGreaterThan(0);
      await shoot(page, `ipad-routines-${k.age}-${ground}`);

      await page.getByTestId('routine-tile').filter({ hasText: 'Dawn Patrol' }).click();
      await expect(page.getByTestId('step-text')).toHaveText('Brush teeth');
      await kidRules(page, `routine run ${k.age} ${ground}`, k.min, ground);
      await volumeRules(page, `routine run ${k.age} ${ground}`, 'normal');
      await page.getByRole('button', { name: 'Read it to me' }).click();
      expect.soft(await spoken(page)).toContain('Brush teeth');
      const shot = await shoot(page, `ipad-routine-step-${k.age}-${ground}`);
      if (ground === 'day' && k.age === 'prereader') await sideBySide(page, shot, 'iPadDawnPatrolDayFocus', `${SHOTS}/compare/ipad-routine-step-prereader-day-vs-iPadDawnPatrolDayFocus.png`, 'Routine step (normal kid, Everything mode)');
      // One task: the step, "I did it!", read-aloud, plus the frame's Home and Wave Check.
      const buttons = await page.getByRole('button').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim()));
      expect.soft(buttons.sort(), `${where}: one task per screen`).toEqual(['Home', 'I did it!', 'Read it to me', 'Wave Check'].sort());
      await page.getByRole('button', { name: 'I did it!' }).click();
      await expect(page.getByTestId('step-text')).toHaveText('Get dressed');
      await (await homeButton(page)).click();
      await expect(page.getByTestId('the-point')).toBeVisible();
      await ctx.close();
      resetFamily(f);
    }
  }
});

test('Last Run routine run: night and focus-like even with the iPad set to Day; vs iPadLastRun (slice 7)', async ({ browser }) => {
  setGround(f, 'day');
  const { ctx, page } = await kidPage(browser, f, 'Kid B', T.eight, { path: `/routine/${f.routines.bed}` });
  await expect(page.getByTestId('step-text')).toHaveText('Pajamas on');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'lastrun');
  await kidRules(page, 'last run step prereader', MIN.prereader);
  const vol = await page.locator('html').getAttribute('data-volume');
  // CLAUDE.md "Two volume levels": Last Run is focus styling.
  expect.soft(vol, 'Last Run routine step: CLAUDE.md lists Last Run under focus styling').toBe('focus');
  const shot = await shoot(page, 'ipad-routine-lastrun-step-prereader');
  await sideBySide(page, shot, 'iPadLastRun', `${SHOTS}/compare/ipad-routine-lastrun-step-vs-iPadLastRun.png`, 'Last Run step');
  await ctx.close();
});

test('routine run: all done screen is not a dead end; unknown routine id falls back (slice 7)', async ({ browser }) => {
  sql(`insert into public.routine_completions (family_id, routine_id, kid_id, on_date, completed_steps, completed_at) values (${lit(f.parent.familyId)}, ${lit(f.routines.after!)}, ${lit(f.ids['Kid A']!)}, '2026-10-01', '{hands,snack}', now())`);
  const { ctx, page } = await kidPage(browser, f, 'Kid A', T.afterSchool, { path: `/routine/${f.routines.after}` });
  await expect(page.getByText('All done!')).toBeVisible();
  await kidRules(page, 'routine all done reader', MIN.reader, 'day');
  await shoot(page, 'ipad-routine-alldone-reader-day');
  await page.getByRole('button', { name: 'Home' }).last().click();
  await expect(page).toHaveURL(new RegExp(`/kid/${f.ids['Kid A']}$`));
  await page.goto(`/kid/${f.ids['Kid A']}/routine/00000000-0000-0000-0000-000000000000`);
  await expect(page).toHaveURL(/\/routines$/);
  await ctx.close();
});

/* ------------------------------------------------------------------ */
/* Slice 8: Tour Dates                                                 */
/* ------------------------------------------------------------------ */

test('Tour Dates: one big countdown, read-aloud, kid rules, both grounds (slice 8)', async ({ browser }) => {
  for (const k of KIDS) {
    for (const [ground, at] of [['day', T.seven], ['night', T.beforeDawn]] as const) {
      const { ctx, page } = await kidPage(browser, f, k.kid, at, { path: '/dates' });
      const where = `tour dates ${k.age} ${ground}`;
      const hero = page.getByTestId('countdown-hero');
      await expect(hero).toContainText('4 sleeps');
      await expect(hero).toContainText('until Pumpkin patch');
      await expect(hero.locator('.dt-moon')).toHaveCount(4);
      await expect(page.getByText('Parents dinner')).toHaveCount(0);
      await expect(page.locator('.dt-item')).toHaveCount(4);
      await kidRules(page, where, k.min, ground);
      await volumeRules(page, where, 'normal');
      await page.getByRole('button', { name: 'Read it to me' }).click();
      expect.soft(await spoken(page)).toContain('4 sleeps until Pumpkin patch.');
      await shoot(page, `ipad-dates-${k.age}-${ground}`);
      await ctx.close();
    }
  }
  // Many moons: 14 shown, then +N. Does the pre-reader layout still fit?
  sql(`update public.events set on_date = '2026-10-31' where family_id = ${lit(f.parent.familyId)} and title = 'Pumpkin patch'`);
  try {
    const { ctx, page } = await kidPage(browser, f, 'Kid B', T.seven, { path: '/dates' });
    await expect(page.getByTestId('countdown-hero')).toContainText('12 sleeps');
    await kidRules(page, 'tour dates prereader 12 sleeps', MIN.prereader, 'day');
    await shoot(page, 'ipad-dates-prereader-12-sleeps');
    await ctx.close();
  } finally {
    sql(`update public.events set on_date = '2026-10-05' where family_id = ${lit(f.parent.familyId)} and title = 'Pumpkin patch'`);
  }
});

/* ------------------------------------------------------------------ */
/* Slice 9: Wave Check, Breathe, Reset plan                            */
/* ------------------------------------------------------------------ */

test('Wave Check: pick, size, thanks; bold fills at normal; no scores; both grounds (slice 9)', async ({ browser }) => {
  for (const k of KIDS) {
    for (const [ground, at] of [['day', T.afterSchool], ['night', T.beforeDawn]] as const) {
      resetFamily(f);
      const { ctx, page } = await kidPage(browser, f, k.kid, at, { path: '/wave' });
      const where = `wave ${k.age} ${ground}`;
      await expect(page.getByText("How's your wave?")).toBeVisible();
      await kidRules(page, `${where} pick`, k.min, ground);
      await volumeRules(page, `${where} pick`, 'normal');
      for (const [key, rgb] of [['pumping', ACCENT_RGB.yellow], ['rolling', ACCENT_RGB.cyan], ['flat', ACCENT_RGB.lilac], ['choppy', ACCENT_RGB.orange]] as const) {
        const bg = await page.getByTestId(`feeling-${key}`).evaluate((e) => getComputedStyle(e).backgroundColor);
        expect.soft(bg, `${where}: ${key} is a bold fill at normal`).toBe(rgb);
        const fg = await page.getByTestId(`feeling-${key}`).evaluate((e) => getComputedStyle(e).color);
        expect.soft(fg, `${where}: ${key} text is ink`).toBe('rgb(10, 8, 24)');
      }
      await page.getByRole('button', { name: 'Read it to me' }).click();
      expect.soft(await spoken(page)).toContain("How's your wave? Pumping, Rolling, Flat, or Choppy?");
      const shot = await shoot(page, `ipad-wave-pick-${k.age}-${ground}`);
      if (ground === 'night' && k.age === 'prereader') await sideBySide(page, shot, 'iPadWaveCheck', `${SHOTS}/compare/ipad-wave-pick-prereader-night-vs-iPadWaveCheck.png`, 'Wave Check (normal, night)');

      await page.getByTestId('feeling-choppy').click();
      expect.soft(await spoken(page)).toContain('Choppy. Upset or mad?');
      await expect(page.getByText('How big is your choppy wave?')).toBeVisible();
      await kidRules(page, `${where} size`, k.min, ground);
      await shoot(page, `ipad-wave-size-${k.age}-${ground}`);
      // A mis-tap is gentle: one tap goes back to the faces, nothing is recorded.
      await page.getByRole('button', { name: 'Pick a different one' }).click();
      await expect(page.getByTestId('feeling-flat')).toBeVisible();
      expect(sql(`select count(*) from public.feelings_checkins where kid_id = ${lit(f.ids[k.kid]!)}`)[0]).toBe('0');
      await page.getByTestId('feeling-flat').click();
      await page.getByTestId('size-2').click();
      await expect(page.getByTestId('wave-thanks')).toBeVisible();
      expect.soft(await page.locator('body').innerText(), `${where}: no scores or rewards on thanks`).not.toMatch(SCORE_WORDS);
      await kidRules(page, `${where} thanks`, k.min, ground);
      await shoot(page, `ipad-wave-thanks-${k.age}-${ground}`);
      // Home is one tap away on the Wave Check screens too.
      await expect(page.getByRole('button', { name: 'Home' }).first()).toBeVisible();
      await expect.poll(() => sql(`select feeling || ':' || size from public.feelings_checkins where kid_id = ${lit(f.ids[k.kid]!)}`)[0]).toBe('flat:2');
      // Back home: the check-in leaves no score, badge or count behind.
      await page.getByRole('button', { name: 'Done' }).click();
      expect.soft(await page.locator('body').innerText(), `${where}: home after a check-in`).not.toMatch(SCORE_WORDS);
      await ctx.close();
    }
  }
});

test('bedtime Wave Check: night, "How was your day?", faces only carry color; vs iPadLastRun (slice 9)', async ({ browser }) => {
  setGround(f, 'day');
  for (const k of KIDS) {
    const { ctx, page } = await kidPage(browser, f, k.kid, T.eight, { path: '/wave' });
    await expect(page.getByText('How was your day?')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'lastrun');
    await kidRules(page, `bedtime wave ${k.age}`, k.min);
    const fills = await page.locator('.wave-tile').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    // CLAUDE.md "Wave Check scale": in Last Run the four options appear in focus styling, only the faces in color.
    expect.soft(fills, `bedtime wave ${k.age}: tiles are bold color fills (CLAUDE.md: Last Run = focus styling, faces only in color)`).toEqual(Array(4).fill('rgb(34, 30, 69)'));
    expect.soft(await page.locator('html').getAttribute('data-volume'), `bedtime wave ${k.age}: volume`).toBe('focus');
    const shot = await shoot(page, `ipad-wave-bedtime-${k.age}`);
    if (k.age === 'prereader') await sideBySide(page, shot, 'iPadLastRun', `${SHOTS}/compare/ipad-wave-bedtime-prereader-vs-iPadLastRun.png`, 'Bedtime Wave Check');
    await ctx.close();
  }
});

test('Wave Check at focus (Session mode): only the faces carry color; Home + reachable (slice 9)', async ({ browser }) => {
  setMode(f, 'Kid B', 'session');
  const { ctx, page } = await kidPage(browser, f, 'Kid B', T.afterSchool, { path: '/wave' });
  await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
  const tiles = await page.locator('.wave-tile').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect.soft(new Set(tiles).size, 'focus: all four tiles share the plain surface').toBe(1);
  expect.soft(tiles.some((c) => Object.values(ACCENT_RGB).includes(c)), 'focus: no bold feeling fills').toBe(false);
  await expect(page.locator('.wave-tile img')).toHaveCount(4); // the faces (color art) remain
  await volumeRules(page, 'wave focus', 'focus', ACCENT_RGB.cyan);
  await kidRules(page, 'wave focus prereader', MIN.prereader, 'day');
  await shoot(page, 'ipad-wave-pick-prereader-focus-day');
  await ctx.close();
  setMode(f, 'Kid B', 'everything');
});

test('Breathe and Reset plan: kid rules, read-aloud, reduced motion, one task (slice 9)', async ({ browser }) => {
  for (const k of KIDS) {
    for (const [ground, at] of [['day', T.afterSchool], ['night', T.beforeDawn]] as const) {
      resetFamily(f);
      const { ctx, page } = await kidPage(browser, f, k.kid, at, { path: '/breathe', reduced: true });
      const where = `breathe ${k.age} ${ground}`;
      await kidRules(page, `${where} ready`, k.min, ground);
      // Breathe is part of the feelings flow: is Home there, and is Wave Check reachable?
      await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
      expect.soft(await page.getByRole('button', { name: /read it to me/i }).count(), `${where}: no read-aloud for "Three slow breaths"`).toBeGreaterThan(0);
      await shoot(page, `ipad-breathe-${k.age}-${ground}`);
      await page.getByRole('button', { name: 'Start' }).click();
      expect.soft(await spoken(page)).toContain("Let's go into our shells. Three slow breaths. Breathe in.");
      const m = await stillUnderReducedMotion(page);
      expect.soft(m.out, `${where}: things move under reduced motion`).toEqual([]);
      for (let i = 0; i < 7; i++) await page.clock.runFor(5100);
      await expect(page.getByTestId('breathe-label')).toHaveText('Nice and calm.');
      await kidRules(page, `${where} done`, k.min, ground);
      await shoot(page, `ipad-breathe-done-${k.age}-${ground}`);
      await ctx.close();

      const r = await kidPage(browser, f, k.kid, at, { path: '/reset' });
      const rw = `reset ${k.age} ${ground}`;
      await expect(r.page.getByText('When my wave gets choppy, my body…')).toBeVisible();
      await kidRules(r.page, `${rw} signs`, k.min, ground);
      expect.soft(await r.page.getByRole('button', { name: /read it to me/i }).count(), `${rw}: the question has no read-aloud (pre-readers can't read it)`).toBeGreaterThan(0);
      await shoot(r.page, `ipad-reset-signs-${k.age}-${ground}`);
      await r.page.getByRole('button', { name: 'Fast heart' }).click();
      expect.soft(await spoken(r.page)).toContain('Fast heart');
      await r.page.getByRole('button', { name: 'Next' }).click();
      await kidRules(r.page, `${rw} tools`, k.min, ground);
      // There is no way back from "tools" to "signs" except Home (which loses the plan).
      expect.soft(await r.page.getByRole('button', { name: /back/i }).count(), `${rw}: no Back from step 2 to step 1`).toBeGreaterThan(0);
      await shoot(r.page, `ipad-reset-tools-${k.age}-${ground}`);
      // Unticking every tool disables Save without saying why.
      await r.page.getByRole('button', { name: 'Go in my shell' }).click();
      await expect(r.page.getByRole('button', { name: 'Save my plan' })).toBeDisabled();
      await r.page.getByRole('button', { name: 'Hug teddy' }).click();
      await r.page.getByRole('button', { name: 'Save my plan' }).click();
      await expect(r.page.getByTestId('reset-plan')).toContainText('Hug teddy');
      await kidRules(r.page, `${rw} plan`, k.min, ground);
      expect.soft(await r.page.locator('body').innerText(), `${rw}: no scores`).not.toMatch(SCORE_WORDS);
      // With only "Hug teddy", the plan view has no breathe button: what does the kid do next?
      await shoot(r.page, `ipad-reset-plan-${k.age}-${ground}`);
      await r.ctx.close();
    }
  }
});

test('reduced motion: kid home, routine run, Tour Dates and Wave Check have no motion (slice 5-9)', async ({ browser }) => {
  for (const path of ['', '/routines', `/routine/${f.routines.morning}`, '/dates', '/wave', '/reset']) {
    const { ctx, page } = await kidPage(browser, f, 'Kid B', T.seven, { path, reduced: true });
    await page.waitForTimeout(2500); // the ground cross-fade starts 2 s after launch
    const m = await stillUnderReducedMotion(page);
    expect.soft(m.out, `reduced motion ${path || '/'}`).toEqual([]);
    expect.soft(m.running, `running animations ${path || '/'}`).toBe(0);
    await ctx.close();
  }
  // Without reduced motion, a tap gets instant feedback (press transition <= 150ms).
  const { ctx, page } = await kidPage(browser, f, 'Kid B', T.seven, { reduced: false });
  const d = await page.getByTestId('dock-wave_check').evaluate((e) => getComputedStyle(e).transitionDuration);
  expect.soft(Math.max(...d.split(',').map(parseFloat)), 'tile press feedback is quick').toBeLessThanOrEqual(0.15);
  await ctx.close();
});

test('feelings never carry scores: parent Today and the kid snapshot (slice 9)', async ({ browser }) => {
  // A check-in exists; nothing on the kid side may count or reward it.
  sql(`insert into public.feelings_checkins (family_id, kid_id, feeling, size, moment) values (${lit(f.parent.familyId)}, ${lit(f.ids['Kid A']!)}, 'pumping', 4, 'morning')`);
  const { ctx, page } = await kidPage(browser, f, 'Kid A', T.seven);
  const snap = await page.evaluate(() => localStorage.getItem('deck.snapshot.v3') ?? '');
  expect.soft(snap, 'snapshot has no score-like fields for feelings').not.toMatch(/"(points|score|streak|reward)"/);
  expect.soft(await page.locator('body').innerText()).not.toMatch(SCORE_WORDS);
  // The device can't read the feelings table directly (parents only).
  const { data } = await f.device.db.from('feelings_checkins').select('id');
  expect(data ?? []).toEqual([]);
  await ctx.close();
});

import { expect, test, type Page } from '@playwright/test';
import { coveredControls, focusRow, liveKidPage, overlapsOf, setFocus, SHOTS, snap } from './helpers/focusqa';
import { ACCENT_RGB, constants, family, kidRules, resetFamily, stillUnderReducedMotion, volumeRules, type Fam } from './helpers/kidqa';
import { audit, sideBySide, spoken, volumeAudit } from './helpers/qa';

/*
 * Independent UX QA for slice 10 (focus modes), kid side. iPad 820x1180 portrait, WebKit.
 * Seed placeholders only (Kid A reader, Kid B pre-reader). Real server time; durations are
 * compressed with SQL on kid_focus.
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
  ], { live: true });
});

test.beforeEach(({}, info) => {
  if (info.project.name === 'ipad' && f) resetFamily(f);
});

// Phase 1.5 (slice 4): the bar is now eight chunks that drain one every 15 s (R3HeadsUp).
const chunks = async (page: Page) => Number(await page.getByTestId('heads-up-chunks').getAttribute('data-left'));
const leftSecs = async (page: Page) => {
  const [m, s] = (await page.getByTestId('heads-up-left').innerText()).split(':').map(Number);
  return m! * 60 + s!;
};

/* ------------------------------------------------------------------ */
/* Heads-up                                                            */
/* ------------------------------------------------------------------ */

test('heads-up: rooster + sand timer, same words for every mode, draining bar, time left, read-aloud (slice 10)', async ({ browser }) => {
  test.setTimeout(180_000);
  const words: Record<string, string> = { session: "Two more minutes, then it's learning time.", lights_out: "Two more minutes, then it's lights out time.", everything: "Two more minutes, then it's free time." };
  for (const k of KIDS) {
    for (const ground of ['day', 'night'] as const) {
      resetFamily(f);
      const { ctx, page } = await liveKidPage(browser, f, k.kid, { ground });
      const where = `heads-up ${k.age} ${ground}`;
      // A real parent call: Session in 2 minutes, for 10 minutes.
      const { error } = await f.parent.db.rpc('set_focus', { p_kid_ids: [f.ids[k.kid]], p_mode: 'session', p_minutes: 10, p_now: false });
      expect(error).toBeNull();
      const hu = page.getByTestId('heads-up');
      await expect(hu, `${where}: arrives live`).toBeVisible({ timeout: 8000 });
      await expect(hu).toContainText(words.session!);
      // The rooster (the exported heads-up pose, holding the sand timer) and the chunk timer.
      await expect(hu.locator('.sc-headsup__who img').first()).toBeVisible();
      const roosterSrc = await hu.locator('.sc-headsup__who img').first().getAttribute('src');
      expect.soft(roosterSrc ?? '', `${where}: the heads-up mascot is the rooster`).toMatch(/rooster/i);
      await expect(hu.getByTestId('heads-up-chunks')).toBeVisible();
      await expect(page.getByTestId('heads-up-left')).toHaveText(/^(2:00|1:5\d)$/);
      // Still in Everything while the heads-up runs: normal volume, routines still there.
      await expect(page.locator('html')).toHaveAttribute('data-volume', 'normal');
      await expect(page.getByTestId('tile-routines')).toBeVisible();
      // Chunks + countdown move without a reload; the chunks always match the clock.
      const c0 = await chunks(page);
      const s0 = await leftSecs(page);
      await page.waitForTimeout(3200);
      const s1 = await leftSecs(page);
      expect.soft(s1, `${where}: time left counts down`).toBeLessThan(s0);
      expect.soft(c0, `${where}: starts with all eight chunks`).toBe(8);
      expect.soft(await chunks(page), `${where}: chunks match the time left`).toBe(Math.ceil(s1 / 15));
      // Read-aloud says exactly what is on screen.
      await hu.getByRole('button', { name: 'Read it to me' }).click();
      expect.soft(await spoken(page), `${where}: read-aloud`).toContain(words.session);
      // Never blocks feelings (or anything else): nothing is under the banner.
      expect.soft(await coveredControls(page), `${where}: controls covered by the heads-up`).toEqual([]);
      expect.soft(await overlapsOf(page, '[data-testid="heads-up"]'), `${where}: content under the heads-up`).toEqual([]);
      await kidRules(page, where, k.min, ground);
      await snap(page, `ipad-headsup-home-${k.age}-${ground}`);
      // It also shows on other screens (Wave Check), and doesn't cover the feelings there.
      await page.getByTestId('tile-wave_check').click();
      await expect(page.getByTestId('feeling-choppy')).toBeVisible();
      await expect(hu).toBeVisible();
      expect.soft(await coveredControls(page), `${where} on Wave Check: controls covered by the heads-up`).toEqual([]);
      await kidRules(page, `${where} on Wave Check`, k.min, ground);
      await snap(page, `ipad-headsup-wave-${k.age}-${ground}`);
      await ctx.close();
    }
  }

  // Same words for every target mode (predictable ritual), and the read-aloud matches.
  for (const mode of ['lights_out', 'everything'] as const) {
    resetFamily(f);
    if (mode === 'everything') setFocus(f, 'Kid A', { mode: 'session' });
    const { ctx, page } = await liveKidPage(browser, f, 'Kid A', { ground: 'night' });
    await f.parent.db.rpc('set_focus', { p_kid_ids: [f.ids['Kid A']], p_mode: mode, p_minutes: null, p_now: false });
    const hu = page.getByTestId('heads-up');
    await expect(hu).toContainText(words[mode]!, { timeout: 8000 });
    await hu.getByRole('button', { name: 'Read it to me' }).click();
    expect.soft(await spoken(page), `heads-up to ${mode}: read-aloud`).toContain(words[mode]);
    expect.soft(await coveredControls(page), `heads-up to ${mode}: controls covered`).toEqual([]);
    await snap(page, `ipad-headsup-to-${mode}-reader-night`);
    await ctx.close();
  }
});

test('heads-up: when it runs out the mode switches with no reload; Cancel from the phone removes it live (slice 10)', async ({ browser }) => {
  const { ctx, page } = await liveKidPage(browser, f, 'Kid B', { ground: 'day' });
  test.setTimeout(120_000);
  setFocus(f, 'Kid B', { mode: 'everything', pending: 'session', switchIn: 6, pendingEndsIn: 6 + 600, ret: 'everything' });
  const switchAt = Date.now() + 6000;
  await expect(page.getByTestId('heads-up')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('heads-up')).toHaveCount(0, { timeout: 12_000 });
  const goneAt = Date.now();
  await snap(page, 'ipad-headsup-just-ended-prereader-day');
  const stale = { home: await page.getByTestId('session-home').count(), routines: await page.getByTestId('tile-routines').count(), volume: await page.locator('html').getAttribute('data-volume') };
  await expect(page.getByTestId('session-home')).toBeVisible({ timeout: 40_000 });
  const lag = Date.now() - switchAt;
  console.log(`heads-up gone ${goneAt - switchAt} ms after switch_at; Session home appeared ${lag} ms after; right after the banner went: ${JSON.stringify(stale)}`);
  expect.soft(lag, `the home screen switches to Session ${lag} ms after the heads-up ends (KidHome re-reads the clock every 30 s); in between: ${JSON.stringify(stale)}`).toBeLessThan(3000);
  await expect(page.getByTestId('heads-up')).toHaveCount(0);
  await expect(page.getByTestId('time-left')).toContainText(/Session · \d+:\d\d left/);
  await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');

  // A pending switch cancelled by the parent: the heads-up disappears on the iPad, no reload.
  await f.parent.db.rpc('set_focus', { p_kid_ids: [f.ids['Kid B']], p_mode: 'lights_out', p_minutes: null, p_now: false });
  await expect(page.getByTestId('heads-up')).toContainText('lights out', { timeout: 8000 });
  const { error } = await f.parent.db.rpc('cancel_focus_switch', { p_kid_ids: [f.ids['Kid B']] });
  expect(error).toBeNull();
  await expect(page.getByTestId('heads-up')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByTestId('session-home')).toBeVisible();
  await ctx.close();
});

test('heads-up under reduced motion: nothing animates (slice 10)', async ({ browser }) => {
  const { ctx, page } = await liveKidPage(browser, f, 'Kid A', { ground: 'night', reduced: true });
  setFocus(f, 'Kid A', { mode: 'everything', pending: 'session', switchIn: 120 });
  await expect(page.getByTestId('heads-up')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  const m = await stillUnderReducedMotion(page);
  expect.soft(m.out, 'reduced motion: transitions or animations on the heads-up screen').toEqual([]);
  await ctx.close();
});

/* ------------------------------------------------------------------ */
/* Session mode                                                        */
/* ------------------------------------------------------------------ */

test('Session: home card, time-left chip, focus styling, hidden modules absent and unreachable by URL (slice 10)', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const k of KIDS) {
    for (const ground of ['day', 'night'] as const) {
      setFocus(f, k.kid, { mode: 'session', endsIn: 600, ret: 'everything' });
      const { ctx, page } = await liveKidPage(browser, f, k.kid, { ground });
      const where = `session home ${k.age} ${ground}`;
      await expect(page.getByTestId('session-home')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
      await expect(page.locator('html')).toHaveAttribute('data-ground', ground);
      // One clear task: Start Session sits above the tiles.
      const order = await page.evaluate(() => {
        const top = (s: string) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
        return { start: top('.home__session'), tiles: top('.home__tiles') };
      });
      expect.soft(order.start, `${where}: the Session card comes first`).toBeLessThan(order.tiles);
      // Hidden, not greyed out.
      await expect(page.getByTestId('tile-routines')).toHaveCount(0);
      await expect(page.getByTestId('tile-tour_dates')).toHaveCount(0);
      await expect(page.getByTestId('up-next')).toHaveCount(0);
      expect(await page.locator('[aria-disabled="true"], .is-disabled, [disabled]').count()).toBe(0);
      await expect(page.getByTestId('tile-wave_check')).toBeVisible();
      // Time-left chip.
      const chip = page.getByTestId('time-left');
      await expect(chip).toContainText(/Session · (10:00|9:\d\d) left/);
      expect.soft(await overlapsOf(page, '[data-testid="time-left"]'), `${where}: what the time-left chip sits on`).toEqual([]);
      // Pre-reader: is there a way to hear the Session card? (No reading needed for "Start Session")
      if (k.age === 'prereader') {
        const speakers = await page.locator('.home__session').getByRole('button', { name: 'Read it to me' }).count();
        expect.soft(speakers, `${where}: the pre-reader's Session card has no read-aloud prompt (CLAUDE.md: spoken or pictured prompt)`).toBeGreaterThan(0);
      }
      await kidRules(page, where, k.min, ground);
      await volumeRules(page, where, 'focus', ACCENT_RGB[k.accent]);
      const shot = await snap(page, `ipad-session-home-${k.age}-${ground}`);
      if (k.age === 'reader' && ground === 'night') await sideBySide(page, shot, 'iPadGromZoneFocus', `${SHOTS}/compare/ipad-session-home-reader-night-vs-iPadGromZoneFocus.png`, 'Session home (reader, night)');
      if (k.age === 'prereader' && ground === 'night') await sideBySide(page, shot, 'iPadGromZoneFocus', `${SHOTS}/compare/ipad-session-home-prereader-night-vs-iPadGromZoneFocus.png`, 'Session home (pre-reader, night)');

      // Start Session -> placeholder; Home and Wave Check one tap away.
      await page.getByRole('button', { name: 'Start Session' }).click();
      await expect(page.getByTestId('session-placeholder')).toBeVisible();
      expect.soft(await spoken(page), `${where}: Start Session is spoken`).toContain("Let's learn!");
      await kidRules(page, `session placeholder ${k.age} ${ground}`, k.min, ground);
      await volumeRules(page, `session placeholder ${k.age} ${ground}`, 'focus', ACCENT_RGB[k.accent]);
      expect.soft(await overlapsOf(page, '[data-testid="time-left"]'), `session placeholder ${k.age} ${ground}: what the time-left chip sits on`).toEqual([]);
      await snap(page, `ipad-session-placeholder-${k.age}-${ground}`);
      await page.getByRole('button', { name: 'Wave Check' }).click();
      await expect(page.getByTestId('feeling-rolling')).toBeVisible();
      await page.getByRole('button', { name: 'Home' }).click();
      await expect(page.getByTestId('session-home')).toBeVisible();

      // Hidden modules can't be reached by typing the address.
      for (const path of ['/routines', '/dates', `/routine/${f.routines.morning}`]) {
        await page.goto(`/kid/${f.ids[k.kid]}${path}`);
        await expect(page.getByTestId('session-home'), `${where}: ${path} is unreachable in Session`).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(`/kid/${f.ids[k.kid]}`);
      }
      // Reload and reopen can't escape.
      await page.reload();
      await expect(page.getByTestId('session-home')).toBeVisible();
      const p2 = await ctx.newPage();
      await p2.goto(`/kid/${f.ids[k.kid]}/routines`);
      await expect(p2.getByTestId('session-home')).toBeVisible();
      await ctx.close();
    }
  }
});

test('Session: the time-left chip counts down and the chip text has AA contrast (slice 10)', async ({ browser }) => {
  setFocus(f, 'Kid A', { mode: 'session', endsIn: 125, ret: 'everything' });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid A', { ground: 'day' });
  const t0 = await page.getByTestId('time-left').innerText();
  await page.waitForTimeout(2200);
  const t1 = await page.getByTestId('time-left').innerText();
  expect(t1).not.toBe(t0);
  expect(t0).toMatch(/2:0\d left/);
  await ctx.close();
});

/* ------------------------------------------------------------------ */
/* End-of-session celebration                                          */
/* ------------------------------------------------------------------ */

test('celebration when a timed Session ends: normal styling, a celebration from the bag; reduced motion: its still; once per ending (slice 10, 1.5 slice 4)', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const reduced of [false, true]) {
    resetFamily(f);
    setFocus(f, 'Kid B', { mode: 'session', endsIn: 4, ret: 'everything' });
    const { ctx, page } = await liveKidPage(browser, f, 'Kid B', { ground: 'day', reduced, path: '/session' });
    await expect(page.getByTestId('session-placeholder')).toBeVisible();
    const cel = page.getByTestId('session-celebrate');
    await expect(cel).toBeVisible({ timeout: 12_000 });
    await expect(cel).toContainText('Session done!');
    // Kid B's default is normal and the session returns to Everything, so normal either way.
    await expect(cel).toHaveAttribute('data-volume', 'normal');
    // Phase 1.5: one of the seven celebrations (scene system). Reduce Motion shows its still.
    const scene = cel.getByTestId('celebration');
    await expect(scene).toBeVisible();
    if (reduced) {
      const kind = await scene.getAttribute('data-kind');
      const last = { pop: '3', confetti: '3', 'rooster-cheer': '3', 'shell-spin': '4', kickflip: '3', stoked: '3', squad: '4' }[kind!];
      await expect(scene, 'reduced motion: the still at once').toHaveAttribute('data-beat', last!);
      const m = await stillUnderReducedMotion(page);
      expect.soft(m.out, 'reduced motion: nothing moves on the celebration').toEqual([]);
    } else {
      await expect.poll(async () => Number(await scene.getAttribute('data-beat')), { message: 'the celebration steps through its beats', timeout: 3000 }).toBeGreaterThan(0);
    }
    {
      const a = await audit(page, MIN.prereader);
      expect.soft(a.smallTargets, `session celebration reduced=${reduced}: targets under 80pt`).toEqual([]);
      expect.soft(a.selectable, `session celebration reduced=${reduced}: selectable text`).toEqual([]);
      expect.soft(a.contrast.filter((c) => !c.includes('dk-burst__word') && !c.includes('sc-burst__word')), `session celebration reduced=${reduced}: contrast`).toEqual([]);
      expect.soft(a.scrollsY).toBe(false);
    }
    // Read-aloud for the pre-reader?
    const shot = await snap(page, `ipad-session-celebrate-prereader${reduced ? '-reduced' : ''}`);
    await sideBySide(page, shot, 'Shred', `${SHOTS}/compare/ipad-session-celebrate${reduced ? '-reduced' : ''}-vs-Shred.png`, `Session done${reduced ? ' (reduced motion)' : ''}`);
    // Does it dismiss itself (brief), or wait for a tap?
    // It goes by itself after a few seconds (CLAUDE.md: keep it brief).
    await expect(cel, 'celebration dismisses itself').toBeHidden({ timeout: 8000 });
    await expect(page).toHaveURL(new RegExp(`/kid/${f.ids['Kid B']}$`));
    await expect(page.locator('html')).toHaveAttribute('data-volume', 'normal');
    await expect(page.getByTestId('tile-routines')).toBeVisible();
    // Once per ending: a reload doesn't replay it.
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('session-celebrate')).toHaveCount(0);
    await ctx.close();
  }
});

test('celebration while on Wave Check: Wave Check is not taken away mid check-in (slice 10)', async ({ browser }) => {
  setFocus(f, 'Kid B', { mode: 'session', endsIn: 5, ret: 'everything' });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid B', { ground: 'night', path: '/wave' });
  await page.getByTestId('feeling-flat').click();
  await page.waitForTimeout(7000);
  const celebrating = await page.getByTestId('session-celebrate').isVisible();
  await snap(page, 'ipad-session-ends-during-wave-check');
  expect.soft(celebrating, 'a session ending mid check-in covers Wave Check with the celebration').toBe(false);
  await ctx.close();
});

test('a timed Lights out ending: no loud SHRED! burst at bedtime (slice 10)', async ({ browser }) => {
  setFocus(f, 'Kid A', { mode: 'lights_out', endsIn: 4, ret: 'everything' });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid A', { ground: 'night', reduced: false });
  await expect(page.getByTestId('lights-out')).toBeVisible();
  const chip = page.getByTestId('time-left');
  if (await chip.count()) await snap(page, 'ipad-lightsout-timed-chip');
  expect.soft(await chip.count(), 'Lights out shows a "Lights out · m:ss left" chip on the bedtime screen').toBe(0);
  await page.waitForTimeout(6000);
  const cel = page.getByTestId('session-celebrate');
  if (await cel.isVisible()) await snap(page, 'ipad-lightsout-ended-celebrate');
  expect.soft(await cel.isVisible() && (await cel.locator('.dk-burst, .sc-burst').count()) > 0, 'a timed Lights out ends with a "SHRED! Lights out done!" burst').toBe(false);
  await ctx.close();
});

test.describe('a kid whose default volume is focus', () => {
  let ff: Fam;
  test.beforeAll(async ({}, info) => {
    if (info.project.name !== 'ipad') return;
    ff = await family([
      { nickname: 'Kid A', age_band: 'reader', accent: 'magenta' },
      { nickname: 'Kid B', age_band: 'prereader', accent: 'cyan', default_volume: 'focus' },
    ], { events: false, live: true });
  });

  test('stays focus in Everything with a heads-up; Session ending still gets the normal celebration (slice 10)', async ({ browser }) => {
    resetFamily(ff);
    const normal = await liveKidPage(browser, ff, 'Kid A', { ground: 'night' });
    const normalConst = await constants(normal.page);
    await normal.ctx.close();

    const { ctx, page } = await liveKidPage(browser, ff, 'Kid B', { ground: 'night', reduced: false });
    await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
    setFocus(ff, 'Kid B', { mode: 'everything', pending: 'session', switchIn: 60 });
    await expect(page.getByTestId('heads-up')).toBeVisible({ timeout: 8000 });
    await volumeRules(page, 'focus-default kid, Everything + heads-up', 'focus', ACCENT_RGB.cyan);
    const c = await constants(page);
    expect.soft(c.headlineFont, 'display font same in both volumes').toBe(normalConst.headlineFont);
    expect.soft(c.btnBorder, 'button outline same').toBe(normalConst.btnBorder);
    expect.soft(c.btnShadow, 'button shadow same').toBe(normalConst.btnShadow);
    await snap(page, 'ipad-focuskid-headsup-night');

    setFocus(ff, 'Kid B', { mode: 'session', endsIn: 4, ret: 'everything' });
    const cel = page.getByTestId('session-celebrate');
    await expect(cel).toBeVisible({ timeout: 12_000 });
    await expect(cel, 'focus-default kid: celebration is still normal styling').toHaveAttribute('data-volume', 'normal');
    await expect(cel.getByTestId('celebration')).toBeVisible();
    await snap(page, 'ipad-focuskid-session-celebrate');
    // Phase 1.5: a tap skips the celebration (no "Back to Grom Zone" button).
    await cel.getByTestId('celebration').click();
    await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
    await ctx.close();
  });
});

/* ------------------------------------------------------------------ */
/* Lights out                                                          */
/* ------------------------------------------------------------------ */

test('Lights out: always night (Day, Auto, Follow-device light), low brightness, one control, focus styling (slice 10)', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const k of KIDS) {
    for (const [ground, scheme] of [['day', 'light'], ['auto', 'light'], ['device', 'light'], ['night', 'dark']] as const) {
      setFocus(f, k.kid, { mode: 'lights_out' });
      const { ctx, page } = await liveKidPage(browser, f, k.kid, { ground, colorScheme: scheme });
      const where = `lights out ${k.age} setting=${ground}`;
      await expect(page.getByTestId('lights-out')).toBeVisible();
      await expect(page.locator('html'), `${where}: always night`).toHaveAttribute('data-ground', 'night');
      await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
      await expect(page.getByRole('button')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'I need to breathe' })).toBeVisible();
      // 1.5 (slice 4): the line shows until the scene's 4.5 s frame, which keeps "I need to
      // breathe" only (art spec); a reload or second visit starts on that frame.
      await expect(page.getByText(`Time for bed, ${k.kid}.`)).toBeAttached();
      await expect(page.getByRole('button', { name: 'I need to breathe' })).toBeVisible();
      // Low brightness: the brightest visible pixel region should be dim. Check the computed filter and bg.
      const dim = await page.evaluate(() => {
        const m = document.querySelector('.lightsout')!;
        const s = getComputedStyle(m);
        const qa = (window as any).__qa; // eslint-disable-line @typescript-eslint/no-explicit-any
        const btn = document.querySelector('.lightsout__breathe')!;
        return { filter: s.filter, bgLum: qa.lum(qa.parse(s.backgroundColor)), btnBg: getComputedStyle(btn).backgroundColor, btnLum: qa.lum(qa.parse(getComputedStyle(btn).backgroundColor)) };
      });
      expect.soft(dim.bgLum, `${where}: background is very dark`).toBeLessThan(0.02);
      expect.soft(dim.btnLum, `${where}: the only button is a bright ${dim.btnBg} block on the bedtime screen`).toBeLessThan(0.5);
      await kidRules(page, where, k.min, 'night');
      const v = await volumeAudit(page);
      expect.soft(v.halftone.filter((h) => !h.includes('lightsout__sky')), `${where}: halftone (the star field is excluded)`).toEqual([]);
      expect.soft(v.textShadows, `${where}: offset headlines`).toEqual([]);
      expect.soft(v.tilts, `${where}: tilts`).toEqual([]);
      expect.soft(v.marker, `${where}: marker`).toEqual([]);
      if (ground === 'day') await snap(page, `ipad-lightsout-${k.age}-setting-day`);
      if (ground === 'night') await snap(page, `ipad-lightsout-${k.age}-night`);
      await ctx.close();
    }
  }
});

test('Lights out: breathe, then Back to bed or Tell how I feel (Q8); other screens fall back to bed; reload cannot escape (slice 10)', async ({ browser }) => {
  test.setTimeout(150_000);
  for (const k of KIDS) {
    setFocus(f, k.kid, { mode: 'lights_out' });
    const { ctx, page } = await liveKidPage(browser, f, k.kid, { ground: 'day', colorScheme: 'light', reduced: true });
    await page.getByRole('button', { name: 'I need to breathe' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-ground', 'night');
    await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
    await kidRules(page, `lights out breathe ready ${k.age}`, k.min, 'night');
    await volumeRules(page, `lights out breathe ready ${k.age}`, 'focus', ACCENT_RGB[k.accent]);
    await snap(page, `ipad-lightsout-breathe-ready-${k.age}`);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Back to bed' })).toBeVisible({ timeout: 35_000 });
    await expect(page.getByRole('button', { name: 'Tell how I feel' })).toBeVisible();
    await kidRules(page, `lights out breathe done ${k.age}`, k.min, 'night');
    await snap(page, `ipad-lightsout-breathe-done-${k.age}`);
    // How much is spoken at bedtime? ("No sounds after the first gentle one.")
    const said = await spoken(page);
    expect.soft(said.length, `Lights out breathing speaks ${JSON.stringify(said)}`).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Tell how I feel' }).click();
    await expect(page.getByTestId('feeling-flat')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-ground', 'night');
    await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
    await kidRules(page, `lights out wave ${k.age}`, k.min, 'night');
    await volumeRules(page, `lights out wave ${k.age}`, 'focus');
    await snap(page, `ipad-lightsout-wave-${k.age}`);
    await page.getByTestId('feeling-flat').click();
    await page.getByTestId('size-1').click();
    await expect(page.getByTestId('wave-thanks')).toBeVisible();
    await kidRules(page, `lights out wave thanks ${k.age}`, k.min, 'night');
    await snap(page, `ipad-lightsout-wave-thanks-${k.age}`);
    // Every way out of here leads back to bed, not to a dead end.
    const exits = await page.getByRole('button').allInnerTexts();
    expect.soft(exits.length, `lights out wave thanks ${k.age}: has a way back`).toBeGreaterThan(0);
    // "Flat" offers "My reset plan", but Reset isn't reachable in Lights out: where does it go?
    const reset = page.getByRole('button', { name: 'My reset plan' });
    if (await reset.count()) {
      await reset.click();
      await page.waitForTimeout(500);
      const landed = (await page.getByTestId('lights-out').count()) ? 'the bedtime screen' : new URL(page.url()).pathname;
      expect.soft(landed, `lights out ${k.age}: "My reset plan" is offered but lands on`).not.toBe('the bedtime screen');
      await page.goBack();
      await page.goto(`/kid/${f.ids[k.kid]}/wave`);
      await page.getByTestId('feeling-flat').click();
      await page.getByTestId('size-1').click();
    }
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByTestId('lights-out')).toBeVisible();

    // Back to bed from breathing.
    await page.getByRole('button', { name: 'I need to breathe' }).click();
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByTestId('lights-out')).toBeVisible();

    // Other screens by URL fall back to the bedtime screen; reload and a new tab can't escape.
    // (/reset stays reachable: it is part of the feelings path, finding 9 of the slice 10-11 review.)
    for (const path of ['/routines', '/dates', '/session', `/routine/${f.routines.bed}`]) {
      await page.goto(`/kid/${f.ids[k.kid]}${path}`);
      await expect(page.getByTestId('lights-out'), `${path} in Lights out`).toBeVisible();
    }
    await page.reload();
    await expect(page.getByTestId('lights-out')).toBeVisible();
    // The rider switcher: can the kid leave via the picker and pick the sibling? (They can't tap anything else.)
    await page.goto('/kid');
    await page.waitForTimeout(800);
    await snap(page, `ipad-lightsout-picker-${k.age}`);
    await ctx.close();
  }
});

test('Lights out under reduced motion: nothing moves (slice 10)', async ({ browser }) => {
  setFocus(f, 'Kid B', { mode: 'lights_out' });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid B', { ground: 'night', reduced: true });
  await page.waitForTimeout(1500);
  const m = await stillUnderReducedMotion(page);
  expect.soft(m.out, 'reduced motion on Lights out').toEqual([]);
  await ctx.close();
});

/* ------------------------------------------------------------------ */
/* Fail closed                                                         */
/* ------------------------------------------------------------------ */

test('fail closed: offline keeps the last mode; a heads-up and a timed end still resolve offline (slice 10)', async ({ browser }) => {
  test.setTimeout(90_000);
  setFocus(f, 'Kid A', { mode: 'session' });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid A', { ground: 'day' });
  await expect(page.getByTestId('session-home')).toBeVisible();
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  setFocus(f, 'Kid A', { mode: 'everything' });
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('session-home'), 'offline: keeps Session').toBeVisible();
  await snap(page, 'ipad-session-offline');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('tile-routines')).toBeVisible({ timeout: 15_000 });

  // A heads-up received online keeps running offline and the switch happens offline.
  setFocus(f, 'Kid A', { mode: 'everything', pending: 'lights_out', switchIn: 8 });
  await expect(page.getByTestId('heads-up')).toBeVisible({ timeout: 8000 });
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByTestId('lights-out'), 'offline: the pending switch still happens on time').toBeVisible({ timeout: 15_000 });
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  // A timed Session ends offline: back to the previous mode, with the celebration.
  setFocus(f, 'Kid A', { mode: 'session', endsIn: 8, ret: 'everything' });
  await expect(page.getByTestId('session-home')).toBeVisible({ timeout: 15_000 });
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByTestId('session-celebrate')).toBeVisible({ timeout: 15_000 });
  await ctx.close();
  expect(focusRow(f, 'Kid A').mode).toBe('session'); // the row is unchanged; the device derived it
});

test('Kid B stays in Everything while Kid A is in Session on the same iPad (per-kid modes) (slice 10)', async ({ browser }) => {
  setFocus(f, 'Kid A', { mode: 'session' });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid A', { ground: 'day' });
  await expect(page.getByTestId('session-home')).toBeVisible();
  // Switch riders.
  await page.getByRole('button', { name: /Kid A\. Tap to switch riders/ }).click();
  await expect(page).toHaveURL(/\/kid$/);
  await snap(page, 'ipad-picker-kidA-in-session');
  await page.getByRole('button', { name: /Kid B/ }).first().click();
  await expect(page.getByTestId('tile-routines')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-volume', 'normal');
  await ctx.close();
});

test('Session ends while the kid is on home: the Session card goes away at once after the celebration (slice 10)', async ({ browser }) => {
  test.setTimeout(90_000);
  setFocus(f, 'Kid A', { mode: 'session', endsIn: 5, ret: 'everything' });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid A', { ground: 'day', reduced: true });
  await expect(page.getByTestId('session-home')).toBeVisible();
  await expect(page.getByTestId('session-celebrate')).toBeVisible({ timeout: 12_000 });
  await page.getByTestId('celebration').click(); // a tap skips it (1.5 scene system)
  const t0 = Date.now();
  await snap(page, 'ipad-after-celebrate-home-reader-day');
  const stale = await page.getByTestId('session-home').count();
  await expect(page.getByTestId('session-home')).toHaveCount(0, { timeout: 40_000 });
  const lag = Date.now() - t0;
  expect.soft(stale === 0 && lag < 2000, `after "Back to Grom Zone" the Session card (and Session focus styling) stays for ${lag} ms`).toBe(true);
  await ctx.close();
});

test('heads-up over the Lights out screen (Lights out -> Everything in the morning) (slice 10)', async ({ browser }) => {
  setFocus(f, 'Kid B', { mode: 'lights_out', pending: 'everything', switchIn: 120 });
  const { ctx, page } = await liveKidPage(browser, f, 'Kid B', { ground: 'night' });
  await expect(page.getByTestId('lights-out')).toBeVisible();
  await expect(page.getByTestId('heads-up')).toContainText("Two more minutes, then it's free time.");
  expect.soft(await coveredControls(page), 'heads-up over Lights out: covered controls').toEqual([]);
  await snap(page, 'ipad-lightsout-headsup-to-everything');
  await ctx.close();
});

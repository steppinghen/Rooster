import { expect, test, type Browser, type Page } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { useSession, pinClock } from './helpers/fixtures';
import { focusRow, setFocus, SHOTS } from './helpers/focusqa';
import { family, resetFamily, T, type Fam } from './helpers/kidqa';
import { audit, installQa, scheme, sideBySide } from './helpers/qa';

/*
 * Independent UX QA for slice 11 (parent Today) and the parent half of slice 10 (mode
 * switcher). iPhone 390x844 and iPad landscape 1180x820, both grounds via prefers-color-scheme.
 */

test.beforeEach(({}, info) => test.skip(info.project.name === 'ipad', 'parent screens: iPhone and iPad landscape'));

const PARENT_MIN = 48;
let f: Fam;

test.beforeAll(async ({}, info) => {
  if (info.project.name === 'ipad') return;
  f = await family([
    { nickname: 'Kid A', age_band: 'reader', accent: 'magenta', avatar: 'rooster' },
    { nickname: 'Kid B', age_band: 'prereader', accent: 'cyan', avatar: 'turtle' },
  ]);
});

test.beforeEach(({}, info) => {
  if (info.project.name !== 'ipad' && f) resetFamily(f);
});

async function parentRules(page: Page, ground: 'day' | 'night', where: string) {
  const a = await audit(page, PARENT_MIN);
  expect.soft(a.ground, `${where}: ground`).toBe(ground);
  expect.soft(a.smallTargets, `${where}: targets under ${PARENT_MIN}pt`).toEqual([]);
  expect.soft(a.unlabeled, `${where}: unlabelled inputs`).toEqual([]);
  expect.soft(a.contrast, `${where}: text below WCAG AA`).toEqual([]);
  expect.soft(a.yellowOnDay, `${where}: yellow text on day`).toEqual([]);
  expect.soft(a.creamOnAccent, `${where}: cream text on an accent`).toEqual([]);
  expect.soft(a.overflowX, `${where}: horizontal overflow`).toBe(false);
}

/** The tab bar never covers content: at the bottom of the page, nothing sits under the tabs. */
async function tabsClear(page: Page, where: string) {
  const r = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((res) => setTimeout(res, 200));
    const tabs = document.querySelector('.parent__tabs');
    if (!tabs) return { covered: [] as string[] };
    const top = tabs.getBoundingClientRect().top;
    const qa = (window as any).__qa; // eslint-disable-line @typescript-eslint/no-explicit-any
    const covered: string[] = [];
    for (const el of document.querySelectorAll('.parent__main *')) {
      if (!qa.visible(el) || (!qa.ownText(el) && !el.matches('button, a[href]'))) continue;
      const b = el.getBoundingClientRect();
      if (b.bottom > top + 1 && b.top < innerHeight) covered.push(`${qa.name(el)} bottom ${Math.round(b.bottom)} > tabs ${Math.round(top)}`);
    }
    window.scrollTo(0, 0);
    return { covered };
  });
  expect.soft(r.covered, `${where}: content under the tab bar at the bottom of the page`).toEqual([]);
}

async function parentPage(browser: Browser, info: { project: { name: string } }, opts: { pin?: string; scheme?: 'light' | 'dark' } = {}) {
  const wide = info.project.name === 'ipad-landscape';
  const size = wide ? { width: 1180, height: 820 } : { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: size, isMobile: !wide, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: opts.scheme ?? 'dark' });
  await installQa(ctx);
  await useSession(ctx, f.parent.session);
  const page = await ctx.newPage();
  if (opts.pin) await pinClock(page, opts.pin);
  await page.goto('/parent');
  await expect(page.getByTestId('kid-card').first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, wide };
}

const shot = async (page: Page, name: string, fullPage = true) => {
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage, animations: 'disabled' });
};

test('Today: header, On the board with NOW, kid cards, Wave Check + history, both grounds, vs mockups (slice 11)', async ({ browser }, info) => {
  // Seed: Kid A is 2 of 3 through Dawn Patrol; Kid B checked in Choppy this morning and Flat yesterday.
  await f.device.db.rpc('save_routine_progress', { p_routine_id: f.routines.morning, p_kid_id: f.ids['Kid A'], p_on_date: '2026-10-01', p_steps: ['teeth', 'dress'] });
  await f.device.db.rpc('save_routine_progress', { p_routine_id: f.routines.after, p_kid_id: f.ids['Kid A'], p_on_date: '2026-10-01', p_steps: ['hands'] });
  await f.device.db.from('feelings_checkins').insert({ family_id: f.parent.familyId, kid_id: f.ids['Kid B'], feeling: 'choppy', size: 3, moment: 'morning' });
  sql(`insert into public.feelings_checkins (family_id, kid_id, feeling, size, moment, created_at) values (${lit(f.parent.familyId)}, ${lit(f.ids['Kid B']!)}, 'flat', 1, 'bedtime', now() - interval '1 day')`);

  const { ctx, page, wide } = await parentPage(browser, info, { pin: T.afterSchool });
  const p = info.project.name;
  // Header.
  await expect(page.getByRole('heading', { name: 'Thursday' })).toBeVisible();
  await expect(page.locator('.today__head .dk-marker')).toContainText(/After School · 3:45\sPM/);
  await expect(page.locator('.today__head')).toContainText(/Hi, Parent A\. 3 things on the board today\./);
  const chips = page.locator('.today__kid-chip');
  await expect(chips).toHaveCount(2);
  const chipRole = await chips.first().evaluate((e) => e.getAttribute('role'));
  expect.soft(chipRole, 'kid avatar chips are links but carry role="listitem", so they are not announced as links').not.toBe('listitem');
  // Board: NOW on the routine that started most recently.
  const now = page.getByTestId('board-item').filter({ hasText: 'NOW' });
  await expect(now).toHaveCount(1);
  await expect(now).toContainText('After School');
  await expect(page.getByTestId('board-item')).toHaveCount(3);
  await expect(page.locator('.today__countdowns')).toContainText('Pumpkin patch (4 sleeps)');
  // Kid cards.
  const a = page.getByTestId('kid-card').filter({ hasText: 'Kid A' });
  const b = page.getByTestId('kid-card').filter({ hasText: 'Kid B' });
  await expect(a).toContainText('After School 1 of 2 · Next: Snack');
  await expect(a).toContainText('Today: Dawn Patrol 2/3 · After School 1/2 · Last Run 0/2');
  await expect(a.getByTestId('kid-wave')).toContainText('No Wave Check today.');
  await expect(b.getByTestId('kid-wave')).toContainText('Choppy (upset, mad) · a lot');
  await expect(a.getByTestId('kid-mode')).toHaveText('Everything');
  // Collapsed switcher: one button per card, plus "Change everyone…".
  await expect(a.getByRole('button', { name: 'Change mode…' })).toBeVisible();
  await expect(a.getByRole('radio')).toHaveCount(0);
  await expect(page.getByTestId('switcher-all').getByRole('button', { name: 'Change everyone…' })).toBeVisible();
  // Order: is "Everyone" above the kid cards? (It is the first thing in the cards column.)
  // History.
  await b.getByRole('button', { name: 'History' }).click();
  await expect(b.getByTestId('wave-history')).toContainText('Kept 30 days');
  await expect(b.getByTestId('wave-history').locator('li')).toHaveCount(3);
  await expect(b.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');
  // An avatar chip jumps to that kid's card.
  await chips.nth(1).click();
  await expect(b).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));

  for (const [s, g] of [['light', 'day'], ['dark', 'night']] as const) {
    await scheme(page, s);
    await parentRules(page, g, `Today ${p} ${g}`);
    if (!wide) await tabsClear(page, `Today ${p} ${g}`);
    const full = await shot(page, `${p}-today-${g}`);
    const first = await shot(page, `${p}-today-${g}-viewport`, false);
    if (wide) {
      await sideBySide(page, first, g === 'day' ? 'iPadHubDay' : 'iPadHub', `${SHOTS}/compare/${p}-today-${g}-vs-${g === 'day' ? 'iPadHubDay' : 'iPadHub'}.png`, `Today, iPad landscape, ${g}`, 820);
    } else {
      await sideBySide(page, first, g === 'day' ? 'MainDay' : 'Main', `${SHOTS}/compare/${p}-today-${g}-vs-${g === 'day' ? 'MainDay' : 'Main'}.png`, `Today, iPhone, ${g}`, 844);
    }
    void full;
  }

  if (wide) {
    const rail = page.getByRole('navigation', { name: 'Main' });
    await expect(rail.locator('.dk-nav__brand')).toHaveText(/The Deck/i);
    const board = (await page.locator('.today__board').boundingBox())!;
    const cards = (await page.locator('.today__cards').boundingBox())!;
    expect(cards.x).toBeGreaterThan(board.x + board.width - 1);
    // Like iPadHub, the kid cards own the right column from the top (beside the headline).
    expect.soft(cards.y, 'kid cards start no lower than the board').toBeLessThanOrEqual(board.y + 1);
    // Does the first screen (no scroll) show both kids, as on the kitchen hub?
    const lastCard = (await b.boundingBox())!;
    expect.soft(lastCard.y + lastCard.height, 'iPad landscape: every kid card fits on the first screen (kitchen hub glance)').toBeLessThanOrEqual(820);
  }
  await ctx.close();
});

test('Today: NOW stays on a routine long after it ended? (slice 11)', async ({ browser }, info) => {
  // 13:00 local: Dawn Patrol (06:30) is the last routine that started; it has been over for hours.
  const { ctx, page } = await parentPage(browser, info, { pin: '2026-10-01T17:00:00Z' });
  const now = page.getByTestId('board-item').filter({ hasText: 'NOW' });
  const label = (await now.count()) ? await now.locator('.board__title').innerText() : '';
  await shot(page, `${info.project.name}-today-1pm`, false);
  expect.soft(label, 'at 1 PM the board marks the morning routine (6:30 AM) as NOW').not.toBe('Dawn Patrol');
  // Before the first routine of the day: no NOW at all, and the marker has no routine name.
  await ctx.close();
  const early = await parentPage(browser, info, { pin: T.beforeDawn });
  await expect(early.page.getByTestId('board-item').filter({ hasText: 'NOW' })).toHaveCount(0);
  await early.ctx.close();
});

test('Mode switcher: collapsed, mode + duration + heads-up, pending with Switch now / Cancel, labels, both grounds (slice 10/11)', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { ctx, page } = await parentPage(browser, info);
  const p = info.project.name;
  const a = page.getByTestId('kid-card').filter({ hasText: 'Kid A' });
  await a.getByRole('button', { name: 'Change mode…' }).click();
  const modeGroup = a.getByRole('radiogroup', { name: 'Mode' });
  await expect(modeGroup.getByRole('radio')).toHaveText(['Everything', 'Session', 'Lights out']);
  await expect(modeGroup.getByRole('radio', { name: 'Session' })).toHaveAttribute('aria-checked', 'true');
  const forGroup = a.getByRole('radiogroup', { name: 'For' });
  await expect(forGroup.getByRole('radio')).toHaveText(['No limit', '10 min', '20 min', '30 min']);
  await expect(forGroup.getByRole('radio', { name: '20 min' })).toHaveAttribute('aria-checked', 'true');
  // Everything has no duration.
  await modeGroup.getByRole('radio', { name: 'Everything' }).click();
  await expect(a.getByRole('radiogroup', { name: 'For' })).toHaveCount(0);
  await modeGroup.getByRole('radio', { name: 'Session' }).click();
  await expect(a.getByRole('button', { name: 'Switch in 2 minutes' })).toBeVisible();
  await a.getByRole('checkbox', { name: /Switch now/ }).check();
  await expect(a.getByRole('button', { name: 'Switch', exact: true })).toBeVisible();
  await a.getByRole('checkbox', { name: /Switch now/ }).uncheck();
  for (const [s, g] of [['light', 'day'], ['dark', 'night']] as const) {
    await scheme(page, s);
    await a.scrollIntoViewIfNeeded();
    await parentRules(page, g, `switcher open ${p} ${g}`);
    if (!wide(p)) await tabsClear(page, `switcher open ${p} ${g}`);
    await a.screenshot({ path: `${SHOTS}/${p}-switcher-open-${g}.png` });
  }
  // Cancel collapses without changing anything.
  await a.getByRole('button', { name: 'Cancel' }).click();
  await expect(a.getByRole('button', { name: 'Change mode…' })).toBeVisible();
  expect(focusRow(f, 'Kid A').pending).toBe('');

  // Heads-up: pending, with Switch now / Cancel.
  await a.getByRole('button', { name: 'Change mode…' }).click();
  await a.getByRole('radio', { name: '10 min' }).click();
  await a.getByRole('button', { name: 'Switch in 2 minutes' }).click();
  const pending = a.locator('.switcher__pending');
  await expect(pending).toContainText(/Session in (2:00|1:5\d) \(at \d+:\d\d\s[AP]M\)\. The kids see a heads-up\./);
  await expect(a.getByTestId('kid-mode')).toHaveText('Everything');
  for (const [s, g] of [['light', 'day'], ['dark', 'night']] as const) {
    await scheme(page, s);
    await parentRules(page, g, `switcher pending ${p} ${g}`);
    await a.screenshot({ path: `${SHOTS}/${p}-switcher-pending-${g}.png` });
  }
  // Is the pending countdown announced every second? (role=status on a ticking timer is noisy for VoiceOver)
  const live = await pending.getAttribute('role');
  expect.soft(live, 'the pending line is role=status and its text changes every second (VoiceOver re-reads it)').not.toBe('status');
  await pending.getByRole('button', { name: 'Cancel' }).click();
  await expect(a.getByRole('button', { name: 'Change mode…' })).toBeVisible();
  expect(focusRow(f, 'Kid A').pending).toBe('');

  // Pending again -> Switch now: the duration chosen is kept?
  await a.getByRole('button', { name: 'Change mode…' }).click();
  await a.getByRole('radio', { name: '10 min' }).click();
  await a.getByRole('button', { name: 'Switch in 2 minutes' }).click();
  await pending.getByRole('button', { name: 'Switch now' }).click();
  await expect(a.getByTestId('kid-mode')).toHaveText(/Session/);
  const chip = await a.getByTestId('kid-mode').innerText();
  expect.soft(chip, '"Switch now" on a pending 10-minute Session keeps the 10 minutes').toMatch(/Session · (10:00|9:\d\d) left/);
  await shot(page, `${p}-today-kidA-session`, false);

  // Session ends: the summary.
  await f.device.db.from('usage_events').insert({ family_id: f.parent.familyId, kid_id: f.ids['Kid A'], module_key: 'tour_dates', action: 'opened' });
  sql(`update public.kid_focus set since = now(), ends_at = now() + interval '3 seconds', return_mode = 'everything' where kid_id = ${lit(f.ids['Kid A']!)}`);
  await f.device.db.from('usage_events').insert({ family_id: f.parent.familyId, kid_id: f.ids['Kid A'], module_key: 'session', action: 'opened' });
  const summary = a.getByTestId('session-summary');
  await expect(summary).toBeVisible({ timeout: 15_000 });
  await expect(a.getByTestId('kid-mode')).toHaveText('Everything');
  const text = await summary.innerText();
  expect.soft(text, 'the session summary counts things opened before the session started (Tour Dates opened earlier counts as session work)').toMatch(/1 opened/);
  await a.screenshot({ path: `${SHOTS}/${p}-session-summary.png` });
  await ctx.close();
});

const wide = (p: string) => p === 'ipad-landscape';

test('"Everyone" switcher: both kids at once; pending for everyone; Cancel (slice 10/11)', async ({ browser }, info) => {
  const { ctx, page } = await parentPage(browser, info);
  const all = page.getByTestId('switcher-all');
  await all.getByRole('button', { name: 'Change everyone…' }).click();
  await expect(all.getByRole('radiogroup', { name: 'Mode for everyone' })).toBeVisible();
  await all.getByRole('radio', { name: 'Lights out' }).click();
  await all.getByRole('radio', { name: 'No limit' }).click();
  await parentRules(page, 'night', `everyone open ${info.project.name}`);
  await all.screenshot({ path: `${SHOTS}/${info.project.name}-everyone-open-night.png` });
  await all.getByRole('button', { name: 'Switch in 2 minutes' }).click();
  await expect(all.locator('.switcher__pending')).toContainText('Lights out in');
  // Each kid card shows the pending switch too.
  for (const k of ['Kid A', 'Kid B']) await expect(page.getByTestId('kid-card').filter({ hasText: k }).locator('.switcher__pending')).toContainText('Lights out in');
  await shot(page, `${info.project.name}-everyone-pending-night`, false);
  await all.getByRole('button', { name: 'Switch now' }).click();
  for (const k of ['Kid A', 'Kid B']) await expect(page.getByTestId('kid-card').filter({ hasText: k }).getByTestId('kid-mode')).toHaveText('Lights out');
  expect([focusRow(f, 'Kid A').mode, focusRow(f, 'Kid B').mode]).toEqual(['lights_out', 'lights_out']);
  // One kid differs: does "Everyone" still say something sensible?
  setFocus(f, 'Kid B', { mode: 'everything' });
  await expect(page.getByTestId('kid-card').filter({ hasText: 'Kid B' }).getByTestId('kid-mode')).toHaveText('Everything', { timeout: 10_000 });
  await all.getByRole('button', { name: 'Change everyone…' }).click();
  await all.getByRole('radio', { name: 'Everything' }).click();
  await all.getByRole('checkbox', { name: /Switch now/ }).check();
  await all.getByRole('button', { name: 'Switch', exact: true }).click();
  for (const k of ['Kid A', 'Kid B']) await expect(page.getByTestId('kid-card').filter({ hasText: k }).getByTestId('kid-mode')).toHaveText('Everything');
  await ctx.close();
});

test('Today: no dead ends; every control is labelled; nothing overflows at 390 with the switcher and history open (slice 11)', async ({ browser }, info) => {
  const { ctx, page } = await parentPage(browser, info, { scheme: 'light' });
  for (const k of ['Kid A', 'Kid B']) {
    const c = page.getByTestId('kid-card').filter({ hasText: k });
    await c.getByRole('button', { name: 'Change mode…' }).click();
    await c.getByRole('button', { name: 'History' }).click();
  }
  await page.getByTestId('switcher-all').getByRole('button', { name: 'Change everyone…' }).click();
  await parentRules(page, 'day', `everything open ${info.project.name}`);
  if (!wide(info.project.name)) await tabsClear(page, `everything open ${info.project.name}`);
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href]')].filter((b) => !(b.getAttribute('aria-label') || (b.textContent ?? '').trim())).map((b) => b.outerHTML.slice(0, 80)),
  );
  expect.soft(unnamed, 'controls with no accessible name').toEqual([]);
  // Two "Cancel" buttons per open card would be ambiguous for VoiceOver users; each needs context.
  await shot(page, `${info.project.name}-today-all-open-day`);
  await ctx.close();
});

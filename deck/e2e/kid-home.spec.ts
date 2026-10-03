import { expect, test, type Page } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { addEvent, addKids, addRoutine, dayFrom, makeParent, MORNING_STEPS, pairDevice, pinClock, useSession } from './helpers/fixtures';
import { doSteps } from './helpers/kidqa';

const SHOTS = 'review/screenshots/slice-5';
const SEVEN_AM = '2026-10-01T11:00:00Z'; // 7:00 am in New York (the fixture family's time zone)

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'kid screens are tested on the iPad profile'));

async function noScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1), 'kid home must not scroll').toBe(true);
}

test('The Point answers "what\'s next" and runs a routine (slice 5; B2 since Phase 1.5)', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [
    { nickname: 'Kid A', age_band: 'reader' },
    { nickname: 'Kid B', age_band: 'prereader' },
  ]);
  const routineId = await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: MORNING_STEPS });
  await addEvent(parent, { title: 'Beach trip', icon: 'beach', on_date: dayFrom(SEVEN_AM, 12), kind: 'trip' });
  const device = await pairDevice(parent);

  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ctx, device.session, { 'deck.currentKid': ids['Kid B']! });
  const page = await ctx.newPage();
  await pinClock(page, SEVEN_AM);
  await page.goto(`/kid/${ids['Kid B']}`);
  // The morning still plays in Right now first, once a day.
  await expect(page.getByTestId('point-still')).toHaveCount(0, { timeout: 6000 });

  // What's next comes first: Right now.
  const hero = page.getByTestId('right-now');
  await expect(hero).toContainText('Dawn Patrol');
  await expect(page.getByTestId('up-next')).toHaveText('Brush teeth');
  await expect(page.locator('html')).toHaveAttribute('data-ground', 'day'); // Auto: after Dawn Patrol starts
  // Wave Check on the dock; the countdown on its card.
  await expect(page.getByTestId('dock-wave_check')).toBeVisible();
  await expect(page.getByTestId('card-countdown')).toContainText('12 sleeps');
  await expect(page.getByTestId('card-countdown')).toContainText('Beach');
  await noScroll(page);
  // Pre-reader tap targets: at least 80 pt.
  for (const el of [hero.getByRole('button', { name: /Keep going/ }), hero.getByRole('button', { name: 'Read it to me' }), page.getByTestId('dock-wave_check'), page.getByRole('button', { name: /Tap to switch riders/ })]) {
    const box = (await el.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(80);
  }
  await page.screenshot({ path: `${SHOTS}/ipad-prereader-day.png` });

  // Keep going opens the checklist; a step done there shows on The Point.
  await hero.getByRole('button', { name: /Keep going/ }).click();
  await page.getByRole('button', { name: 'I did it!' }).click();
  await page.getByTestId('dock-home').or(page.getByRole('button', { name: 'Home' })).first().click();
  await expect(page.getByTestId('up-next')).toHaveText('Get dressed');

  // Progress survives a reload.
  await page.reload();
  await expect(page.getByTestId('up-next')).toHaveText('Get dressed');

  // Offline: taps still work and sync when the connection is back.
  await ctx.setOffline(true);
  await doSteps(page, 1);
  await expect(page.getByTestId('step-text')).toHaveText('Breakfast');
  const saved = () => sql(`select completed_steps from public.routine_completions where routine_id = ${lit(routineId)} and kid_id = ${lit(ids['Kid B']!)}`)[0];
  expect(saved()).toBe('{teeth}');
  await ctx.setOffline(false);
  await page.clock.runFor(11_000); // the outbox retries every 10 s
  await expect.poll(saved, { timeout: 10_000 }).toBe('{teeth,dress}');

  // Last step: a short celebration, then back to The Point with the routine done.
  await page.getByRole('button', { name: 'I did it!' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dawn Patrol done!' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ipad-celebrate.png` });
  await page.clock.runFor(3000);
  await expect(page.getByTestId('right-now')).toHaveAttribute('data-state', 'done');
  await expect.poll(() => sql(`select completed_at is not null from public.routine_completions where routine_id = ${lit(routineId)} and kid_id = ${lit(ids['Kid B']!)}`)[0]).toBe('t');
  expect(sql(`select count(*) from public.usage_events where kid_id = ${lit(ids['Kid B']!)} and action = 'completed'`)).toEqual(['1']);
  await noScroll(page);

  // Avatar: one tap back to "Who's riding?"
  await page.getByRole('button', { name: /Tap to switch riders/ }).click();
  await expect(page.getByRole('heading', { name: "Who's riding?" })).toBeVisible();

  // Kid A (reader): text-forward, their own routine progress.
  await page.getByTestId('pick-kid').filter({ hasText: 'Kid A' }).click();
  await expect(page.getByTestId('up-next')).toHaveText('Brush teeth', { timeout: 6000 });
  await expect(page.locator('main')).toHaveAttribute('data-age', 'reader');
  await noScroll(page);
  await page.screenshot({ path: `${SHOTS}/ipad-reader-day.png` });
  await ctx.close();
});

test('at night the home is on the night ground; bedtime routine is Last Run (slice 5)', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [{ nickname: 'Kid A', age_band: 'reader' }]);
  await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: MORNING_STEPS });
  await addRoutine(parent, { name: 'Last Run', slot: 'bedtime', starts_at: '19:30', steps: [{ id: 'pjs', text: 'Pajamas on', icon: 'shirt' }, { id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }] });
  const device = await pairDevice(parent);
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ctx, device.session, { 'deck.currentKid': ids['Kid A']! });
  const page = await ctx.newPage();
  await pinClock(page, '2026-10-02T00:00:00Z'); // 8:00 pm New York
  await page.goto(`/kid/${ids['Kid A']}`);
  await expect(page.getByTestId('right-now')).toContainText('Last Run');
  await expect(page.locator('html')).toHaveAttribute('data-ground', 'night');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'lastrun');
  await page.screenshot({ path: `${SHOTS}/ipad-reader-lastrun.png` });
  await ctx.close();
});

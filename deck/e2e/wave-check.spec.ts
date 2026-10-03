import { expect, test } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { addKids, addRoutine, makeParent, MORNING_STEPS, pairDevice, pinClock, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-9';
const AFTER_SCHOOL = '2026-10-01T19:45:00Z'; // 3:45 pm New York
const BEDTIME = '2026-10-02T00:00:00Z'; // 8:00 pm New York

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'kid screens are tested on the iPad profile'));

async function setup(browser: import('@playwright/test').Browser, at: string, reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  const parent = await makeParent();
  const ids = await addKids(parent, [{ nickname: 'Kid B', age_band: 'prereader' }]);
  await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: MORNING_STEPS });
  await addRoutine(parent, { name: 'After School', slot: 'after_school', starts_at: '15:30', steps: [{ id: 'hands', text: 'Wash hands', icon: 'soap' }] });
  await addRoutine(parent, { name: 'Last Run', slot: 'bedtime', starts_at: '19:30', steps: [{ id: 'pjs', text: 'Pajamas on', icon: 'shirt' }] });
  const device = await pairDevice(parent);
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, reducedMotion });
  await useSession(ctx, device.session, { 'deck.currentKid': ids['Kid B']! });
  const page = await ctx.newPage();
  await pinClock(page, at);
  return { parent, ids, ctx, page };
}

test('Wave Check, reset plan and balloon breathing (slice 9)', async ({ browser }) => {
  const { ids, ctx, page } = await setup(browser, AFTER_SCHOOL);
  const kidId = ids['Kid B']!;
  await page.goto(`/kid/${kidId}`);
  await page.getByTestId('dock-wave_check').click();

  await expect(page.getByText("How's your wave?")).toBeVisible();
  // Each face carries its surf word AND the plain feeling word.
  for (const [k, words] of [['pumping', 'Happy, excited'], ['rolling', 'Okay, calm'], ['flat', 'Sad, tired'], ['choppy', 'Upset, mad']]) {
    await expect(page.getByTestId(`feeling-${k}`)).toContainText(words!);
    const box = (await page.getByTestId(`feeling-${k}`).boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(80);
  }
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/ipad-wave-pick.png` });

  await page.getByTestId('feeling-choppy').click();
  await expect(page.getByText('How big is your choppy wave?')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ipad-wave-size.png` });
  await page.getByTestId('size-3').click();
  await expect(page.getByTestId('wave-thanks')).toBeVisible();
  // No score, points or reward anywhere.
  await expect(page.getByTestId('wave-thanks')).not.toContainText(/point|score|star|sticker|reward/i);
  await expect.poll(() => sql(`select feeling || ':' || size || ':' || moment from public.feelings_checkins where kid_id = ${lit(kidId)}`)[0]).toBe('choppy:3:after_school');

  await page.getByRole('button', { name: 'My reset plan' }).click();
  await page.getByRole('button', { name: 'Hot face' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Balloon breaths' }).click();
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByTestId('reset-plan')).toContainText('Go in my shell');
  await expect.poll(() => sql(`select array_to_string(body_signs, ',') || '|' || array_to_string(tools, ',') from public.reset_plans where kid_id = ${lit(kidId)}`)[0]).toBe('hot_face|turtle,balloon');
  await page.screenshot({ path: `${SHOTS}/ipad-reset-plan.png` });

  await page.getByTestId('reset-plan').getByRole('button', { name: 'Go in my shell' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('breathe-label')).toHaveText('Breathe in…');
  await page.clock.runFor(4100);
  await expect(page.getByTestId('breathe-label')).toHaveText('Breathe out…');
  await page.screenshot({ path: `${SHOTS}/ipad-breathe.png` });
  for (let i = 0; i < 6; i++) await page.clock.runFor(5100);
  await expect(page.getByTestId('breathe-label')).toHaveText('Nice and calm.');
  await ctx.close();
});

test('bedtime Wave Check is "How was your day?" on night; reduced motion keeps the balloon still (slice 9)', async ({ browser }) => {
  const { ids, ctx, page } = await setup(browser, BEDTIME, 'reduce');
  await page.goto(`/kid/${ids['Kid B']}/wave`);
  await expect(page.getByText('How was your day?')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-ground', 'night');
  await page.screenshot({ path: `${SHOTS}/ipad-wave-bedtime.png` });
  await page.goto(`/kid/${ids['Kid B']}/breathe`);
  await page.getByRole('button', { name: 'Start' }).click();
  expect(await page.locator('.breathe__balloon').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await ctx.close();
});

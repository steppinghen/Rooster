import { expect, test } from '@playwright/test';
import { addKids, makeParent, pairDevice, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-4';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'kid screens are tested on the iPad profile'));

test('kid profile picker and PIN (slice 4)', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [
    { nickname: 'Kid A', age_band: 'reader', pin: '1234' },
    { nickname: 'Kid B', age_band: 'prereader' },
  ]);
  const device = await pairDevice(parent);
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ctx, device.session);
  const page = await ctx.newPage();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Who's riding?" })).toBeVisible();
  const cards = page.getByTestId('pick-kid');
  await expect(cards).toHaveCount(2);
  await expect(cards.first().getByLabel('has a secret code')).toBeVisible();
  for (const c of await cards.all()) {
    const box = (await c.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(80);
  }
  // No scrolling on the picker.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/ipad-picker.png` });

  // Kid A has a PIN: a wrong code gets a gentle retry, the right one opens the profile.
  await cards.filter({ hasText: 'Kid A' }).click();
  await expect(page.getByText('Type your secret code')).toBeVisible();
  for (const key of await page.locator('.pin-key').all()) {
    const box = (await key.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(80);
  }
  for (const d of '0000') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Not quite. Try again!')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ipad-pin-wrong.png` });
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Hi, Kid A!')).toBeVisible();

  // Back on the picker, Kid B has no PIN.
  await page.goto('/kid');
  await cards.filter({ hasText: 'Kid B' }).click();
  await expect(page.getByText('Hi, Kid B!')).toBeVisible();

  // Kid B can't open Kid A's profile by URL: it goes back to the picker.
  await page.goto(`/kid/${ids['Kid A']}`);
  await expect(page.getByRole('heading', { name: "Who's riding?" })).toBeVisible();

  // Reopening keeps the current kid (no PIN asked again for the open profile).
  await page.goto(`/kid/${ids['Kid B']}`);
  await page.reload();
  await expect(page.getByText('Hi, Kid B!')).toBeVisible();
  await ctx.close();
});

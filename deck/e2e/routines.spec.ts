import { expect, test } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { addKids, makeParent, pairDevice, pinClock, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-7';
const SEVEN_AM = '2026-10-01T11:00:00Z';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'phone + iPad flow runs once, on the iPad profile'));

test('parent builds Dawn Patrol; kid runs it step by step; device ground picker (slice 7)', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [{ nickname: 'Kid A', age_band: 'reader' }]);
  const device = await pairDevice(parent);

  // ----- Phone: build the routine from a template -----
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await useSession(phone, parent.session);
  const p = await phone.newPage();
  await p.goto('/parent/office');
  await p.getByRole('button', { name: '+ Dawn Patrol' }).click();
  const editor = p.getByTestId('routine-editor');
  await expect(editor.getByTestId('routine-step')).toHaveCount(6);
  await editor.getByLabel('Step 1').fill('Wake up and potty');
  await editor.getByLabel('Add a step').fill('Feed the turtle');
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await editor.getByRole('radiogroup', { name: 'Picture for Feed the turtle' }).getByRole('radio', { name: 'water' }).click();
  await editor.getByTestId('routine-step').last().getByRole('button', { name: 'Move up' }).click();
  await p.screenshot({ path: `${SHOTS}/iphone-routine-editor.png`, fullPage: true });
  await editor.getByRole('button', { name: 'Save routine' }).click();
  await expect(p.getByTestId('routine-row')).toContainText('7 steps');
  const steps = sql(`select string_agg(e->>'id', ',' order by n) from public.routines r, jsonb_array_elements(r.steps) with ordinality x(e, n) where r.family_id = ${lit(parent.familyId)}`)[0];
  expect(steps).toBe('potty,dress,breakfast,teeth,shoes,feed-the-turtle,backpack');

  // Device ground: Night, whatever the clock says.
  await p.getByRole('radiogroup', { name: 'Look on Kitchen iPad' }).getByRole('radio', { name: 'Night' }).click();
  await expect.poll(() => sql(`select ground from public.devices where id = ${lit(device.deviceId)}`)[0]).toBe('night');

  // ----- iPad: run it -----
  const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ipad, device.session, { 'deck.currentKid': ids['Kid A']! });
  const k = await ipad.newPage();
  await pinClock(k, SEVEN_AM);
  await k.goto(`/kid/${ids['Kid A']}`);
  await expect(k.locator('html')).toHaveAttribute('data-ground', 'night'); // the device setting wins over Auto
  // Since Phase 1.5 (The Point): Right now's "Keep going" opens the running routine.
  await k.getByTestId('right-now').getByRole('button', { name: /Keep going/ }).click();
  await expect(k.getByTestId('step-text')).toHaveText('Wake up and potty');
  await expect(k.getByText('Step 1 of 7')).toBeVisible();
  // Home and Wave Check are one tap away on every kid screen.
  await expect(k.getByRole('button', { name: 'Home' })).toBeVisible();
  await expect(k.getByRole('button', { name: 'Wave Check' })).toBeVisible();
  expect(await k.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await k.screenshot({ path: `${SHOTS}/ipad-routine-step.png` });
  await k.getByRole('button', { name: 'I did it!' }).click();
  await expect(k.getByTestId('step-text')).toHaveText('Get dressed');
  await k.getByRole('button', { name: 'Home' }).click();
  await expect(k.getByTestId('up-next')).toHaveText('Get dressed');
  await phone.close();
  await ipad.close();
});

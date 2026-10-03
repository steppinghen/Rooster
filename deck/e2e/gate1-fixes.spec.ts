import { expect, test } from '@playwright/test';
import { ORIGIN } from './helpers/agent';
import { lit, sql } from './helpers/db';
import { addKids, addRoutine, makeParent, pairDevice, pinClock, useSession } from './helpers/fixtures';
import { doSteps } from './helpers/kidqa';

// Fixes from the phase review (REVIEW.md X1, X3, X4).
test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'iPad profile'));

test('kid taps work on a plain-http origin (Tailscale), where crypto.randomUUID is missing (X1)', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [{ nickname: 'Kid A', age_band: 'prereader' }]);
  const device = await pairDevice(parent);
  // The Mac's Tailscale address: not a secure context, like the iPad over http.
  const insecure = ORIGIN;
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, baseURL: insecure });
  await useSession(ctx, device.session, { 'deck.currentKid': ids['Kid A']! });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/kid/${ids['Kid A']}`);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await page.getByTestId('dock-wave_check').click();
  await expect(page.getByTestId('feeling-rolling')).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('a module switched off in Back Office disappears from the iPad, URL included; Wave Check invite after a routine (X3; X4 via a check-in moment since 1.5)', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [{ nickname: 'Kid A', age_band: 'reader' }]);
  const dawn = await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: [{ id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }] });
  // X4 since Phase 1.5: the invite after a routine is a check-in moment anchored to it.
  sql(`insert into public.checkin_moments (family_id, kid_id, label, anchor_routine_id) values (${lit(parent.familyId)}, ${lit(ids['Kid A']!)}, 'After Dawn Patrol', ${lit(dawn)})`);
  const device = await pairDevice(parent);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await useSession(phone, parent.session);
  const p = await phone.newPage();
  await p.goto('/parent/office');
  await expect(p.getByTestId('module-wave_check')).toContainText('Always on');
  await p.getByTestId('module-tour_dates').getByRole('checkbox').uncheck();
  await expect(p.getByTestId('about')).toContainText('Fluent Emoji');

  const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ipad, device.session, { 'deck.currentKid': ids['Kid A']! });
  const k = await ipad.newPage();
  await pinClock(k, '2026-10-01T11:00:00Z');
  await k.goto(`/kid/${ids['Kid A']}`);
  // Tour Dates off: the countdown card stays (fixed slots) but opens nothing.
  await expect(k.getByTestId('card-countdown').locator('.pt-card__arrow')).toHaveCount(0);
  await expect(k.getByTestId('dock-wave_check')).toBeVisible();
  await k.goto(`/kid/${ids['Kid A']}/dates`);
  await expect(k.getByTestId('up-next')).toBeVisible(); // bounced home
  await doSteps(k, 1);
  await k.clock.runFor(3000);
  await expect(k.getByTestId('wave-prompt')).toContainText('How’s your wave?');
  await k.getByTestId('wave-prompt').getByRole('button', { name: 'Wave Check' }).click();
  await expect(k.getByTestId('feeling-pumping')).toBeVisible();
  await phone.close();
  await ipad.close();
});

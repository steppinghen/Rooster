import { expect, test } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { addKids, addRoutine, makeParent, MORNING_STEPS, pairDevice, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-10';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'phone + iPad flow runs once, on the iPad profile'));

test('focus modes from the phone reach the iPad live; reload and offline cannot escape (slice 10)', async ({ browser }) => {
  test.setTimeout(90_000);
  const parent = await makeParent();
  const ids = await addKids(parent, [
    { nickname: 'Kid A', age_band: 'reader' },
    { nickname: 'Kid B', age_band: 'prereader' },
  ]);
  await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '00:01', steps: MORNING_STEPS });
  const device = await pairDevice(parent);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await useSession(phone, parent.session);
  const p = await phone.newPage();
  await p.goto('/parent');
  const cardA = p.getByTestId('kid-card').filter({ hasText: 'Kid A' });
  await expect(cardA.getByTestId('kid-mode')).toHaveText('Everything');

  const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ipad, device.session, { 'deck.currentKid': ids['Kid A']! });
  const k = await ipad.newPage();
  await k.goto(`/kid/${ids['Kid A']}`);
  await expect(k.getByTestId('up-next')).toBeVisible();
  await expect(k.locator('html')).toHaveAttribute('data-volume', 'normal');

  // Lights out with the 2-minute heads-up: the iPad shows it live, without reloading.
  await cardA.getByRole('button', { name: 'Change mode…' }).click();
  await cardA.getByRole('radio', { name: 'Lights out' }).click();
  await cardA.getByRole('radio', { name: 'No limit' }).click();
  await cardA.getByRole('button', { name: 'Switch in 2 minutes' }).click();
  await expect(cardA.getByText(/Lights out.*in 1:5\d|Lights out.*in 2:00/)).toBeVisible();
  const headsUp = k.getByTestId('heads-up');
  await expect(headsUp).toContainText("Two more minutes, then it's lights out time.", { timeout: 8000 });
  await expect(k.getByTestId('heads-up-left')).toHaveText(/^1:5\d|^2:00$/);
  await expect(k.getByRole('button', { name: 'Wave Check' }).or(k.getByTestId('dock-wave_check'))).toBeVisible(); // heads-up never blocks feelings
  await k.screenshot({ path: `${SHOTS}/ipad-heads-up.png` });

  // "Switch now" from the phone.
  await cardA.getByRole('button', { name: 'Switch now' }).click();
  await expect(k.getByTestId('lights-out')).toBeVisible({ timeout: 8000 });
  await expect(k.locator('html')).toHaveAttribute('data-ground', 'night');
  await expect(k.locator('html')).toHaveAttribute('data-volume', 'focus');
  await expect(k.getByRole('button')).toHaveCount(1); // "I need to breathe" and nothing else
  await k.screenshot({ path: `${SHOTS}/ipad-lights-out.png` });

  // Reloading or typing another screen's address can't escape.
  await k.reload();
  await expect(k.getByTestId('lights-out')).toBeVisible();
  await k.goto(`/kid/${ids['Kid A']}/routines`);
  await expect(k.getByTestId('lights-out')).toBeVisible();
  // Feelings are never locked out: breathing, then Wave Check.
  await k.getByRole('button', { name: 'I need to breathe' }).click();
  await expect(k.getByRole('button', { name: 'Start' })).toBeVisible();
  await k.goto(`/kid/${ids['Kid A']}/wave`);
  await expect(k.getByTestId('feeling-choppy')).toBeVisible();
  // Kid B, on the same iPad, is still in Everything (modes are per kid).
  expect(sql(`select mode from public.kid_focus where kid_id = ${lit(ids['Kid B']!)}`)).toEqual(['everything']);

  // Offline: the iPad keeps the last mode it received (fail closed).
  await k.goto(`/kid/${ids['Kid A']}`);
  await ipad.setOffline(true);
  await cardA.getByRole('button', { name: 'Change mode…' }).click();
  await cardA.getByRole('radio', { name: 'Everything' }).click();
  await cardA.getByRole('checkbox', { name: /Switch now/ }).check();
  await cardA.getByRole('button', { name: 'Switch', exact: true }).click();
  await expect(cardA.getByTestId('kid-mode')).toHaveText('Everything');
  await k.waitForTimeout(2000);
  await expect(k.getByTestId('lights-out')).toBeVisible();
  await ipad.setOffline(false);
  await k.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(k.getByTestId('up-next')).toBeVisible({ timeout: 10_000 });

  // A timed Session: time left on the iPad, then the celebration when it ends.
  await cardA.getByRole('button', { name: 'Change mode…' }).click();
  await cardA.getByRole('radio', { name: 'Session' }).click();
  await cardA.getByRole('radio', { name: '10 min' }).click();
  await cardA.getByRole('checkbox', { name: /Switch now/ }).check();
  await cardA.getByRole('button', { name: 'Switch', exact: true }).click();
  // Just back online: the Realtime socket may still be reconnecting (with backoff); the iPad
  // catches up on resubscribe or by its 60 s fallback. Real-device check on the test list.
  await expect(k.getByTestId('session-home')).toBeVisible({ timeout: 20_000 });
  await expect(k.getByTestId('time-left')).toContainText(/Session · (10:00|9:5\d) left/);
  await expect(k.getByTestId('dock-my_week')).toHaveCount(0); // hidden, not greyed out
  await expect(k.getByTestId('dock-wave_check')).toBeVisible();
  await k.screenshot({ path: `${SHOTS}/ipad-session.png` });
  await k.getByRole('button', { name: 'Start Session' }).click();
  await expect(k.getByTestId('session-placeholder')).toBeVisible();
  // End it a few seconds from now (as if 10 minutes had passed).
  sql(`update public.kid_focus set ends_at = now() + interval '3 seconds' where kid_id = ${lit(ids['Kid A']!)}`);
  await expect(k.getByTestId('session-celebrate')).toBeVisible({ timeout: 15_000 });
  await expect(k.getByTestId('session-celebrate')).toHaveAttribute('data-volume', 'normal'); // the payoff is loud
  await k.screenshot({ path: `${SHOTS}/ipad-session-done.png` });
  // It goes by itself after a few seconds, back to Grom Zone.
  await expect(k.getByTestId('session-celebrate')).toBeHidden({ timeout: 10_000 });
  await expect(k.getByTestId('up-next')).toBeVisible();
  await expect(cardA.getByTestId('session-summary')).toContainText('Session ended', { timeout: 15_000 });
  await p.screenshot({ path: `${SHOTS}/iphone-today.png`, fullPage: true });

  // A device can never switch modes, even by calling the API directly.
  const { error } = await device.db.rpc('set_focus', { p_kid_ids: [ids['Kid A']], p_mode: 'everything', p_now: true });
  expect(error?.code).toBe('42501');
  await phone.close();
  await ipad.close();
});

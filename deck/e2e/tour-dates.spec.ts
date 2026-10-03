import { expect, test } from '@playwright/test';
import { addKids, dayFrom, makeParent, pairDevice, pinClock, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-8';
const SEVEN_AM = '2026-10-01T11:00:00Z';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'phone + iPad flow runs once, on the iPad profile'));

test('parent adds events on the month view; kid sees sleeps until (slice 8)', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [{ nickname: 'Kid A', age_band: 'prereader' }]);
  await parent.db.from('kids').insert({ family_id: parent.familyId, nickname: 'Kid B', age_band: 'reader', birthday_month: 10, birthday_day: 20 });
  const device = await pairDevice(parent);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await useSession(phone, parent.session);
  const p = await phone.newPage();
  await pinClock(p, SEVEN_AM);
  await p.goto('/parent/dates');
  await expect(p.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  await expect(p.getByTestId('event-row')).toContainText("Kid B's birthday");

  await p.getByRole('button', { name: 'Add an event' }).click();
  const ed = p.getByTestId('event-editor');
  await ed.getByLabel('What').fill('Beach trip');
  await ed.getByLabel('When').fill(dayFrom(SEVEN_AM, 12));
  await ed.getByRole('radio', { name: 'beach' }).click();
  await ed.getByRole('radio', { name: 'Trip' }).click();
  await ed.getByRole('button', { name: 'Save' }).click();
  await expect(p.getByTestId('event-row').filter({ hasText: 'Beach trip' })).toContainText('12 sleeps · Kids see it');

  await p.getByRole('button', { name: 'Add an event' }).click();
  await ed.getByLabel('What').fill('Parents night out');
  await ed.getByLabel('When').fill(dayFrom(SEVEN_AM, 3));
  await ed.getByRole('radio', { name: 'Parents only' }).click();
  await ed.getByRole('button', { name: 'Save' }).click();
  await expect(p.getByTestId('event-row').filter({ hasText: 'Parents night out' })).toContainText('Parents only');
  await p.screenshot({ path: `${SHOTS}/iphone-month.png`, fullPage: true });

  const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ipad, device.session, { 'deck.currentKid': ids['Kid A']! });
  const k = await ipad.newPage();
  await pinClock(k, SEVEN_AM);
  await k.goto(`/kid/${ids['Kid A']}`);
  await k.getByTestId('card-countdown').click();
  const hero = k.getByTestId('countdown-hero');
  await expect(hero).toContainText('12 sleeps');
  await expect(hero).toContainText('until Beach trip');
  await expect(hero.locator('.dt-moon')).toHaveCount(12);
  await expect(k.getByText("Kid B's birthday")).toBeVisible();
  await expect(k.getByText('Parents night out')).toHaveCount(0); // parents-only never reaches the iPad
  expect(await k.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await k.screenshot({ path: `${SHOTS}/ipad-countdown.png` });
  await phone.close();
  await ipad.close();
});

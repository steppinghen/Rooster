import { expect, test } from '@playwright/test';
import { addEvent, addKids, addRoutine, makeParent, MORNING_STEPS, pairDevice, pinClock, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-11';
const SEVEN_AM = '2026-10-01T11:00:00Z';

test.beforeEach(({}, info) => test.skip(info.project.name === 'ipad', 'parent dashboard: iPhone and iPad landscape'));

test('Today at a glance (slice 11)', async ({ page }, info) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [
    { nickname: 'Kid A', age_band: 'reader' },
    { nickname: 'Kid B', age_band: 'prereader' },
  ]);
  const routine = await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: MORNING_STEPS });
  await addRoutine(parent, { name: 'Last Run', slot: 'bedtime', starts_at: '19:30', steps: [{ id: 'pjs', text: 'Pajamas on', icon: 'shirt' }] });
  await addEvent(parent, { title: 'School picture day', icon: 'school', on_date: '2026-10-01' });
  await addEvent(parent, { title: 'Beach trip', icon: 'beach', on_date: '2026-10-13' });
  const device = await pairDevice(parent);
  await device.db.rpc('save_routine_progress', { p_routine_id: routine, p_kid_id: ids['Kid A'], p_on_date: '2026-10-01', p_steps: ['teeth', 'dress'] });
  await device.db.from('feelings_checkins').insert({ family_id: parent.familyId, kid_id: ids['Kid B'], feeling: 'choppy', size: 3, moment: 'morning' });

  await useSession(page.context(), parent.session);
  await pinClock(page, SEVEN_AM);
  await page.goto('/parent');
  await expect(page.getByRole('heading', { name: 'Thursday' })).toBeVisible();
  await expect(page.getByTestId('board-item').filter({ hasText: 'Dawn Patrol' })).toContainText('NOW');
  await expect(page.getByTestId('board-item').filter({ hasText: 'School picture day' })).toBeVisible();
  const a = page.getByTestId('kid-card').filter({ hasText: 'Kid A' });
  await expect(a).toContainText('2 of 3 · Next: Breakfast');
  const b = page.getByTestId('kid-card').filter({ hasText: 'Kid B' });
  await expect(b.getByTestId('kid-wave')).toContainText('Choppy (upset, mad) · a lot');
  await b.getByRole('button', { name: 'History' }).click();
  await expect(b.getByTestId('wave-history')).toContainText('Kept 30 days');
  await expect(page.getByTestId('switcher-all').getByRole('button', { name: 'Change everyone…' })).toBeVisible();
  if (info.project.name === 'ipad-landscape') {
    await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('The Deck');
    const board = (await page.locator('.today__board').boundingBox())!;
    const cards = (await page.locator('.today__cards').boundingBox())!;
    expect(cards.x).toBeGreaterThan(board.x + board.width - 1); // two columns, like iPadHub
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-today.png`, fullPage: true });
});

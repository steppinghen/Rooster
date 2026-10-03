import { expect, test, type Locator } from '@playwright/test';
import { useSession } from './helpers/fixtures';
import { focusRow, liveKidPage, SHOTS } from './helpers/focusqa';
import { family, type Fam } from './helpers/kidqa';
import { installQa } from './helpers/qa';

/*
 * Live push, end to end: the parent's phone (390x844) drives two iPads (one per kid) with no
 * reload on the iPads. Every hop is timed. Real server time.
 */

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'phone + iPads flow runs once, on the iPad profile'));

let f: Fam;
test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'ipad') return;
  f = await family([
    { nickname: 'Kid A', age_band: 'reader', accent: 'magenta' },
    { nickname: 'Kid B', age_band: 'prereader', accent: 'cyan' },
  ], { events: false, live: true });
});

async function within(l: Locator, label: string, budget = 5000) {
  const t0 = Date.now();
  await expect(l, label).toBeVisible({ timeout: 20_000 });
  const ms = Date.now() - t0;
  expect.soft(ms, `${label}: took ${ms} ms`).toBeLessThan(budget);
  return ms;
}

test('phone -> two iPads: per-kid switch, Everyone heads-up, Cancel, Switch now, all live, no reloads (slice 10/11)', async ({ browser }) => {
  test.setTimeout(150_000);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await installQa(phone);
  await useSession(phone, f.parent.session);
  const p = await phone.newPage();
  await p.goto('/parent');
  const card = (k: string) => p.getByTestId('kid-card').filter({ hasText: k });
  await expect(card('Kid A').getByTestId('kid-mode')).toHaveText('Everything');

  const A = await liveKidPage(browser, f, 'Kid A', { ground: 'night' });
  const B = await liveKidPage(browser, f, 'Kid B', { ground: 'night' });
  const loads: Record<string, number> = { A: 0, B: 0 };
  A.page.on('load', () => loads.A!++);
  B.page.on('load', () => loads.B!++);
  const times: Record<string, number> = {};

  // 1. Kid A only: Session now, 20 minutes.
  await card('Kid A').getByRole('button', { name: 'Change mode…' }).click();
  await card('Kid A').getByRole('checkbox', { name: /Switch now/ }).check();
  await card('Kid A').getByRole('button', { name: 'Switch', exact: true }).click();
  // The Session-starts still in Right now is the switch showing (Phase 1.5 V14).
  times.sessionNowA = await within(A.page.getByTestId('session-home').or(A.page.locator('[data-testid="point-still"][data-kind="session"]')), 'Kid A iPad shows Session');
  await expect(A.page.getByTestId('time-left')).toContainText(/Session · (20:00|19:\d\d) left/);
  await expect(B.page.getByTestId('dock-my_week')).toBeVisible(); // Kid B untouched
  await expect(card('Kid A').getByTestId('kid-mode')).toContainText(/Session · (20:00|19:\d\d) left/);

  // 2. Everyone -> Lights out with the heads-up: both iPads warn.
  const all = p.getByTestId('switcher-all');
  await all.getByRole('button', { name: 'Change everyone…' }).click();
  await all.getByRole('radio', { name: 'Lights out' }).click();
  await all.getByRole('radio', { name: 'No limit' }).click();
  await all.getByRole('button', { name: 'Switch in 2 minutes' }).click();
  times.headsUpA = await within(A.page.getByTestId('heads-up'), 'Kid A iPad shows the heads-up');
  times.headsUpB = await within(B.page.getByTestId('heads-up'), 'Kid B iPad shows the heads-up');
  await expect(A.page.getByTestId('heads-up')).toContainText("Two more minutes, then it's lights out time.");
  await expect(B.page.getByTestId('heads-up')).toContainText("Two more minutes, then it's lights out time.");
  // During Kid A's heads-up the Session time-left chip is replaced by the heads-up; Session stays.
  await expect(A.page.getByTestId('session-home')).toBeVisible();
  await A.page.screenshot({ path: `${SHOTS}/live-ipadA-headsup-over-session.png` });
  await B.page.screenshot({ path: `${SHOTS}/live-ipadB-headsup.png` });
  await p.screenshot({ path: `${SHOTS}/live-phone-everyone-pending.png` });

  // 3. Cancel from the phone: both banners go.
  await all.getByRole('button', { name: 'Cancel' }).click();
  const t0 = Date.now();
  await expect(A.page.getByTestId('heads-up')).toHaveCount(0, { timeout: 20_000 });
  await expect(B.page.getByTestId('heads-up')).toHaveCount(0, { timeout: 20_000 });
  times.cancel = Date.now() - t0;
  expect.soft(times.cancel, 'cancel reaches both iPads').toBeLessThan(5000);
  // Kid A was in a timed Session: does cancelling the Everyone switch keep it?
  await expect(A.page.getByTestId('session-home')).toBeVisible();
  expect.soft(focusRow(f, 'Kid A').ends, 'cancelling a pending switch keeps Kid A\'s Session end time').not.toBe('');

  // 4. Everyone -> Lights out, then Switch now.
  await all.getByRole('button', { name: 'Change everyone…' }).click();
  await all.getByRole('radio', { name: 'Lights out' }).click();
  await all.getByRole('radio', { name: 'No limit' }).click();
  await all.getByRole('button', { name: 'Switch in 2 minutes' }).click();
  await expect(B.page.getByTestId('heads-up')).toBeVisible({ timeout: 20_000 });
  await all.getByRole('button', { name: 'Switch now' }).click();
  times.lightsA = await within(A.page.getByTestId('lights-out'), 'Kid A iPad shows Lights out');
  times.lightsB = await within(B.page.getByTestId('lights-out'), 'Kid B iPad shows Lights out');
  await expect(A.page.locator('html')).toHaveAttribute('data-ground', 'night');
  await B.page.screenshot({ path: `${SHOTS}/live-ipadB-lightsout.png` });

  // 5. Close the app and reopen it (new page in the same context): still Lights out.
  await B.page.close();
  const reopened = await B.ctx.newPage();
  await reopened.goto(`/kid/${f.ids['Kid B']}`);
  await expect(reopened.getByTestId('lights-out')).toBeVisible();

  // 6. Back to Everything for everyone, now.
  await all.getByRole('button', { name: 'Change everyone…' }).click();
  await all.getByRole('radio', { name: 'Everything' }).click();
  await all.getByRole('checkbox', { name: /Switch now/ }).check();
  await all.getByRole('button', { name: 'Switch', exact: true }).click();
  times.backA = await within(A.page.getByTestId('dock-my_week'), 'Kid A iPad back to Everything');
  times.backB = await within(reopened.getByTestId('dock-my_week'), 'Kid B iPad back to Everything');

  expect(loads.A, 'Kid A iPad never reloaded').toBe(0);
  console.log('live push timings (ms):', JSON.stringify(times));
  await phone.close();
  await A.ctx.close();
  await B.ctx.close();
});

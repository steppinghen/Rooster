import { expect, test } from '@playwright/test';
import { addKids, addRoutine, makeParent, MORNING_STEPS, pairDevice, useSession } from './helpers/fixtures';

// A failed whoami at launch is a network problem, never "Not set up". Found when the first
// test of a run reloaded a paired iPad while the app server was still cold: the iPad landed on
// the No access screen. A paired iPad opens from its snapshot; anything else keeps loading and
// retries until the server answers.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'iPad profile'));

test('a paired iPad that cannot reach whoami on reload opens from its snapshot, not "Not set up"', async ({ browser }) => {
  const parent = await makeParent();
  const ids = await addKids(parent, [{ nickname: 'Kid A', age_band: 'reader' }]);
  await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '00:01', steps: MORNING_STEPS });
  const device = await pairDevice(parent);
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  await useSession(ctx, device.session, { 'deck.currentKid': ids['Kid A']! });
  const k = await ctx.newPage();
  await k.goto(`/kid/${ids['Kid A']}`);
  await expect(k.getByTestId('up-next')).toBeVisible(); // online once: the snapshot is saved

  let blocked = true;
  let calls = 0;
  await k.route('**/rest/v1/rpc/whoami', (route) => {
    calls++;
    return blocked ? route.abort('failed') : route.continue();
  });
  await k.reload();
  await expect(k.getByTestId('up-next')).toBeVisible();
  await expect(k.getByText('Not set up')).toHaveCount(0);
  expect(k.url()).toContain(`/kid/${ids['Kid A']}`);

  // It keeps asking, and takes the server's answer once it's reachable again.
  blocked = false;
  await expect.poll(() => calls, { timeout: 10_000 }).toBeGreaterThan(1);
  await expect(k.getByTestId('up-next')).toBeVisible();
  await ctx.close();
});

test('a parent whose whoami fails at launch waits and retries instead of seeing "Not set up"', async ({ browser }) => {
  const parent = await makeParent();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await useSession(ctx, parent.session);
  const p = await ctx.newPage();
  let blocked = true;
  await p.route('**/rest/v1/rpc/whoami', (route) => (blocked ? route.abort('failed') : route.continue()));
  await p.goto('/parent');
  await p.waitForTimeout(1500);
  await expect(p.getByText('Not set up')).toHaveCount(0);
  blocked = false;
  await expect(p).toHaveURL(/\/parent$/, { timeout: 10_000 });
  await expect(p.getByText('Not set up')).toHaveCount(0);
  await ctx.close();
});

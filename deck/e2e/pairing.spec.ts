import { expect, test } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { addKids, makeParent, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-3';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'two-device flow runs once, on the iPad profile'));

test('pair an iPad from the phone, then unpair it (slice 3)', async ({ browser }) => {
  const parent = await makeParent();
  await addKids(parent, [{ nickname: 'Kid A', age_band: 'reader' }, { nickname: 'Kid B', age_band: 'prereader' }]);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await useSession(phone, parent.session);
  const p = await phone.newPage();
  await p.goto('/parent/office');
  await p.getByLabel('Pair an iPad').fill('Kitchen iPad');
  await p.getByRole('button', { name: 'Get a code' }).click();
  const codeText = (await p.getByTestId('pairing-code').locator('.p-code').textContent())!.replace(/\s/g, '');
  expect(codeText).toMatch(/^\d{8}$/);
  await p.screenshot({ path: `${SHOTS}/iphone-pairing-code.png` });

  const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  const k = await ipad.newPage();
  await k.goto('/');
  await k.getByRole('button', { name: 'Set up this iPad for the kids' }).click();
  // A wrong code first: gentle message, no pairing.
  await k.getByLabel('Pairing code').fill('00000000');
  await k.getByRole('button', { name: 'Pair this iPad' }).click();
  await expect(k.getByRole('alert')).toContainText("didn't work");
  await k.getByLabel('Pairing code').fill(codeText);
  await k.screenshot({ path: `${SHOTS}/ipad-pair.png` });
  await k.getByRole('button', { name: 'Pair this iPad' }).click();
  await expect(k.getByRole('heading', { name: "Who's riding?" })).toBeVisible();
  await expect(k.getByTestId('pick-kid')).toHaveCount(2);

  // The phone sees it paired.
  await expect(p.getByText('Kitchen iPad is paired.')).toBeVisible({ timeout: 5000 });
  await expect(p.getByTestId('device-row')).toHaveCount(1);
  expect(sql(`select count(*) from public.devices where family_id = ${lit(parent.familyId)} and revoked_at is null`)).toEqual(['1']);

  // Survives a reload (and, on a real iPad, a reboot): no re-pairing.
  await k.reload();
  await expect(k.getByRole('heading', { name: "Who's riding?" })).toBeVisible();

  // Unpair from the phone.
  await p.getByRole('button', { name: 'Unpair…' }).click();
  await p.getByRole('button', { name: 'Unpair', exact: true }).click();
  await expect(p.getByTestId('device-row')).toHaveCount(0);

  // The iPad loses access on its next request: reopening it shows the unpaired screen.
  await k.reload();
  await expect(k.getByRole('heading', { name: 'Unpaired' })).toBeVisible();
  await k.screenshot({ path: `${SHOTS}/ipad-unpaired.png` });
  await k.getByRole('button', { name: 'Pair again' }).click();
  await expect(k.getByLabel('Pairing code')).toBeVisible();
  // Nothing about the family stays cached on the iPad.
  expect(await k.evaluate(() => localStorage.getItem('deck.snapshot.v2'))).toBeNull();

  await phone.close();
  await ipad.close();
});

import { expect, test, type Page } from '@playwright/test';
import { allowBootstrap, lit, sql, testEmail } from './helpers/db';
import { latestCode } from './helpers/mail';
import { totp } from './helpers/totp';

// Device-test bug (P1): switching to Passwords and back reloaded the MFA screen and minted a
// new secret each time. The pending enrollment must survive leaving and returning.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'iphone', 'parent flow on the iPhone profile'));

async function toMfa(page: Page, email: string) {
  allowBootstrap(email);
  await page.goto('/');
  await page.getByRole('button', { name: "I'm a grown-up" }).click();
  await page.getByLabel('Email').fill(email);
  const since = Date.now();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const { code } = await latestCode(email, since);
  await page.getByLabel('Code').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Lock it down' })).toBeVisible();
}

const secretOf = async (page: Page) => (await page.getByTestId('totp-secret').textContent())!.trim();
const unverified = (email: string) =>
  sql(`select f.id from auth.mfa_factors f join auth.users u on u.id = f.user_id where u.email = ${lit(email)} and f.status = 'unverified' order by f.created_at`);

test('leaving and returning mid-enrollment keeps the same TOTP secret, and it verifies', async ({ page }) => {
  const email = testEmail('parent-mfa');
  await toMfa(page, email);
  const original = await secretOf(page);
  const [factor] = unverified(email);

  // App goes to the background and comes back (switching to Passwords): no re-enroll.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(1000);
  expect(await secretOf(page)).toBe(original);

  // iOS reloads the Home Screen app on return: still the same secret.
  await page.reload();
  await expect(page.getByTestId('totp-secret')).toHaveText(original);

  // Leave the app entirely and come back.
  await page.goto('about:blank');
  await page.goto('/');
  await expect(page.getByTestId('totp-secret')).toHaveText(original);

  // Still exactly one pending factor, the original one.
  expect(unverified(email)).toEqual([factor]);

  // The code from Passwords (made from the original secret) works.
  await page.getByLabel('6-digit code').fill(totp(original));
  await page.getByRole('button', { name: 'Turn it on' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible();
  expect(unverified(email)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('deck.mfaPending'))).toBeNull(); // secret not kept after use
});

test('a half-finished enrollment whose secret this device no longer has is cleaned up, then enrolled once', async ({ page }) => {
  const email = testEmail('parent-mfa-stale');
  await toMfa(page, email);
  const first = await secretOf(page);
  const [staleId] = unverified(email);
  // Lose the locally kept secret (e.g. a different browser, or more than 30 minutes later).
  await page.evaluate(() => localStorage.removeItem('deck.mfaPending'));
  await page.reload();
  await expect(page.getByTestId('totp-secret')).not.toHaveText(first);
  const fresh = unverified(email);
  expect(fresh).toHaveLength(1);
  expect(fresh[0]).not.toBe(staleId);
  await page.getByLabel('6-digit code').fill(totp(await secretOf(page)));
  await page.getByRole('button', { name: 'Turn it on' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { allowBootstrap, lit, sql, testEmail } from './helpers/db';
import { latestCode } from './helpers/mail';
import { totp } from './helpers/totp';

// Parent screens are tested on the phone.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'iphone', 'parent flows run on the iPhone profile'));

const SHOTS = 'review/screenshots/slice-2';
const parentA = testEmail('parent-a');
const parentB = testEmail('parent-b');

async function signInWithCode(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: "I'm a grown-up" }).click();
  await page.getByLabel('Email').fill(email);
  const since = Date.now();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('Code')).toBeVisible();
  const mail = await latestCode(email, since);
  // Code only, no link anywhere in the email (links would open Safari, not the installed app).
  expect(mail.html).not.toMatch(/href=/i);
  expect(mail.text).not.toMatch(/https?:\/\//i);
  await page.getByLabel('Code').fill(mail.code);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function enrollTotp(page: Page) {
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn it on' }).click();
  return secret;
}

test.describe.serial('parent sign-in, family setup, second parent (slice 2)', () => {
  test('Parent A: email code, TOTP, create family, add kids, invite Parent B', async ({ page }) => {
    allowBootstrap(parentA);
    await signInWithCode(page, parentA);

    await expect(page.getByRole('heading', { name: 'Lock it down' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/iphone-mfa-enroll.png` });
    await enrollTotp(page);

    await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible();
    await page.getByLabel('Family name').fill('Family A');
    await page.getByLabel('Your name in the app').fill('Parent A');
    await page.getByRole('button', { name: 'Create our Deck' }).click();

    await expect(page.getByText('Hi, Parent A.')).toBeVisible();
    await page.getByRole('button', { name: 'Back Office' }).click();

    await page.getByRole('button', { name: 'Add a kid' }).click();
    const editor = page.getByTestId('kid-editor');
    await editor.getByLabel('Nickname').fill('Kid A');
    await editor.getByRole('radio', { name: 'Words + audio (reader)' }).click();
    await editor.getByLabel('Birthday month').selectOption('3');
    await editor.getByLabel('Birthday day').selectOption('14');
    await editor.getByLabel('PIN (optional)').fill('1234');
    await page.screenshot({ path: `${SHOTS}/iphone-add-kid.png`, fullPage: true });
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('kid-row')).toHaveCount(1);

    await page.getByRole('button', { name: 'Add a kid' }).click();
    await editor.getByLabel('Nickname').fill('Kid B');
    await editor.getByRole('radio', { name: 'Pictures + audio (pre-reader)' }).click();
    await editor.getByRole('radio', { name: 'Calm (always quiet)' }).click();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('kid-row')).toHaveCount(2);
    await expect(page.getByTestId('kid-row').first()).toContainText('PIN');

    await page.getByLabel('Add a parent by email').fill(parentB);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByTestId('invite-row')).toContainText(parentB);
    await page.screenshot({ path: `${SHOTS}/iphone-back-office.png`, fullPage: true });

    const [row] = sql(`select k.age_band, k.has_pin, k.birthday_month, k.birthday_day, (select count(*) from public.kid_focus f where f.kid_id = k.id)
      from public.kids k join public.parents p on p.family_id = k.family_id join auth.users u on u.id = p.user_id
      where u.email = ${lit(parentA)} and k.nickname = 'Kid A'`);
    expect(row).toBe('reader\tt\t3\t14\t1');
    // The bootstrap entry was consumed: it can't create a second family.
    expect(sql(`select count(*) from public.parent_allowlist where email = ${lit(parentA)} and family_id is null`)).toEqual(['0']);
  });

  test('Parent B: joins with an email code and TOTP, sees the same family', async ({ page }) => {
    await signInWithCode(page, parentB);
    await enrollTotp(page);
    await expect(page.getByRole('heading', { name: "You're in" })).toBeVisible();
    await expect(page.getByText('Family A')).toBeVisible();
    await page.getByLabel('Your name in the app').fill('Parent B');
    await page.getByRole('button', { name: 'Join the family' }).click();
    await expect(page.getByText('Hi, Parent B.')).toBeVisible();
    await page.getByRole('button', { name: 'Back Office' }).click();
    await expect(page.getByTestId('kid-row')).toHaveCount(2);
    await expect(page.getByText('Parent A', { exact: true })).toBeVisible();
    await expect(page.getByText('Parent B (you)')).toBeVisible();
  });

  test('Parent A: signing in again asks for the TOTP code, not a new enrollment', async ({ page }) => {
    await signInWithCode(page, parentA);
    await expect(page.getByRole('heading', { name: 'One more code' })).toBeVisible();
    const secret = sql(`select f.secret from auth.mfa_factors f join auth.users u on u.id = f.user_id where u.email = ${lit(parentA)} and f.status = 'verified'`)[0]!;
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Hi, Parent A.')).toBeVisible();
  });

  test('an email on no allowlist is refused and no account is created', async ({ page }) => {
    const stranger = testEmail('stranger');
    await page.goto('/');
    await page.getByRole('button', { name: "I'm a grown-up" }).click();
    await page.getByLabel('Email').fill(stranger);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByRole('alert')).toContainText("couldn't send a code");
    expect(sql(`select count(*) from auth.users where email = ${lit(stranger)}`)).toEqual(['0']);
    await page.screenshot({ path: `${SHOTS}/iphone-refused.png` });
  });
});

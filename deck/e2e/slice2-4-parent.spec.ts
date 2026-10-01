import { expect, test, type Page } from '@playwright/test';
import { allowBootstrap, lit, sql, testEmail } from './helpers/db';
import { makeParent, useSession } from './helpers/fixtures';
import { latestCode } from './helpers/mail';
import { audit, installQa, scheme, sideBySide } from './helpers/qa';
import { totp } from './helpers/totp';

/*
 * Independent UX QA for slices 2 to 4, parent side.
 * iPhone (390x844) for every parent screen, in both grounds (prefers-color-scheme light = day,
 * dark = night). iPad landscape (1180x820) for the nav rail. Seed placeholders only.
 */

const SHOTS = 'review/screenshots/slice-2-4';
const SCHEMES = [
  { scheme: 'light', ground: 'day' },
  { scheme: 'dark', ground: 'night' },
] as const;
const PARENT_MIN = 48;

const onlyOn = (name: string) => test.beforeEach(({}, info) => test.skip(info.project.name !== name, `runs on ${name}`));

test.beforeEach(async ({ page }) => {
  await installQa(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Common rules for a parent screen: 48pt targets, labels, AA, no overflow, right ground. */
async function parentRules(page: Page, ground: 'day' | 'night', where: string) {
  const a = await audit(page, PARENT_MIN);
  expect.soft(a.ground, `${where}: ground follows prefers-color-scheme`).toBe(ground);
  expect.soft(a.smallTargets, `${where}: targets under ${PARENT_MIN}pt`).toEqual([]);
  expect.soft(a.unlabeled, `${where}: inputs without a label`).toEqual([]);
  expect.soft(a.contrast, `${where}: text below WCAG AA`).toEqual([]);
  expect.soft(a.yellowOnDay, `${where}: yellow text on the day ground`).toEqual([]);
  expect.soft(a.creamOnAccent, `${where}: cream text on an accent`).toEqual([]);
  expect.soft(a.overflowX, `${where}: horizontal overflow`).toBe(false);
  return a;
}

async function shoot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage, animations: 'disabled' });
}

async function inBothGrounds(page: Page, fn: (ground: 'day' | 'night') => Promise<void>) {
  for (const s of SCHEMES) {
    await scheme(page, s.scheme);
    await fn(s.ground);
  }
}

async function requestCode(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  const since = Date.now();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('Code')).toBeVisible();
  return latestCode(email, since);
}

test.describe('slice 2-4 parent: auth screens (iPhone)', () => {
  onlyOn('iphone');

  test('Welcome and Sign in: both grounds, labels, targets, a way back', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: "I'm a grown-up" })).toBeVisible();
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `welcome ${g}`);
      await shoot(page, `iphone-welcome-${g}`);
    });

    await page.getByRole('button', { name: "I'm a grown-up" }).click();
    const email = page.getByLabel('Email');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('type', 'email');
    await expect(email).toHaveAttribute('autocomplete', 'email');
    // Disabled until it looks like an email: no silent no-op submit.
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeDisabled();
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `sign-in ${g}`);
      await shoot(page, `iphone-sign-in-email-${g}`);
    });

    // No dead ends: an installed PWA has no browser Back button, so the screen needs its own.
    const back = page.getByRole('button', { name: /back|cancel|not a grown-up|start over/i }).or(page.getByRole('link', { name: /back|cancel/i }));
    expect.soft(await back.count(), 'sign-in (email step) has no way back to Welcome').toBeGreaterThan(0);
  });

  test('an unlisted email gets a clear error tied to the field, and no account', async ({ page }) => {
    const stranger = testEmail('stranger');
    await page.goto('/parent/sign-in');
    await page.getByLabel('Email').fill(stranger);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText("couldn't send a code");
    await expect(alert).toContainText('ask the parent who set up The Deck');
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    // The email stays filled so a typo can be fixed in place.
    await expect(page.getByLabel('Email')).toHaveValue(stranger);
    expect(sql(`select count(*) from auth.users where email = ${lit(stranger)}`)).toEqual(['0']);
    await inBothGrounds(page, async (g) => {
      const a = await parentRules(page, g, `refused ${g}`);
      expect.soft(a.errorsNotDescribed, 'error text is not linked to the input (aria-describedby)').toEqual([]);
      await shoot(page, `iphone-sign-in-refused-${g}`);
    });
  });

  test('wrong email code, then the right one; MFA enroll with a wrong then right TOTP; Setup', async ({ page }) => {
    const email = testEmail('parent-a');
    allowBootstrap(email);
    await page.goto('/parent/sign-in');
    const mail = await requestCode(page, email);
    await expect(page.getByLabel('Code')).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(page.getByLabel('Code')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByText(email)).toBeVisible();
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `check-email ${g}`);
      await shoot(page, `iphone-sign-in-code-${g}`);
    });

    // Wrong code: clear error, can retry.
    const wrong = mail.code === '000000' ? '111111' : '000000';
    await page.getByLabel('Code').fill(wrong);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText("That code didn't work");
    await inBothGrounds(page, async (g) => {
      const a = await parentRules(page, g, `wrong-code ${g}`);
      expect.soft(a.errorsNotDescribed, 'code error not linked to the input').toEqual([]);
      await shoot(page, `iphone-sign-in-wrong-code-${g}`);
    });
    // "Use a different email" and "Send a new code" exist (the code step is not a dead end).
    await expect(page.getByRole('button', { name: 'Use a different email' })).toBeVisible();
    await expect(page.getByRole('button', { name: /New code in|Send a new code/ })).toBeVisible();

    await page.getByLabel('Code').fill(mail.code);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // MFA enroll.
    await expect(page.getByRole('heading', { name: 'Lock it down' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add to Passwords' })).toHaveAttribute('href', /^otpauth:\/\/totp\//);
    const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `mfa-enroll ${g}`);
      await shoot(page, `iphone-mfa-enroll-${g}`, true);
    });

    const right = totp(secret);
    await page.getByLabel('6-digit code').fill(right === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Turn it on' }).click();
    await expect(page.getByRole('alert')).toContainText("That code didn't match");
    await expect(page.getByLabel('6-digit code')).toHaveValue('');
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `mfa-wrong ${g}`);
      await shoot(page, `iphone-mfa-enroll-wrong-${g}`, true);
    });
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Turn it on' }).click();

    // Setup.
    await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create our Deck' })).toBeDisabled();
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `setup ${g}`);
      await shoot(page, `iphone-setup-${g}`);
    });
    await page.getByLabel('Family name').fill('Family A');
    await page.getByLabel('Your name in the app').fill('Parent A');
    await page.getByRole('button', { name: 'Create our Deck' }).click();
    await expect(page.getByText('Hi, Parent A.')).toBeVisible();

    // Today (stub until slice 11) in both grounds, then against Main / MainDay.
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `today ${g}`);
      await shoot(page, `iphone-today-${g}`);
      await sideBySide(page, await page.screenshot({ animations: 'disabled' }), g === 'day' ? 'MainDay' : 'Main', `${SHOTS}/compare/iphone-today-${g}-vs-${g === 'day' ? 'MainDay' : 'Main'}.png`, `Today (${g})`, 844);
    });
  });

  test('returning parent: wrong TOTP, then the right one', async ({ page }) => {
    test.setTimeout(120_000);
    const p = await makeParent();
    // GoTrue allows one email code per address per 60 s; the fixture just used it.
    await page.waitForTimeout(61_000);
    await page.goto('/parent/sign-in');
    const mail = await requestCode(page, p.email);
    await page.getByLabel('Code').fill(mail.code);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'One more code' })).toBeVisible();
    await expect(page.getByLabel('6-digit code')).toBeFocused();
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `mfa-verify ${g}`);
      await shoot(page, `iphone-mfa-verify-${g}`);
    });
    const right = totp(p.totpSecret);
    await page.getByLabel('6-digit code').fill(right === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText("That code didn't match");
    await shoot(page, `iphone-mfa-verify-wrong-night`);
    await page.getByLabel('6-digit code').fill(totp(p.totpSecret));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Hi, Parent A.')).toBeVisible();
  });

  test('Join (second parent) and No access (invite removed before joining)', async ({ page, browser }) => {
    const a = await makeParent();
    const b = testEmail('parent-b');
    await a.db.from('parent_allowlist').insert({ email: b, family_id: a.familyId }).throwOnError();

    await page.goto('/parent/sign-in');
    let mail = await requestCode(page, b);
    await page.getByLabel('Code').fill(mail.code);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Turn it on' }).click();
    await expect(page.getByRole('heading', { name: "You're in" })).toBeVisible();
    await expect(page.getByText('Family A')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join the family' })).toBeDisabled();
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `join ${g}`);
      await shoot(page, `iphone-join-${g}`);
    });
    await page.getByLabel('Your name in the app').fill('Parent B');
    await page.getByRole('button', { name: 'Join the family' }).click();
    await expect(page.getByText('Hi, Parent B.')).toBeVisible();

    // No access: an email that was allowlisted (so it got an account) and then removed.
    const c = testEmail('parent-b-removed');
    await a.db.from('parent_allowlist').insert({ email: c, family_id: a.familyId }).throwOnError();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await installQa(ctx);
    const p2 = await ctx.newPage();
    await p2.emulateMedia({ reducedMotion: 'reduce' });
    await p2.goto('/parent/sign-in');
    mail = await requestCode(p2, c);
    await p2.getByLabel('Code').fill(mail.code);
    await p2.getByRole('button', { name: 'Sign in' }).click();
    await expect(p2.getByRole('heading', { name: 'Lock it down' })).toBeVisible();
    sql(`delete from public.parent_allowlist where email = ${lit(c)}`);
    const s2 = (await p2.getByTestId('totp-secret').textContent())!.trim();
    await p2.getByLabel('6-digit code').fill(totp(s2));
    await p2.getByRole('button', { name: 'Turn it on' }).click();
    await expect(p2.getByRole('heading', { name: 'Not set up' })).toBeVisible();
    await inBothGrounds(p2, async (g) => {
      await parentRules(p2, g, `no-access ${g}`);
      await shoot(p2, `iphone-no-access-${g}`);
    });
    await p2.getByRole('button', { name: 'Sign out' }).click();
    await expect(p2.getByRole('button', { name: "I'm a grown-up" })).toBeVisible();
    await ctx.close();
  });
});

test.describe('slice 2-4 parent: Back Office (iPhone)', () => {
  onlyOn('iphone');

  test('all sections in both grounds; tab bar never covers content', async ({ page, context }) => {
    const p = await makeParent();
    await useSession(context, p.session);
    await page.goto('/parent/office');
    await expect(page.getByRole('heading', { name: 'Back Office' })).toBeVisible();
    for (const h of ['Team Riders', 'Devices', 'Grown-ups', 'Family', 'You']) await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('button', { name: 'Back Office' })).toHaveAttribute('aria-current', 'page');

    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `back-office ${g}`);
      await shoot(page, `iphone-back-office-${g}`, true);
      await shoot(page, `iphone-back-office-top-${g}`);
      // Scrolled to the bottom, the last control (Sign out) clears the fixed tab bar.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const signOut = (await page.getByRole('button', { name: 'Sign out' }).boundingBox())!;
      const bar = (await page.locator('.parent__tabs').boundingBox())!;
      expect.soft(signOut.y + signOut.height, `back-office ${g}: Sign out hidden under the tab bar`).toBeLessThanOrEqual(bar.y);
      await shoot(page, `iphone-back-office-bottom-${g}`);
      await page.evaluate(() => window.scrollTo(0, 0));
    });
    await sideBySide(page, await page.screenshot({ animations: 'disabled' }), 'Main', `${SHOTS}/compare/iphone-back-office-night-vs-Main.png`, 'Back Office (night)', 844);
  });

  test('Team Riders: add and edit a kid, with validation errors', async ({ page, context }) => {
    const p = await makeParent();
    await useSession(context, p.session);
    await page.goto('/parent/office');
    await page.getByRole('button', { name: 'Add a kid' }).click();
    const editor = page.getByTestId('kid-editor');
    await expect(editor.getByRole('heading', { name: 'Add a kid' })).toBeVisible();
    // Every control is labelled (by label, or the group's name).
    for (const l of ['Nickname', 'Birthday month', 'Birthday day', 'PIN (optional)']) await expect(editor.getByLabel(l)).toBeVisible();
    for (const g of ['Avatar', 'Color', 'Screens', 'Everyday look']) await expect(editor.getByRole('radiogroup', { name: g })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled();

    await editor.getByLabel('Nickname').fill('Kid A');
    await editor.getByRole('radio', { name: 'Words + audio (reader)' }).click();
    // Validation: a 3-digit PIN, and a month with no day.
    await editor.getByLabel('PIN (optional)').fill('123');
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(editor.getByRole('alert')).toHaveText('A PIN is 4 digits.');
    await editor.getByLabel('PIN (optional)').fill('1234');
    await editor.getByLabel('Birthday month').selectOption('3');
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(editor.getByRole('alert')).toContainText('Pick both a month and a day');
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `add-kid ${g}`);
      await editor.screenshot({ path: `${SHOTS}/iphone-add-kid-error-${g}.png`, animations: 'disabled' });
    });
    // February caps at 29 days.
    await editor.getByLabel('Birthday month').selectOption('2');
    expect(await editor.getByLabel('Birthday day').locator('option').count()).toBe(30); // "Not set" + 29
    await editor.getByLabel('Birthday day').selectOption('14');
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('kid-row')).toHaveCount(1);
    await expect(page.getByTestId('kid-row')).toContainText('Reader · Full comic · PIN');

    await page.getByRole('button', { name: 'Add a kid' }).click();
    await editor.getByLabel('Nickname').fill('Kid B');
    await editor.getByRole('radio', { name: 'Pictures + audio (pre-reader)' }).click();
    await editor.getByRole('radio', { name: 'Calm (always quiet)' }).click();
    await editor.getByRole('radio', { name: 'cyan' }).click();
    await editor.getByRole('radio', { name: 'rooster' }).click();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('kid-row')).toHaveCount(2);

    // Edit Kid A: the PIN field explains "keep", and Remove the PIN is a big enough target.
    await page.getByTestId('kid-row').first().getByRole('button', { name: 'Edit' }).click();
    await expect(editor.getByRole('heading', { name: 'Edit Kid A' })).toBeVisible();
    await expect(editor.getByLabel('New PIN (leave empty to keep the current one)')).toBeVisible();
    await expect(editor.getByLabel('Birthday month')).toHaveValue('2');
    await expect(editor.getByLabel('Birthday day')).toHaveValue('14');
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `edit-kid ${g}`);
      await editor.screenshot({ path: `${SHOTS}/iphone-edit-kid-${g}.png`, animations: 'disabled' });
    });
    await editor.getByLabel('Remove the PIN').check();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('kid-row').first()).not.toContainText('PIN');
    expect(sql(`select has_pin from public.kids where family_id = ${lit(p.familyId)} and nickname = 'Kid A'`)).toEqual(['f']);
    // Cancel closes the form with no change.
    await page.getByTestId('kid-row').nth(1).getByRole('button', { name: 'Edit' }).click();
    await editor.getByLabel('Nickname').fill('Kid B changed');
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('kid-row').nth(1)).toContainText('Kid B');
    await expect(page.getByTestId('kid-row').nth(1)).not.toContainText('changed');
  });

  test('Devices, Grown-ups, Family and You', async ({ page, context }) => {
    const p = await makeParent();
    await useSession(context, p.session);
    await page.goto('/parent/office');

    // Devices: the code is big, 8 digits, with a countdown.
    await expect(page.getByText('No iPads paired yet.')).toBeVisible();
    await page.getByLabel('Pair an iPad').fill('Kitchen iPad');
    await page.getByRole('button', { name: 'Get a code' }).click();
    const box = page.getByTestId('pairing-code');
    await expect(box.locator('.p-code')).toHaveText(/^\d{4} \d{4}$/);
    await expect(box).toContainText(/Works once, for (9:5\d|10:00) more/);
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `pairing-code ${g}`);
      await box.scrollIntoViewIfNeeded();
      await shoot(page, `iphone-devices-code-${g}`);
    });
    const fontPx = await box.locator('.p-code').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(40);
    await box.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Get a code' })).toBeVisible();

    // Grown-ups: add, duplicate error, remove.
    const b = testEmail('parent-b');
    const invite = page.getByLabel('Add a parent by email');
    await invite.fill(b);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByTestId('invite-row')).toContainText(b);
    await invite.fill(b.toUpperCase());
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('already on your list');
    await inBothGrounds(page, async (g) => {
      await parentRules(page, g, `grown-ups ${g}`);
      await page.getByRole('heading', { name: 'Grown-ups' }).scrollIntoViewIfNeeded();
      await shoot(page, `iphone-grown-ups-${g}`);
    });
    await page.getByTestId('invite-row').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('invite-row')).toHaveCount(0);

    // Family: Save is disabled until something changes.
    const save = page.locator('form', { has: page.getByLabel('Family name') }).getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await page.getByLabel('Family name').fill('Family A2');
    await save.click();
    await expect(page.getByText('Saved.')).toBeVisible();

    // You: signs out to Welcome.
    await expect(page.getByText(`Signed in as ${p.email}.`)).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: "I'm a grown-up" })).toBeVisible();
  });

  test('an expired pairing code on the phone says so', async ({ page, context }) => {
    const p = await makeParent();
    await useSession(context, p.session);
    await page.clock.install();
    await page.goto('/parent/office');
    await page.getByLabel('Pair an iPad').fill('Kitchen iPad');
    await page.getByRole('button', { name: 'Get a code' }).click();
    await expect(page.getByTestId('pairing-code')).toBeVisible();
    await page.clock.fastForward('10:05');
    await page.clock.runFor(2000);
    await expect(page.getByTestId('pairing-code')).toHaveCount(0);
    await page.getByRole('heading', { name: 'Devices' }).scrollIntoViewIfNeeded();
    await shoot(page, 'iphone-devices-code-expired-night');
    expect.soft(await page.getByText(/expired|ran out|get a new code/i).count(), 'expired code vanishes with no message').toBeGreaterThan(0);
  });
});

test.describe('slice 2-4 parent: iPad landscape nav rail', () => {
  onlyOn('ipad-landscape');

  test('the parent shell uses the rail at 1180 wide, in both grounds', async ({ page, context }) => {
    const p = await makeParent();
    await useSession(context, p.session);
    for (const path of ['/parent', '/parent/office']) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
      await expect(page.locator('.dk-nav--rail')).toBeVisible();
      await expect(page.locator('.parent__tabs')).toHaveCount(0);
      const name = path === '/parent' ? 'today' : 'back-office';
      await inBothGrounds(page, async (g) => {
        await parentRules(page, g, `landscape ${name} ${g}`);
        await shoot(page, `ipad-landscape-${name}-${g}`);
        if (name === 'today') {
          const ref = g === 'day' ? 'iPadHubDay' : 'iPadHub';
          await sideBySide(page, await page.screenshot({ animations: 'disabled' }), ref, `${SHOTS}/compare/ipad-landscape-today-${g}-vs-${ref}.png`, `Today (${g})`, 820);
        }
      });
    }
    // Rail items are at least 48pt and the current one is marked.
    const rail = page.locator('.dk-nav--rail');
    await expect(rail.getByRole('button', { name: 'Back Office' })).toHaveAttribute('aria-current', 'page');
    await rail.getByRole('button', { name: 'Today' }).click();
    await expect(page).toHaveURL(/\/parent$/);
  });
});

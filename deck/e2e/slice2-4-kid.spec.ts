import { expect, test, type Browser, type Page } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { addKids, makeParent, pairDevice, useSession, type ParentFixture } from './helpers/fixtures';
import { accentArea, audit, installQa, scheme, sideBySide, spoken, volumeAudit, zoneWhere } from './helpers/qa';

/*
 * Independent UX QA for slices 2 to 4, iPad side (820x1180 portrait).
 * Pair / Unpaired are setup screens a grown-up uses on the iPad (they follow prefers-color-scheme).
 * "Who's riding?" and the PIN pad are kid screens: pre-reader rules apply (80pt, no scroll,
 * one task, Home/back in one tap, gentle retry, read-aloud, no selection or callouts).
 * The kid home (/kid/<id>) is out of scope here.
 */

const SHOTS = 'review/screenshots/slice-2-4';
const KID_MIN = 80;
const MAGENTA = 'rgb(255, 62, 138)';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'kid screens run on the iPad profile'));

async function ipadPage(browser: Browser, opts: { reduced?: boolean; scheme?: 'light' | 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await installQa(ctx);
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: opts.reduced === false ? 'no-preference' : 'reduce', colorScheme: opts.scheme ?? 'dark' });
  return { ctx, page };
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
}

/** The kid-screen rules every picker / PIN state must pass. */
async function kidRules(page: Page, where: string, ground: 'day' | 'night') {
  const a = await audit(page, KID_MIN);
  expect.soft(a.ground, `${where}: ground`).toBe(ground);
  expect.soft(a.smallTargets, `${where}: targets under ${KID_MIN}pt`).toEqual([]);
  expect.soft(a.scrollsY, `${where}: needs vertical scrolling`).toBe(false);
  expect.soft(a.overflowX, `${where}: horizontal overflow`).toBe(false);
  expect.soft(a.selectable, `${where}: selectable text on a kid screen`).toEqual([]);
  expect.soft(a.callouts, `${where}: long-press callouts on a kid screen`).toEqual([]);
  expect.soft(a.contrast, `${where}: text below WCAG AA`).toEqual([]);
  expect.soft(a.yellowOnDay, `${where}: yellow text on the day ground`).toEqual([]);
  expect.soft(a.creamOnAccent, `${where}: cream text on an accent`).toEqual([]);
  // No double-tap zoom: every control uses touch-action: manipulation.
  const zoomable = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => !['manipulation', 'none'].includes(getComputedStyle(b).touchAction)).map((b) => b.textContent),
  );
  expect.soft(zoomable, `${where}: buttons that allow double-tap zoom`).toEqual([]);
  return a;
}

let parent: ParentFixture;
let ids: Record<string, string>;
let device: Awaited<ReturnType<typeof pairDevice>>;

function setGround(setting: 'auto' | 'day' | 'night' | 'device', zone?: string) {
  sql(`update public.devices set ground = ${lit(setting)} where id = ${lit(device.deviceId)}`);
  if (zone) sql(`update public.families set timezone = ${lit(zone)} where id = ${lit(parent.familyId)}`);
}

async function openPicker(browser: Browser, opts: { reduced?: boolean; scheme?: 'light' | 'dark' } = {}) {
  const { ctx, page } = await ipadPage(browser, opts);
  await useSession(ctx, device.session);
  await page.goto('/kid');
  await expect(page.getByRole('heading', { name: "Who's riding?" })).toBeVisible();
  return { ctx, page };
}

test.describe.serial('slice 2-4 kid: picker and PIN pad (iPad)', () => {
  test.beforeAll(async ({}, info) => {
    if (info.project.name !== 'ipad') return;
    parent = await makeParent();
    ids = await addKids(parent, [
      { nickname: 'Kid A', age_band: 'reader', pin: '1234', accent: 'magenta' },
      { nickname: 'Kid B', age_band: 'prereader', accent: 'cyan', default_volume: 'focus' },
    ]);
    device = await pairDevice(parent);
  });

  test.beforeEach(() => {
    if (ids) sql(`delete from public.pin_attempts where kid_id in (${lit(ids['Kid A']!)}, ${lit(ids['Kid B']!)})`);
  });

  test('picker: Auto ground by family time, both grounds, kid rules, normal volume', async ({ browser }) => {
    for (const ground of ['day', 'night'] as const) {
      // A family with no routines: Auto is day 06:30-19:30 in the family's time zone.
      setGround('auto', zoneWhere(ground));
      const { ctx, page } = await openPicker(browser);
      await expect(page.locator('html')).toHaveAttribute('data-ground', ground);
      await expect(page.locator('html')).toHaveAttribute('data-volume', 'normal');
      await expect(page.getByTestId('pick-kid')).toHaveCount(2);
      await kidRules(page, `picker ${ground}`, ground);

      // Read-aloud is there and speaks the instruction.
      await page.getByRole('button', { name: 'Read it to me' }).click();
      expect(await spoken(page)).toContain("Who's riding? Tap your picture.");

      // Normal volume: the comic treatment is on (headline offset, tilted cards, halftone ground).
      const v = await volumeAudit(page);
      expect.soft(v.textShadows.length, `picker ${ground}: offset headline`).toBeGreaterThan(0);
      expect.soft(v.tilts.length, `picker ${ground}: tilted cards`).toBeGreaterThan(0);
      expect.soft(v.halftone.length, `picker ${ground}: halftone ground`).toBeGreaterThan(0);
      await shoot(page, `ipad-picker-${ground}`);
      await sideBySide(page, await page.screenshot({ animations: 'disabled' }), ground === 'day' ? 'iPadDawnPatrolDay' : 'iPadGromZone', `${SHOTS}/compare/ipad-picker-${ground}-vs-${ground === 'day' ? 'iPadDawnPatrolDay' : 'iPadGromZone'}.png`, `Who's riding? (${ground})`);

      // The Grown-ups explainer opens and closes in one tap each, and stays kid-safe.
      await page.getByRole('button', { name: 'Grown-ups' }).click();
      await expect(page.getByText('This iPad has no parent controls.')).toBeVisible();
      await kidRules(page, `picker grown-ups ${ground}`, ground);
      await shoot(page, `ipad-picker-grownups-${ground}`);
      await page.getByRole('button', { name: 'OK' }).click();
      await expect(page.getByRole('button', { name: 'Grown-ups' })).toBeVisible();
      await ctx.close();
    }
  });

  test('picker: Day / Night / Follow device settings override the clock', async ({ browser }) => {
    setGround('night', zoneWhere('day'));
    let { ctx, page } = await openPicker(browser);
    await expect(page.locator('html')).toHaveAttribute('data-ground', 'night');
    await ctx.close();
    setGround('day', zoneWhere('night'));
    ({ ctx, page } = await openPicker(browser));
    await expect(page.locator('html')).toHaveAttribute('data-ground', 'day');
    await ctx.close();
    setGround('device', zoneWhere('night'));
    ({ ctx, page } = await openPicker(browser, { scheme: 'light' }));
    await expect(page.locator('html')).toHaveAttribute('data-ground', 'day');
    await scheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-ground', 'night');
    await ctx.close();
    setGround('auto');
  });

  test('PIN pad: kid rules, focus volume, back in one tap, read-aloud', async ({ browser }) => {
    for (const ground of ['day', 'night'] as const) {
      setGround(ground);
      const { ctx, page } = await openPicker(browser);
      await page.getByTestId('pick-kid').filter({ hasText: 'Kid A' }).click();
      await expect(page.getByText('Type your secret code')).toBeVisible();
      expect(await spoken(page)).toContain('Kid A. Type your secret code.');
      await expect(page.locator('html')).toHaveAttribute('data-volume', 'focus');
      await kidRules(page, `pin ${ground}`, ground);

      // Focus styling: no halftone, tilts, offset headlines or marker; accent only as small dots.
      const v = await volumeAudit(page);
      expect.soft(v.textShadows, `pin ${ground}: offset headlines`).toEqual([]);
      expect.soft(v.halftone, `pin ${ground}: halftone`).toEqual([]);
      expect.soft(v.tilts, `pin ${ground}: tilts`).toEqual([]);
      expect.soft(v.marker, `pin ${ground}: marker lettering`).toEqual([]);
      for (const d of '12') await page.getByRole('button', { name: d, exact: true }).click();
      const acc = await accentArea(page, MAGENTA);
      expect.soft(acc.fraction, `pin ${ground}: accent area ${acc.fills.join(', ')}`).toBeLessThan(0.02);
      await expect(page.getByLabel('2 of 4 typed')).toBeVisible();
      await shoot(page, `ipad-pin-${ground}`);
      await sideBySide(page, await page.screenshot({ animations: 'disabled' }), ground === 'day' ? 'iPadDawnPatrolDayFocus' : 'iPadGromZoneFocus', `${SHOTS}/compare/ipad-pin-${ground}-vs-${ground === 'day' ? 'iPadDawnPatrolDayFocus' : 'iPadGromZoneFocus'}.png`, `PIN pad (${ground})`);

      // Delete and Clear work.
      await page.getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByLabel('1 of 4 typed')).toBeVisible();
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByLabel('0 of 4 typed')).toBeVisible();

      // A pre-reader needs the prompt spoken again on demand, not only once on arrival.
      expect.soft(await page.getByRole('button', { name: /read it to me|say it again|hear/i }).count(), `pin ${ground}: no read-aloud button`).toBeGreaterThan(0);

      // One clear task: the keypad, plus Back. Nothing else to tap.
      const buttons = await page.getByRole('button').count();
      expect(buttons).toBe(13); // 12 keys + Back

      // Back to the picker in one tap.
      await page.getByRole('button', { name: "Back to Who's riding" }).click();
      await expect(page.getByRole('heading', { name: "Who's riding?" })).toBeVisible();
      await ctx.close();
    }
    setGround('auto');
  });

  test('PIN pad: wrong PIN is a gentle retry; the right one opens; lockout is calm', async ({ browser }) => {
    setGround('night');
    const { ctx, page } = await openPicker(browser);
    await page.getByTestId('pick-kid').filter({ hasText: 'Kid A' }).click();
    for (const d of '0000') await page.getByRole('button', { name: d, exact: true }).click();
    await expect(page.getByText('Not quite. Try again!')).toBeVisible();
    expect(await spoken(page)).toContain('Not quite. Try again!');
    await expect(page.getByLabel('0 of 4 typed')).toBeVisible();
    // Keys are usable again straight away (retry, no penalty).
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeEnabled();
    await kidRules(page, 'pin wrong', 'night');
    await shoot(page, 'ipad-pin-wrong-night');
    // The message colour: never an alarm colour for a wrong try.
    const msgColor = await page.locator('.pin-card__msg').evaluate((e) => getComputedStyle(e).color);
    expect(msgColor).not.toBe('rgb(255, 0, 0)');
    for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/kid/${ids['Kid A']}$`));

    // Lockout after 5 wrong tries: calm words, Back still works, and it ends on its own.
    await page.goto('/kid');
    await page.getByTestId('pick-kid').filter({ hasText: 'Kid A' }).click();
    for (let i = 0; i < 5; i++) {
      for (const d of '9999') await page.getByRole('button', { name: d, exact: true }).click();
      await expect(page.getByLabel('0 of 4 typed')).toBeVisible();
    }
    await expect(page.getByText(/Take a little break\. Try again in \d+ minutes?\./)).toBeVisible();
    await kidRules(page, 'pin locked', 'night');
    await shoot(page, 'ipad-pin-locked-night');
    // While locked, even the right code is refused (the lockout is the only "cost" of guessing).
    for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
    await expect(page.getByText(/Take a little break/)).toBeVisible();
    await page.getByRole('button', { name: "Back to Who's riding" }).click();
    // The sibling's profile is unaffected.
    await page.getByTestId('pick-kid').filter({ hasText: 'Kid B' }).click();
    await expect(page).toHaveURL(new RegExp(`/kid/${ids['Kid B']}$`));
    await ctx.close();
    setGround('auto');
  });

  test('reduced motion: no transitions or animations on the picker and PIN pad', async ({ browser }) => {
    const { ctx, page } = await openPicker(browser, { reduced: true });
    const moving = () =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el);
          const dur = (v: string) => v.split(',').some((x) => parseFloat(x) > 0);
          if (dur(s.transitionDuration) || (s.animationName !== 'none' && dur(s.animationDuration))) out.push(`${el.tagName}.${el.className}`);
        }
        return { out, running: document.getAnimations().length };
      });
    let m = await moving();
    expect(m.out, 'transitions/animations under reduced motion (picker)').toEqual([]);
    await page.getByTestId('pick-kid').filter({ hasText: 'Kid A' }).click();
    m = await moving();
    expect(m.out, 'transitions/animations under reduced motion (PIN)').toEqual([]);
    expect(m.running).toBe(0);
    await ctx.close();

    // Without reduced motion, a press still gives instant feedback (a press transform on :active).
    const n = await openPicker(browser, { reduced: false });
    const card = n.page.getByTestId('pick-kid').first();
    const dur = await card.evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(parseFloat(dur)).toBeLessThanOrEqual(0.15);
    await n.ctx.close();
  });

  test('offline: the picker keeps working; a PIN profile explains why it cannot open', async ({ browser }) => {
    setGround('night');
    const { ctx, page } = await openPicker(browser);
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('Offline · still works')).toBeVisible();
    await kidRules(page, 'picker offline', 'night');
    await shoot(page, 'ipad-picker-offline-night');
    await page.getByTestId('pick-kid').filter({ hasText: 'Kid A' }).click();
    await expect(page.getByText('The Deck is offline. Ask a grown-up to help.')).toBeVisible();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
    await shoot(page, 'ipad-pin-offline-night');
    // Not a dead end: Back works offline.
    await page.getByRole('button', { name: "Back to Who's riding" }).click();
    await page.getByTestId('pick-kid').filter({ hasText: 'Kid B' }).click();
    await expect(page).toHaveURL(new RegExp(`/kid/${ids['Kid B']}$`));
    await ctx.setOffline(false);
    await ctx.close();
    setGround('auto');
  });

  test('a kid in Lights out sees a night PIN pad even when the iPad is set to Day', async ({ browser }) => {
    setGround('day');
    sql(`update public.kid_focus set mode = 'lights_out' where kid_id = ${lit(ids['Kid A']!)}`);
    try {
      const { ctx, page } = await openPicker(browser);
      await page.getByTestId('pick-kid').filter({ hasText: 'Kid A' }).click();
      await expect(page.getByText('Type your secret code')).toBeVisible();
      await shoot(page, 'ipad-pin-lightsout-kid-on-day-setting');
      expect.soft(await page.locator('html').getAttribute('data-ground'), 'PIN pad for a Lights-out kid ignores Lights out (shows the day ground)').toBe('night');
      await ctx.close();
    } finally {
      sql(`update public.kid_focus set mode = 'everything' where kid_id = ${lit(ids['Kid A']!)}`);
      setGround('auto');
    }
  });
});

test.describe('slice 2-4 iPad setup screens: Pair and Unpaired', () => {
  test('Pair: wrong code, expired code, no way back after a failed try, then pair and unpair', async ({ browser }) => {
    const p = await makeParent();
    await addKids(p, [{ nickname: 'Kid A', age_band: 'reader' }, { nickname: 'Kid B', age_band: 'prereader' }]);
    const { ctx, page } = await ipadPage(browser);
    await page.goto('/');
    await page.getByRole('button', { name: 'Set up this iPad for the kids' }).click();
    const field = page.getByLabel('Pairing code');
    await expect(field).toHaveAttribute('inputmode', 'numeric');
    await expect(field).toHaveAttribute('maxlength', '8');
    await expect(page.getByRole('button', { name: 'Pair this iPad' })).toBeDisabled();
    for (const s of [{ scheme: 'light', ground: 'day' }, { scheme: 'dark', ground: 'night' }] as const) {
      await scheme(page, s.scheme);
      const a = await audit(page, 48);
      expect.soft(a.ground).toBe(s.ground);
      expect.soft(a.smallTargets, `pair ${s.ground}: targets`).toEqual([]);
      expect.soft(a.contrast, `pair ${s.ground}: contrast`).toEqual([]);
      expect.soft(a.unlabeled, `pair ${s.ground}: labels`).toEqual([]);
      expect.soft(a.yellowOnDay, `pair ${s.ground}: yellow on day`).toEqual([]);
      await shoot(page, `ipad-pair-${s.ground}`);
    }
    // Before any try, a mis-tap can still go back to Welcome?
    const backBefore = await page.getByRole('button', { name: /back|cancel|grown-up/i }).count();
    expect.soft(backBefore, 'Pair screen has no way back to Welcome').toBeGreaterThan(0);

    // Letters are dropped; only digits get in.
    await field.fill('12ab34cd');
    await expect(field).toHaveValue('1234');

    // Wrong code.
    await field.fill('00000000');
    await page.getByRole('button', { name: 'Pair this iPad' }).click();
    await expect(page.getByRole('alert')).toContainText("That code didn't work. Codes last 10 minutes and work once");
    await expect(field).toHaveValue('');
    await shoot(page, 'ipad-pair-wrong-night');

    // Expired code (the phone made it more than 10 minutes ago).
    const [{ code: old }] = (await p.db.rpc('create_pairing_code', { p_label: 'Old code' })).data as { code: string }[];
    sql(`update public.pairing_codes set expires_at = now() - interval '1 second' where family_id = ${lit(p.familyId)} and label = 'Old code'`);
    await field.fill(old);
    await page.getByRole('button', { name: 'Pair this iPad' }).click();
    await expect(page.getByRole('alert')).toContainText("That code didn't work");
    await shoot(page, 'ipad-pair-expired-night');

    // After a failed try the iPad holds an anonymous session: is Welcome / "I'm a grown-up" still reachable?
    await page.goto('/welcome');
    await page.waitForTimeout(800);
    const stuck = new URL(page.url()).pathname;
    await shoot(page, 'ipad-pair-after-failed-try-goto-welcome');
    expect.soft(stuck, 'after one failed pairing try, /welcome redirects to /pair (no way to sign in as a grown-up on this device)').toBe('/welcome');
    await page.goto('/pair');

    // Right code: lands on the picker.
    const [{ code }] = (await p.db.rpc('create_pairing_code', { p_label: 'Kitchen iPad' })).data as { code: string }[];
    await field.fill(code);
    await page.getByRole('button', { name: 'Pair this iPad' }).click();
    await expect(page.getByRole('heading', { name: "Who's riding?" })).toBeVisible();

    // Unpair from the phone; the iPad shows Unpaired on its next launch.
    const dev = sql(`select id from public.devices where family_id = ${lit(p.familyId)} and revoked_at is null`)[0]!;
    await p.db.rpc('revoke_device', { p_device_id: dev });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Unpaired' })).toBeVisible();
    await expect(page.getByText('Kitchen iPad was unpaired by a parent.')).toBeVisible();
    for (const s of [{ scheme: 'light', ground: 'day' }, { scheme: 'dark', ground: 'night' }] as const) {
      await scheme(page, s.scheme);
      const a = await audit(page, 48);
      expect.soft(a.ground).toBe(s.ground);
      expect.soft(a.smallTargets, `unpaired ${s.ground}: targets`).toEqual([]);
      expect.soft(a.contrast, `unpaired ${s.ground}: contrast`).toEqual([]);
      await shoot(page, `ipad-unpaired-${s.ground}`);
    }
    await page.getByRole('button', { name: 'Pair again' }).click();
    await expect(page.getByLabel('Pairing code')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('deck.snapshot.v1'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('deck.currentKid'))).toBeNull();
    await ctx.close();
  });
});

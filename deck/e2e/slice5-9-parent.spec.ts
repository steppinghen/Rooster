import { expect, test, type Browser, type Page } from '@playwright/test';
import { lit, sql } from './helpers/db';
import { addEvent, addKids, addRoutine, makeParent, MORNING_STEPS, pairDevice, pinClock, useSession, type ParentFixture } from './helpers/fixtures';
import { audit, installQa, scheme, sideBySide } from './helpers/qa';

/*
 * Independent UX QA for slices 6 to 8, parent side.
 * iPhone 390x844 for every parent screen in both grounds (prefers-color-scheme), and iPad
 * landscape 1180x820 for the nav rail. Seed placeholders only.
 */

const SHOTS = 'review/screenshots/slice-5-9';
const PARENT_MIN = 48;
const SEVEN_AM = '2026-10-01T11:00:00Z';

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

async function shoot(page: Page, name: string, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage, animations: 'disabled' });
}

async function bothGrounds(page: Page, fn: (g: 'day' | 'night') => Promise<void>) {
  for (const [s, g] of [['light', 'day'], ['dark', 'night']] as const) {
    await scheme(page, s);
    await fn(g);
  }
}

async function phone(browser: Browser, p: ParentFixture, size = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport: size, isMobile: size.width < 1000, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', acceptDownloads: true });
  await installQa(ctx);
  await useSession(ctx, p.session);
  const page = await ctx.newPage();
  await pinClock(page, SEVEN_AM);
  return { ctx, page };
}

let p: ParentFixture;
let device: Awaited<ReturnType<typeof pairDevice>>;

test.beforeAll(async ({}, info) => {
  if (info.project.name === 'ipad') return;
  p = await makeParent({ familyName: `Family Parent QA ${Date.now() % 100000}` });
  await addKids(p, [{ nickname: 'Kid A', age_band: 'reader' }, { nickname: 'Kid B', age_band: 'prereader' }]);
  await addRoutine(p, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: MORNING_STEPS });
  await addEvent(p, { title: 'Beach trip', icon: 'beach', on_date: '2026-10-13', kind: 'trip' });
  device = await pairDevice(p);
});

test.describe('iPhone', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'iphone', 'iPhone only'));

  test('Back Office Routines: templates and editor (slice 7)', async ({ browser }) => {
    const { ctx, page } = await phone(browser, p);
    await page.goto('/parent/office');
    await expect(page.getByTestId('routine-row')).toHaveCount(1);
    await bothGrounds(page, async (g) => {
      await parentRules(page, g, `office ${g}`);
      await shoot(page, `iphone-office-${g}`);
    });
    for (const t of ['Dawn Patrol', 'After School', 'Last Run']) await expect(page.getByRole('button', { name: `+ ${t}` })).toBeVisible();

    // A Last Run template: editor rules (labels, 48pt), picture picker, reorder, remove, cancel.
    await page.getByRole('button', { name: '+ Last Run' }).click();
    const ed = page.getByTestId('routine-editor');
    await expect(ed).toBeVisible();
    await expect(ed.getByLabel('Name')).toHaveValue('Last Run');
    await expect(ed.getByRole('radio', { name: 'Bedtime', checked: true })).toBeVisible();
    await ed.getByRole('button', { name: /^Picture for / }).first().click();
    await expect(ed.getByRole('radiogroup', { name: /^Picture for / })).toBeVisible();
    await bothGrounds(page, async (g) => {
      await parentRules(page, g, `routine editor ${g}`);
      await shoot(page, `iphone-routine-editor-${g}`);
    });
    // Moving the first step up is disabled (not a silent no-op).
    await expect(ed.getByTestId('routine-step').first().getByRole('button', { name: 'Move up' })).toBeDisabled();
    // There is no "Move down": the last step can only reach the top by many taps of others.
    expect.soft(await ed.getByRole('button', { name: 'Move down' }).count(), 'routine editor: no Move down (reorder needs many taps)').toBeGreaterThan(0);
    // Removing a step has no undo or confirm.
    const before = await ed.getByTestId('routine-step').count();
    await ed.getByTestId('routine-step').first().getByRole('button', { name: 'Remove step' }).click();
    await expect(ed.getByTestId('routine-step')).toHaveCount(before - 1);
    // Save with an empty name is blocked; is the reason shown?
    await ed.getByLabel('Name').fill('');
    await expect(ed.getByRole('button', { name: 'Save routine' })).toBeDisabled();
    await ed.getByLabel('Name').fill('Last Run');
    await ed.getByRole('button', { name: 'Save routine' }).click();
    await expect(page.getByTestId('routine-row')).toHaveCount(2);
    // Edit then delete with a confirm.
    await page.getByTestId('routine-row').filter({ hasText: 'Last Run' }).getByRole('button', { name: 'Edit' }).click();
    await ed.getByRole('button', { name: 'Delete…' }).click();
    await shoot(page, 'iphone-routine-delete-confirm-night');
    await ed.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(page.getByTestId('routine-row')).toHaveCount(1);
    await ctx.close();
  });

  test('Devices ground picker: 48pt, labelled, saved, explained (slice 7)', async ({ browser }) => {
    const { ctx, page } = await phone(browser, p);
    await page.goto('/parent/office');
    const group = page.getByRole('radiogroup', { name: 'Look on Kitchen iPad' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('radio', { name: 'Auto', checked: true })).toBeVisible();
    for (const [label, value] of [['Day', 'day'], ['Night', 'night'], ['Follow iPad', 'device'], ['Auto', 'auto']] as const) {
      await group.getByRole('radio', { name: label }).click();
      await expect(group.getByRole('radio', { name: label, checked: true })).toBeVisible();
      await expect.poll(() => sql(`select ground from public.devices where id = ${lit(device.deviceId)}`)[0]).toBe(value);
    }
    await expect(page.getByText(/Bedtime and Lights out are always night/)).toBeVisible();
    await group.scrollIntoViewIfNeeded();
    await bothGrounds(page, async (g) => {
      await parentRules(page, g, `devices ${g}`);
      await page.locator('[data-testid="device-row"]').screenshot({ path: `${SHOTS}/iphone-devices-ground-${g}.png` });
    });
    await ctx.close();
  });

  test('Tour Dates month view and event editor (slice 8)', async ({ browser }) => {
    const { ctx, page } = await phone(browser, p);
    await page.goto('/parent/dates');
    await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
    await bothGrounds(page, async (g) => {
      await parentRules(page, g, `dates month ${g}`);
      await shoot(page, `iphone-dates-month-${g}`);
    });
    // Tap a day: a new event for that day.
    await page.getByRole('gridcell', { name: /^2026-10-20/ }).click();
    const ed = page.getByTestId('event-editor');
    await expect(ed.getByLabel('When')).toHaveValue('2026-10-20');
    // Is the editor brought into view after tapping a day near the top of the page?
    const inView = await ed.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0;
    });
    expect.soft(inView, 'dates: tapping a day opens the editor off screen (below the list) with no scroll').toBe(true);
    await ed.scrollIntoViewIfNeeded();
    await bothGrounds(page, async (g) => {
      await parentRules(page, g, `event editor ${g}`);
      await shoot(page, `iphone-event-editor-${g}`);
    });
    await expect(ed.getByRole('button', { name: 'Save' })).toBeDisabled();
    await ed.getByLabel('What').fill('Pumpkin patch');
    await ed.getByRole('radio', { name: 'pumpkin' }).click();
    await ed.getByRole('radio', { name: 'Holiday' }).click();
    await ed.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('event-row').filter({ hasText: 'Pumpkin patch' })).toContainText('19 sleeps · Kids see it');
    // Edit -> Parents only -> delete with confirm.
    await page.getByTestId('event-row').filter({ hasText: 'Pumpkin patch' }).getByRole('button', { name: 'Edit' }).click();
    await ed.getByRole('radio', { name: 'Parents only' }).click();
    await ed.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('event-row').filter({ hasText: 'Pumpkin patch' })).toContainText('Parents only');
    await page.getByTestId('event-row').filter({ hasText: 'Pumpkin patch' }).getByRole('button', { name: 'Edit' }).click();
    await ed.getByRole('button', { name: 'Delete…' }).click();
    await ed.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(page.getByTestId('event-row').filter({ hasText: 'Pumpkin patch' })).toHaveCount(0);
    // Month navigation.
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
    await expect(page.getByText('Nothing this month.')).toBeVisible();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
    // Day cells: a grid of buttons, each must be a 48pt target.
    const cell = (await page.getByRole('gridcell', { name: /^2026-10-15/ }).boundingBox())!;
    expect.soft(Math.min(cell.width, cell.height), `dates: day cell is ${Math.round(cell.width)}x${Math.round(cell.height)}`).toBeGreaterThanOrEqual(PARENT_MIN);
    await ctx.close();
  });

  test('Your data: export and typed-confirm delete, 48pt and labelled (slice 6)', async ({ browser }) => {
    const q = await makeParent({ familyName: 'Family Wipe QA' });
    await addKids(q, [{ nickname: 'Kid A', age_band: 'reader' }]);
    const { ctx, page } = await phone(browser, q);
    await page.goto('/parent/office');
    await page.getByRole('button', { name: 'Export all family data' }).click();
    await expect(page.getByTestId('export-download')).toBeVisible();
    await page.getByTestId('export-download').scrollIntoViewIfNeeded();
    await bothGrounds(page, async (g) => {
      await parentRules(page, g, `export ${g}`);
      await page.getByTestId('export-download').screenshot({ path: `${SHOTS}/iphone-export-link-${g}.png` });
    });
    await page.getByRole('button', { name: 'Delete family…' }).click();
    const field = page.getByLabel('Type "Family Wipe QA" to confirm');
    await field.scrollIntoViewIfNeeded();
    await bothGrounds(page, async (g) => {
      await parentRules(page, g, `delete confirm ${g}`);
      await page.locator('.p-danger').screenshot({ path: `${SHOTS}/iphone-delete-confirm-${g}.png` });
    });
    // Not a dead end: "Keep it" backs out and clears the field.
    await page.getByRole('button', { name: 'Keep it' }).click();
    await expect(page.getByRole('button', { name: 'Delete family…' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete family…' }).click();
    await expect(field).toHaveValue('');
    // Trailing space or wrong case keeps it disabled.
    await field.fill('Family Wipe QA ');
    await expect(page.getByRole('button', { name: 'Delete the family' })).toBeDisabled();
    await field.fill('Family Wipe QA');
    await page.getByRole('button', { name: 'Delete the family' }).click();
    await expect(page.getByRole('button', { name: "I'm a grown-up" })).toBeVisible();
    expect(sql(`select count(*) from public.families where id = ${lit(q.familyId)}`)).toEqual(['0']);
    await ctx.close();
  });
});

test.describe('iPad landscape rail', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad-landscape', 'iPad landscape only'));

  test('Back Office and Tour Dates with the nav rail (slices 6-8)', async ({ browser }) => {
    const { ctx, page } = await phone(browser, p, { width: 1180, height: 820 });
    for (const path of ['/parent/office', '/parent/dates']) {
      await page.goto(path);
      const rail = page.locator('.dk-nav--rail, nav').first();
      await expect(rail).toBeVisible();
      await bothGrounds(page, async (g) => {
        await parentRules(page, g, `${path} landscape ${g}`);
        const shot = await shoot(page, `ipad-landscape${path.replace(/\//g, '-')}-${g}`, false);
        if (path === '/parent/office') await sideBySide(page, shot, g === 'day' ? 'iPadHubDay' : 'iPadHub', `${SHOTS}/compare/ipad-landscape-office-${g}-vs-${g === 'day' ? 'iPadHubDay' : 'iPadHub'}.png`, `Back Office with rail (${g})`, 820);
      });
      // Rail: the current page is marked, and each item is a 48pt target.
      const current = await page.locator('[aria-current="page"]').count();
      expect.soft(current, `${path}: rail marks the current page`).toBe(1);
      // Content uses the width: the main column is not a phone column stretched or stranded.
      const w = await page.locator('.parent__main').evaluate((e) => e.getBoundingClientRect().width);
      expect.soft(w, `${path}: main column width`).toBeGreaterThan(600);
    }
    // The rail stays put when the page scrolls.
    await page.goto('/parent/office');
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    const railTop = await page.locator('.parent--wide nav').first().evaluate((e) => e.getBoundingClientRect().top);
    expect.soft(railTop, 'rail scrolls away with Back Office').toBeGreaterThanOrEqual(-1);
    await shoot(page, 'ipad-landscape-office-scrolled-night', false);
    await ctx.close();
  });
});

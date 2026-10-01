import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { lit, sql } from './helpers/db';
import { addEvent, addKids, addRoutine, makeParent, MORNING_STEPS, pairDevice, useSession } from './helpers/fixtures';

const SHOTS = 'review/screenshots/slice-6';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'iphone', 'parent flows run on the iPhone profile'));

test('export opens and has every table; delete wipes the family (slice 6)', async ({ browser }) => {
  const parent = await makeParent({ familyName: 'Family Delete Me' });
  await addKids(parent, [{ nickname: 'Kid A', age_band: 'reader', pin: '1234' }, { nickname: 'Kid B', age_band: 'prereader' }]);
  await addRoutine(parent, { name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30', steps: MORNING_STEPS });
  await addEvent(parent, { title: 'Beach trip', icon: 'beach', on_date: '2026-10-13' });
  const device = await pairDevice(parent);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await useSession(ctx, parent.session);
  const page = await ctx.newPage();
  await page.goto('/parent/office');

  await page.getByRole('button', { name: 'Export all family data' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const names = Object.keys(files).map((n) => n.split('/').pop());
  expect(names).toEqual(expect.arrayContaining(['export.json', 'events.csv', 'kids.csv', 'routines.csv', 'routine_progress.csv', 'usage.csv', 'README.txt']));
  const json = JSON.parse(strFromU8(Object.entries(files).find(([n]) => n.endsWith('export.json'))![1]));
  // Every family table in the database is in the export.
  const familyTables = sql(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'family_id' and table_name <> 'families' order by 1`);
  expect(Object.keys(json.tables).sort()).toEqual(familyTables);
  expect(json.tables.kids).toHaveLength(2);
  expect(JSON.stringify(json)).not.toMatch(/\$2[ab]\$/); // no bcrypt hashes
  await page.screenshot({ path: `${SHOTS}/iphone-export.png`, fullPage: true });

  await page.getByRole('button', { name: 'Delete family…' }).click();
  const del = page.getByRole('button', { name: 'Delete the family' });
  await expect(del).toBeDisabled();
  await page.getByLabel('Type "Family Delete Me" to confirm').fill('family delete me');
  await expect(del).toBeDisabled();
  await page.getByLabel('Type "Family Delete Me" to confirm').fill('Family Delete Me');
  await page.screenshot({ path: `${SHOTS}/iphone-delete-confirm.png`, fullPage: true });
  await del.click();
  await expect(page.getByRole('button', { name: "I'm a grown-up" })).toBeVisible();

  expect(sql(`select count(*) from public.families where id = ${lit(parent.familyId)}`)).toEqual(['0']);
  expect(sql(`select count(*) from auth.users where email = ${lit(parent.email)}`)).toEqual(['0']);
  // The iPad is gone too.
  const { data } = await device.db.from('kids').select('id');
  expect(data ?? []).toEqual([]);
  await ctx.close();
});

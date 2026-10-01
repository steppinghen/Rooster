import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * Slice 0 has no feature screens, so the comparison is component styling against the closest
 * mockup (design/reference/README.md), not layout. Each output PNG puts the app capture on the
 * left and the reference PNG on the right, at the same height.
 */

const OUT = 'review/screenshots/slice-0/compare';
const REF = 'design/reference/png';

async function setRoot(page: Page, ground: string, volume: string) {
  await page.getByRole('group', { name: 'Ground' }).getByRole('button', { name: ground, exact: true }).click();
  await page.getByRole('group', { name: 'Volume' }).getByRole('button', { name: volume, exact: true }).click();
  await page.waitForTimeout(1150);
}

async function sideBySide(page: Page, app: Buffer, refName: string, out: string, appLabel: string) {
  const ref = readFileSync(`${REF}/${refName}.png`);
  const h = 1180;
  const html = `<!doctype html><html><body style="margin:0;background:#888;font:600 16px system-ui">
    <div id="c" style="display:flex;gap:16px;padding:16px;align-items:flex-start;width:max-content">
      <figure style="margin:0"><figcaption>APP: ${appLabel}</figcaption><img style="height:${h}px;display:block" src="data:image/png;base64,${app.toString('base64')}"></figure>
      <figure style="margin:0"><figcaption>REFERENCE: ${refName}.png</figcaption><img style="height:${h}px;display:block" src="data:image/png;base64,${ref.toString('base64')}"></figure>
    </div></body></html>`;
  const p2 = await page.context().newPage();
  await p2.setViewportSize({ width: 2400, height: h + 80 });
  await p2.setContent(html);
  await p2.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p2.locator('#c').screenshot({ path: `${OUT}/${out}.png` });
  await p2.close();
}

async function shot(l: Locator) {
  return l.screenshot({ animations: 'disabled' });
}

test.describe('slice 0: styling vs mockups (side by side)', () => {
  test('kid components vs iPad kid mockups', async ({ page }, info) => {
    test.skip(info.project.name !== 'ipad', 'kid mockups are iPad portrait');
    await page.goto('/styleguide');
    await page.evaluate(() => document.fonts.ready);
    const pairs = [
      { ground: 'night', volume: 'normal', ref: 'iPadGromZone' },
      { ground: 'night', volume: 'focus', ref: 'iPadGromZoneFocus' },
      { ground: 'day', volume: 'normal', ref: 'iPadDawnPatrolDay' },
      { ground: 'day', volume: 'focus', ref: 'iPadDawnPatrolDayFocus' },
    ];
    for (const p of pairs) {
      await setRoot(page, p.ground, p.volume);
      const img = await shot(page.locator('.sg-scope--root'));
      await sideBySide(page, img, p.ref, `ipad-${p.ground}-${p.volume}-vs-${p.ref}`, `preview ${p.ground} · ${p.volume}`);
    }
    // Last Run scope vs the Last Run mockup.
    await sideBySide(page, await shot(page.getByTestId('set-lastrun')), 'iPadLastRun', 'ipad-lastrun-vs-iPadLastRun', 'set-lastrun');
  });

  test('parent nav vs Main (phone) and iPadHub (landscape)', async ({ page }, info) => {
    test.skip(info.project.name === 'ipad', 'parent mockups are phone and landscape');
    await page.goto('/styleguide');
    await page.evaluate(() => document.fonts.ready);
    for (const ground of ['night', 'day']) {
      await setRoot(page, ground, 'normal');
      if (info.project.name === 'iphone') {
        await sideBySide(page, await shot(page.locator('.sg-tabs')), ground === 'day' ? 'MainDay' : 'Main', `iphone-tabs-${ground}-vs-Main${ground === 'day' ? 'Day' : ''}`, `NavBar tabs (${ground})`);
        await sideBySide(page, await shot(page.locator('.sg-scope--root')), 'GromZone', `iphone-preview-${ground}-normal-vs-GromZone`, `preview ${ground} · normal`);
      } else {
        await sideBySide(page, await shot(page.locator('.sg-navs')), ground === 'day' ? 'iPadHubDay' : 'iPadHub', `landscape-nav-${ground}-vs-iPadHub${ground === 'day' ? 'Day' : ''}`, `NavBar rail + tabs (${ground})`);
      }
    }
    if (info.project.name === 'iphone') {
      const cel = page.locator('section', { has: page.locator('#sg-celebrate') }).locator('[data-volume]');
      await page.waitForTimeout(1500); // let the burst finish
      await sideBySide(page, await shot(cel), 'Shred', 'iphone-celebration-vs-Shred', 'celebration burst');
    }
    expect(true).toBe(true);
  });
});

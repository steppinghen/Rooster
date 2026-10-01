/* global document */
// Renders every mockup in design/reference/ to design/reference/png/ with WebKit.
// The mockups load Google Fonts; that is fine here (dev-only, on the Mac), never in the app.
import { webkit } from '@playwright/test';
import { readdir, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const dir = 'design/reference';
const out = join(dir, 'png');
await mkdir(out, { recursive: true });
const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
const browser = await webkit.launch();
for (const f of files) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
  await page.goto('file://' + join(process.cwd(), dir, f), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // The artboard is the first fixed-size div in the body.
  const board = page.locator('body div').first();
  await board.screenshot({ path: join(out, basename(f, '.html') + '.png') });
  const box = await board.boundingBox();
  console.log(f, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no box');
  await page.close();
}
await browser.close();

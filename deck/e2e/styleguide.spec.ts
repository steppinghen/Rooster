import { expect, test } from '@playwright/test';

const SHOTS = 'review/screenshots/slice-0';

test.describe('styleguide (slice 0)', () => {
  test('loads only same-origin resources and self-hosted fonts', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data')) foreign.push(r.url());
    });
    await page.goto('/styleguide');
    await page.evaluate(() => document.fonts.ready);
    for (const f of ['16px "Archivo Black"', '16px Archivo', '16px "Permanent Marker"', '16px Lexend']) {
      expect(await page.evaluate((spec) => document.fonts.check(spec), f), f).toBe(true);
    }
    expect(foreign, `third-party requests from ${baseURL}`).toEqual([]);
  });

  test('normal volume has the comic treatment; focus volume turns it off', async ({ page }) => {
    await page.goto('/styleguide');
    for (const ground of ['night', 'day']) {
      const normal = page.getByTestId(`set-${ground}-normal`);
      const focus = page.getByTestId(`set-${ground}-focus`);

      const shadow = (s: typeof normal) => s.locator('.dk-headline').first().evaluate((el) => getComputedStyle(el).textShadow);
      expect(await shadow(normal)).not.toBe('none');
      expect(await shadow(focus)).toBe('none');

      const markerFont = (s: typeof normal) => s.locator('.dk-marker').first().evaluate((el) => getComputedStyle(el).fontFamily);
      expect(await markerFont(normal)).toContain('Permanent Marker');
      expect(await markerFont(focus)).not.toContain('Permanent Marker');

      const tilt = (s: typeof normal) => s.locator('.dk-sticker').first().evaluate((el) => getComputedStyle(el).transform);
      const emojiNormal = page.getByTestId(`emoji-${ground}-normal`);
      const emojiFocus = page.getByTestId(`emoji-${ground}-focus`);
      expect(await tilt(emojiNormal)).not.toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
      expect(await tilt(emojiFocus)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

      const groundImage = (s: typeof normal) => s.evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(await groundImage(normal)).toContain('radial-gradient');
      expect(await groundImage(focus)).toBe('none');

      // Accent appears as a big fill only in normal volume.
      const upNext = (s: typeof normal) => s.locator('.dk-accent-block').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(await upNext(normal)).toBe('rgb(255, 62, 138)');
      expect(await upNext(focus)).not.toBe('rgb(255, 62, 138)');

      // What never changes between volumes: display font, outline, pressable button.
      const edge = async (sc: typeof normal) => sc.locator('.dk-btn--ink').first().evaluate((el) => getComputedStyle(el).borderTopColor);
      for (const sc of [normal, focus]) {
        expect(await sc.locator('.dk-btn--ink').first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Archivo Black');
        expect(await sc.locator('.dk-btn--accent').first().evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(10, 8, 24)');
      }
      expect(await edge(normal)).toBe(await edge(focus));
    }
  });

  test('Last Run is always night', async ({ page }) => {
    await page.goto('/styleguide');
    const scope = page.getByTestId('set-lastrun');
    await expect(scope).toHaveAttribute('data-ground', 'night');
    expect(await scope.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(20, 18, 40)');
  });

  test('day ground never uses yellow text', async ({ page }) => {
    await page.goto('/styleguide');
    for (const id of ['set-day-normal', 'set-day-focus']) {
      const yellow = await page.getByTestId(id).evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>('*')].filter((el) => {
          if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) return false;
          if (el.closest('.dk-tag, .dk-btn--yellow, .dk-burst, [aria-current="page"]')) return false; // ink text on a yellow fill
          return getComputedStyle(el).color === 'rgb(255, 210, 63)';
        }).map((el) => el.textContent),
      );
      expect(yellow, id).toEqual([]);
    }
  });

  test('reduced motion turns the burst animation off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/styleguide');
    const anim = await page.locator('.dk-burst svg').first().evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('none');
  });

  test('screenshots for review', async ({ page }, info) => {
    await page.goto('/styleguide');
    await page.evaluate(() => document.fonts.ready);
    for (const ground of ['night', 'day']) {
      for (const volume of ['normal', 'focus']) {
        await page.getByRole('group', { name: 'Ground' }).getByRole('button', { name: ground }).click();
        await page.getByRole('group', { name: 'Volume' }).getByRole('button', { name: volume }).click();
        await page.waitForTimeout(1100); // ground cross-fade
        await page.locator('section', { has: page.locator('#sg-preview') }).screenshot({ path: `${SHOTS}/${info.project.name}-preview-${ground}-${volume}.png` });
      }
    }
    await page.locator('section', { has: page.locator('#sg-emoji') }).screenshot({ path: `${SHOTS}/${info.project.name}-art.png` });
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-full.png`, fullPage: true });
  });
});

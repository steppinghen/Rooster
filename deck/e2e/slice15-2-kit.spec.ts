import { expect, test } from '@playwright/test';

// Phase 1.5 slice 2: theme and core components on the styleguide, every ground × volume × age.
// rotate(0) computes to an identity matrix rather than 'none'.
const untilted = (t: string) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
const SCOPES = ['night', 'day'].flatMap((g) => ['normal', 'focus'].flatMap((v) => ['reader', 'prereader'].map((a) => ({ g, v, a, id: `kit-${g}-${v}-${a}` }))));

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'styleguide checks run once, on the iPad profile'));

test('ink dock: exactly one active item; slim holds Home and Wave Check only', async ({ page }) => {
  await page.goto('/styleguide');
  for (const s of SCOPES) {
    const kit = page.getByTestId(s.id);
    const [full, slim] = [kit.locator('.dk-dock--full'), kit.locator('.dk-dock--slim')];
    await expect(full.locator('[aria-current="page"]'), s.id).toHaveCount(1);
    await expect(slim.locator('[aria-current="page"]'), s.id).toHaveCount(1);
    await expect(slim.locator('.dk-dock__item')).toHaveCount(2);
    expect(await slim.locator('.dk-dock__item').evaluateAll((els) => els.map((e) => e.getAttribute('data-dock')))).toEqual(['home', 'wave_check']);
    // Never red: tags are cyan (check in) or yellow (to-do).
    for (const bg of await kit.locator('.dk-dock__tag').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))) {
      expect(['rgb(41, 211, 255)', 'rgb(255, 210, 63)'], s.id).toContain(bg);
    }
  }
});

test('normal volume: kid color fills the active item, marker greeting, offset headline, tilted tags, corner and trim', async ({ page }) => {
  await page.goto('/styleguide');
  for (const s of SCOPES.filter((x) => x.v === 'normal')) {
    const kit = page.getByTestId(s.id);
    const active = kit.locator('.dk-dock--full [aria-current="page"]');
    expect(await active.evaluate((e) => getComputedStyle(e).backgroundColor), s.id).toBe('rgb(41, 211, 255)'); // the kit's kid color (cyan)
    expect(await kit.locator('.dk-kidhead__greet').evaluate((e) => getComputedStyle(e).fontFamily), s.id).toContain('Permanent Marker');
    expect(await kit.locator('.dk-kidhead__title').evaluate((e) => getComputedStyle(e).textShadow), s.id).toContain('rgb(41, 211, 255) 4px 0px 0px');
    expect(await kit.locator('.dk-dock__tag--checkin').first().evaluate((e) => getComputedStyle(e).transform), s.id).not.toBe('none');
    await expect(kit.locator('.dk-corner')).toBeVisible();
    await expect(kit.locator('.dk-trim')).toBeVisible();
  }
});

test('focus volume: ring not fill, plain greeting, no headline shadow, still straight tags, no corner or trim, no halftone, no tilt', async ({ page }) => {
  await page.goto('/styleguide');
  for (const s of SCOPES.filter((x) => x.v === 'focus')) {
    const kit = page.getByTestId(s.id);
    const active = kit.locator('.dk-dock--full [aria-current="page"]');
    expect(await active.evaluate((e) => getComputedStyle(e).backgroundColor), s.id).toBe('rgba(0, 0, 0, 0)');
    expect(await active.evaluate((e) => getComputedStyle(e).borderTopColor), s.id).toBe('rgb(41, 211, 255)');
    expect(await kit.locator('.dk-kidhead__greet').evaluate((e) => getComputedStyle(e).fontFamily), s.id).not.toContain('Permanent Marker');
    expect(await kit.locator('.dk-kidhead__title').evaluate((e) => getComputedStyle(e).textShadow), s.id).toBe('none');
    expect(await kit.locator('.dk-head-avatar').evaluate((e) => getComputedStyle(e).backgroundColor), s.id).toBe('rgb(255, 251, 242)'); // paper, kid color only as the ring
    for (const t of await kit.locator('.dk-dock__tag').evaluateAll((els) => els.map((e) => [getComputedStyle(e).transform, getComputedStyle(e).animationName]))) {
      expect(untilted(t[0]), s.id).toBe(true);
      expect(t[1], s.id).toBe('none');
    }
    await expect(kit.locator('.dk-corner')).toBeHidden();
    await expect(kit.locator('.dk-trim')).toBeHidden();
    expect(await kit.evaluate((e) => getComputedStyle(e).backgroundImage), s.id).toBe('none');
    for (const tr of await kit.locator('.dk-cut').evaluateAll((els) => els.map((e) => getComputedStyle(e).transform))) expect(untilted(tr), s.id).toBe(true);
  }
});

test('die-cut: size classes follow size and volume (focus never lg); the small cut is thinner', async ({ page }) => {
  await page.goto('/styleguide');
  const classes = (id: string) => page.getByTestId(id).locator('.dk-cut').evaluateAll((els) => els.map((e) => e.getAttribute('data-size')));
  expect(await classes('kit-day-normal-reader')).toEqual(['lg', 'md', 'sm']);
  expect(await classes('kit-day-focus-reader')).toEqual(['md', 'md', 'sm']);
  const rim = (sel: string) => page.getByTestId('kit-day-normal-reader').locator(sel).first().evaluate((e) => getComputedStyle(e).getPropertyValue('--rim').trim());
  expect(await rim('.dk-cut--lg')).toBe('2.5px');
  expect(await rim('.dk-cut--sm')).toBe('1.75px');
});

test('touch targets: dock items at least 80 px tall for the pre-reader and 64 px for the reader; the header avatar 80 px for the pre-reader', async ({ page }) => {
  await page.goto('/styleguide');
  for (const s of SCOPES) {
    const kit = page.getByTestId(s.id);
    const min = s.a === 'prereader' ? 80 : 64;
    for (const box of await kit.locator('.dk-dock__item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
      expect(box.height, s.id).toBeGreaterThanOrEqual(min);
      expect(box.width, s.id).toBeGreaterThanOrEqual(64);
    }
    const av = await kit.locator('.dk-head-avatar').boundingBox();
    expect(av!.height, s.id).toBeGreaterThanOrEqual(s.a === 'prereader' ? 80 : 64);
  }
});

test('parent look: Night and Day tokens, primary buttons ink with paper text by day', async ({ page }) => {
  await page.goto('/styleguide');
  const css = (id: string, sel: string, prop: string) => page.getByTestId(id).locator(sel).first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);
  expect(await page.getByTestId('parent-day').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(245, 239, 226)');
  expect(await page.getByTestId('parent-night').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(21, 18, 46)');
  expect(await css('parent-day', '.sg-parent__btn', 'background-color')).toBe('rgb(10, 8, 24)');
  expect(await css('parent-day', '.sg-parent__btn', 'color')).toBe('rgb(255, 251, 242)');
  expect(await css('parent-day', 'a', 'color')).toBe('rgb(179, 18, 79)');
  expect(await css('parent-night', 'a', 'color')).toBe('rgb(255, 210, 63)');
});

test('reduced motion: dock tags never animate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/styleguide');
  for (const name of await page.locator('.dk-dock__tag').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName))) expect(name).toBe('none');
});

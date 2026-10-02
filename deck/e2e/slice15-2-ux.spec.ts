import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { installQa } from './helpers/qa';
import { loadFrame } from './helpers/frames';

/*
 * kid-ux-tester, Phase 1.5 slice 2 (theme and core components). There are no real screens yet:
 * the kit lives on /styleguide ("Phase 1.5 kit", data-testid kit-<ground>-<volume>-<age>, and
 * "Parent look", parent-<ground>). These checks hold the header, die-cut and ink dock to the
 * brief (docs/kid-screens.md "The Point: layout B2", docs/design-system.md) and the B2 frames,
 * on iPad portrait and landscape. Screenshots: review/screenshots/slice-15-2/.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const OUT = 'review/screenshots/slice-15-2';
const INK = 'rgb(10, 8, 24)';
const CYAN = 'rgb(41, 211, 255)';
const MAGENTA = 'rgb(255, 62, 138)';
const LIME = 'rgb(155, 229, 100)';
const YELLOW = 'rgb(255, 210, 63)';
const PAPER = 'rgb(255, 251, 242)';

type Scope = { g: 'day' | 'night'; v: 'normal' | 'focus'; a: 'reader' | 'prereader'; id: string };
const SCOPES: Scope[] = (['night', 'day'] as const).flatMap((g) =>
  (['normal', 'focus'] as const).flatMap((v) => (['reader', 'prereader'] as const).map((a) => ({ g, v, a, id: `kit-${g}-${v}-${a}` }))),
);
const kidTarget = (a: Scope['a']) => (a === 'prereader' ? 80 : 64);
const isIpad = (name: string) => name === 'ipad' || name === 'ipad-landscape';

async function open(page: Page, opts: { reduce?: boolean; kid?: string } = {}) {
  await installQa(page);
  if (opts.reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/styleguide');
  await page.evaluate(() => document.fonts.ready);
  // Optionally repaint the kit in another kid color (the kit hard-codes cyan, which is also the
  // check-in tag's color and one of the headline shadows, so cyan alone can't tell them apart).
  if (opts.kid) await page.addStyleTag({ content: `.sg-kit,.sg-kit .dk-kidhead{--kid:var(--${opts.kid}) !important;--accent:var(--${opts.kid}) !important}` });
}

/** Contrast, color-rule and target evidence inside one kit scope. */
async function scopeAudit(kit: Locator, minKid: number) {
  return kit.evaluate((root, min) => {
    const qa = (window as any).__qa;
    const ground = root.getAttribute('data-ground');
    const contrast: string[] = [];
    const yellowOnDay: string[] = [];
    const creamOnAccent: string[] = [];
    const red: string[] = [];
    const small44: string[] = [];
    const smallKid: string[] = [];
    const ACCENTS = ['255,62,138', '41,211,255', '255,210,63', '155,229,100', '169,155,255', '255,138,61'];
    const CREAMS = ['244,235,217', '255,251,242', '255,255,255'];
    const hsl = ([r, g, b]: number[]) => {
      const [x, y, z] = [r! / 255, g! / 255, b! / 255];
      const mx = Math.max(x, y, z);
      const mn = Math.min(x, y, z);
      const l = (mx + mn) / 2;
      const d = mx - mn;
      if (!d) return [0, 0, l];
      const s = d / (1 - Math.abs(2 * l - 1));
      let h = mx === x ? ((y - z) / d) % 6 : mx === y ? (z - x) / d + 2 : (x - y) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      return [h, s, l];
    };
    const isRed = (c: string) => {
      const p = qa.parse(c);
      if (!p || p[3] === 0) return false;
      const [h, s, l] = hsl(p);
      return (h! >= 350 || h! <= 12) && s! > 0.55 && l! > 0.25 && l! < 0.7;
    };
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!qa.visible(el)) continue;
      const s = getComputedStyle(el);
      for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.borderLeftColor]) if (isRed(c)) red.push(`${qa.name(el)} ${c}`);
      if (el.matches('button, a[href], [role=button]')) {
        const r = el.getBoundingClientRect();
        if (Math.min(r.width, r.height) + 0.5 < 44) small44.push(`${qa.name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (Math.min(r.width, r.height) + 0.5 < min) smallKid.push(`${qa.name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const text = qa.ownText(el);
      if (!text) continue;
      const fg = qa.parse(s.color);
      if (!fg) continue;
      const bg = qa.effectiveBg(el);
      const cr = qa.ratio(qa.blend([fg[0], fg[1], fg[2], fg[3] * qa.opacityChain(el)], bg), bg);
      const px = parseFloat(s.fontSize);
      const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
      if (cr + 0.005 < (large ? 3 : 4.5)) contrast.push(`${qa.name(el)} ${cr.toFixed(2)}:1 fg ${s.color} bg rgb(${bg.slice(0, 3).map(Math.round)})`);
      const fgKey = fg.slice(0, 3).join(',');
      const bgKey = bg.slice(0, 3).map(Math.round).join(',');
      if (ground === 'day' && fgKey === '255,210,63') yellowOnDay.push(qa.name(el));
      if (ACCENTS.includes(bgKey) && CREAMS.includes(fgKey)) creamOnAccent.push(`${qa.name(el)} on rgb(${bgKey})`);
    }
    return { contrast, yellowOnDay, creamOnAccent, red, small44, smallKid };
  }, minKid);
}

/** Volume evidence inside one kit scope: marker, text shadows, halftone, tilts. */
async function scopeVolume(kit: Locator) {
  return kit.evaluate((root) => {
    const qa = (window as any).__qa;
    const out = { marker: [] as string[], shadows: [] as string[], halftone: [] as string[], tilts: [] as string[] };
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!qa.visible(el)) continue;
      const s = getComputedStyle(el);
      const text = qa.ownText(el);
      if (text && s.fontFamily.includes('Permanent Marker')) out.marker.push(qa.name(el));
      if (text && s.textShadow !== 'none') out.shadows.push(`${qa.name(el)} ${s.textShadow}`);
      if (s.backgroundImage.includes('radial-gradient')) out.halftone.push(qa.name(el));
      if (qa.rotated(el)) out.tilts.push(qa.name(el));
    }
    return out;
  });
}

test.describe('slice 15-2: kit on the iPad', () => {
  test.beforeEach(({}, info) => test.skip(!isIpad(info.project.name), 'kid kit checks run at iPad portrait and landscape'));

  test('screenshots: every kit scope, per viewport, light and dark device setting, and Reduce Motion', async ({ page }, info) => {
    mkdirSync(OUT, { recursive: true });
    const vp = info.project.name;
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await page.waitForTimeout(1200); // ground cross-fade and the tag pop
      for (const s of SCOPES) await page.getByTestId(s.id).screenshot({ path: `${OUT}/${vp}-${scheme}-${s.id}.png`, animations: 'disabled' });
      for (const g of ['night', 'day']) await page.getByTestId(`parent-${g}`).screenshot({ path: `${OUT}/${vp}-${scheme}-parent-${g}.png` });
    }
    await open(page, { reduce: true });
    for (const s of SCOPES.filter((x) => x.v === 'normal')) await page.getByTestId(s.id).screenshot({ path: `${OUT}/${vp}-reduced-motion-${s.id}.png` });
    // The tag mid-pop (first stepped frame), for the record.
    await open(page);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    await page.evaluate(() => document.getAnimations().forEach((a) => (a.currentTime = 50)));
    await page.getByTestId('kit-day-normal-reader').locator('.dk-dock--full').screenshot({ path: `${OUT}/${vp}-tag-pop-frame1-day-normal.png` });
  });

  test('screenshots: the kit in other kid colors (lime, yellow, lilac) at both volumes', async ({ page }, info) => {
    for (const kid of ['lime', 'yellow', 'lilac']) {
      await open(page, { kid });
      for (const id of ['kit-day-normal-reader', 'kit-day-focus-reader', 'kit-night-normal-prereader', 'kit-night-focus-prereader'])
        await page.getByTestId(id).screenshot({ path: `${OUT}/${info.project.name}-kid-${kid}-${id}.png`, animations: 'disabled' });
    }
  });

  test('ink dock: exactly one active item per dock, full and slim variants, slim holds Home and Wave Check only (in the DOM, not just hidden)', async ({ page }) => {
    await open(page);
    for (const s of SCOPES) {
      const kit = page.getByTestId(s.id);
      const full = kit.locator('.dk-dock--full');
      const slim = kit.locator('.dk-dock--slim');
      await expect(full.locator('[aria-current="page"]'), s.id).toHaveCount(1);
      await expect(slim.locator('[aria-current="page"]'), s.id).toHaveCount(1);
      // Slim: only Home and Wave Check exist in the DOM (the others are not rendered at all).
      expect(await slim.locator('[data-dock]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dock'))), s.id).toEqual(['home', 'wave_check']);
      // Wave Check is in both docks (it can never be removed).
      await expect(full.locator('[data-dock="wave_check"]'), s.id).toHaveCount(1);
      // Pre-reader: four items. Reader: up to six.
      const n = await full.locator('[data-dock]').count();
      if (s.a === 'prereader') expect(n, s.id).toBe(4);
      else expect(n, s.id).toBeLessThanOrEqual(6);
      // The dock is the same ink bar in both volumes and grounds.
      const bar = await full.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopColor, getComputedStyle(e).borderTopWidth]);
      expect(bar, s.id).toEqual(['rgb(21, 18, 46)', INK, '5px']);
    }
  });

  test('ink dock: active item filled with the kid color at normal and ringed in focus, whatever the kid color; text on the fill is ink', async ({ page }) => {
    for (const [kid, rgb] of [
      ['lime', LIME],
      ['yellow', YELLOW],
      ['cyan', CYAN],
    ] as const) {
      await open(page, { kid });
      for (const s of SCOPES) {
        const kit = page.getByTestId(s.id);
        for (const dock of ['.dk-dock--full', '.dk-dock--slim']) {
          const a = kit.locator(`${dock} [aria-current="page"]`);
          const st = await a.evaluate((e) => {
            const c = getComputedStyle(e);
            const label = e.querySelector('.dk-dock__label')!;
            const icon = e.querySelector('.dk-dock__icon svg');
            return { bg: c.backgroundColor, border: c.borderTopColor, bw: c.borderTopWidth, label: getComputedStyle(label).color, icon: icon ? getComputedStyle(icon).color : null };
          });
          if (s.v === 'normal') {
            expect(st.bg, `${kid} ${s.id} ${dock}`).toBe(rgb);
            expect(st.border, `${kid} ${s.id} ${dock}`).toBe(INK);
            expect(st.label, `text on the accent is ink: ${kid} ${s.id}`).toBe(INK);
            if (st.icon) expect(st.icon, `icon on the accent is ink: ${kid} ${s.id}`).toBe(INK);
          } else {
            expect(st.bg, `${kid} ${s.id} ${dock}`).toBe('rgba(0, 0, 0, 0)');
            expect(st.border, `${kid} ${s.id} ${dock}`).toBe(rgb);
            expect(st.bw, `${kid} ${s.id}`).toBe('3px');
          }
        }
      }
    }
  });

  test('ink dock markers: tags only, cyan "Check in" tilted right and yellow to-do tilted left, ink text, never red, never a count of anything missed', async ({ page }) => {
    await open(page);
    for (const s of SCOPES) {
      const tags = await page
        .getByTestId(s.id)
        .locator('.dk-dock__tag')
        .evaluateAll((els) =>
          els.map((e) => {
            const c = getComputedStyle(e);
            const m = c.transform.match(/matrix\(([^)]+)\)/);
            const [a, b] = m ? m[1]!.split(',').map(Number) : [1, 0];
            return { kind: e.className, text: e.textContent?.trim() ?? '', bg: c.backgroundColor, color: c.color, deg: Math.round((Math.atan2(b!, a!) * 180) / Math.PI), hidden: e.getAttribute('aria-hidden') };
          }),
        );
      expect(tags.length, s.id).toBeGreaterThan(0);
      for (const t of tags) {
        expect(t.color, `${s.id} ${t.text}`).toBe(INK);
        expect(t.text, s.id).not.toMatch(/missed|late|behind|overdue|left|!/i);
        expect(t.hidden, 'the tag is part of the item label, not read twice').toBe('true');
        const want = t.kind.includes('checkin') ? CYAN : YELLOW;
        expect(t.bg, `${s.id} ${t.text}`).toBe(want);
        if (s.v === 'focus') expect(t.deg, `${s.id} ${t.text} is straight in focus`).toBe(0);
        else expect(t.deg, `${s.id} ${t.text}`).toBe(t.kind.includes('checkin') ? 6 : -6);
      }
    }
    // The accessible name carries the marker, so VoiceOver reads it once.
    await expect(page.getByTestId('kit-day-normal-reader').locator('.dk-dock--full [data-dock="wave_check"]')).toHaveAttribute('aria-label', 'Wave Check — check-in waiting');
  });

  test('tag pop: stepped, 0.36 s, once, normal volume only; never in focus; Reduce Motion shows the tag still and visible', async ({ page }) => {
    await open(page);
    for (const s of SCOPES) {
      const anims = await page
        .getByTestId(s.id)
        .locator('.dk-dock')
        .evaluateAll((docks) =>
          docks.map((d) =>
            d.getAnimations({ subtree: true }).map((a) => {
              const t = (a.effect as KeyframeEffect).getComputedTiming();
              const kf = (a.effect as KeyframeEffect).getKeyframes();
              return { dur: t.duration, iter: t.iterations, easing: (kf[0] as any)?.easing ?? '', css: getComputedStyle((a.effect as KeyframeEffect).target as Element).animationTimingFunction };
            }),
          ),
        );
      for (const perDock of anims) {
        // Never two animating at once in one dock.
        expect(perDock.length, s.id).toBeLessThanOrEqual(1);
        if (s.v === 'focus') expect(perDock.length, `${s.id}: tags show still in focus`).toBe(0);
        for (const a of perDock) {
          expect(a.dur, s.id).toBe(360);
          expect(a.iter, s.id).toBe(1);
          expect(a.css, s.id).toContain('steps(1');
        }
      }
    }
    await open(page, { reduce: true });
    const running = await page.evaluate(() => document.querySelectorAll('.sg-kit').length && [...document.querySelectorAll('.sg-kit')].flatMap((k) => k.getAnimations({ subtree: true })).length);
    expect(running, 'nothing in the kit animates with Reduce Motion').toBe(0);
    for (const s of SCOPES) for (const t of await page.getByTestId(s.id).locator('.dk-dock__tag').all()) await expect(t, `${s.id}: the tag simply appears`).toBeVisible();
  });

  test('volume: normal has marker, offset headline, halftone, tilts, corner and trim; focus has none of them; ink outlines, display font and dock look the same in both', async ({ page }) => {
    await open(page, { kid: 'lime' });
    const constants: Record<string, unknown[]> = {};
    for (const s of SCOPES) {
      const kit = page.getByTestId(s.id);
      const v = await scopeVolume(kit);
      if (s.v === 'focus') {
        expect(v.marker, `${s.id} marker`).toEqual([]);
        expect(v.shadows, `${s.id} offset headline`).toEqual([]);
        expect(v.halftone, `${s.id} halftone`).toEqual([]);
        expect(v.tilts, `${s.id} tilts`).toEqual([]);
        await expect(kit.locator('.dk-corner'), s.id).toBeHidden();
        await expect(kit.locator('.dk-trim'), s.id).toBeHidden();
      } else {
        expect(v.marker.length, `${s.id} marker greeting`).toBeGreaterThan(0);
        expect(v.halftone.length, `${s.id} halftone ground`).toBeGreaterThan(0);
        expect(v.tilts.length, `${s.id} tilted cuts and tags`).toBeGreaterThan(0);
        await expect(kit.locator('.dk-corner'), s.id).toBeVisible();
        await expect(kit.locator('.dk-trim'), s.id).toBeVisible();
        // Cyan right, magenta left, whatever the kid's color (here lime).
        const ts = await kit.locator('.dk-kidhead__title').evaluate((e) => getComputedStyle(e).textShadow);
        expect(ts, s.id).toBe(`${CYAN} 4px 0px 0px, ${MAGENTA} -4px 0px 0px`);
      }
      const c = await kit.evaluate((root) => {
        const q = (sel: string) => root.querySelector(sel)!;
        const cs = (sel: string) => getComputedStyle(q(sel));
        return [
          cs('.dk-kidhead__title').fontFamily.split(',')[0],
          cs('.dk-head-avatar').borderTopWidth + ' ' + cs('.dk-head-avatar').borderTopColor,
          cs('.dk-dock').borderTopWidth,
          cs('.dk-dock__item').height,
          cs('.dk-dock__label').fontSize,
          cs('.dk-cut').filter.includes('rgb(10, 8, 24)'),
        ];
      });
      const key = `${s.g}-${s.a}`;
      if (constants[key]) expect(c, `${s.id}: what never changes between volumes`).toEqual(constants[key]);
      else constants[key] = c;
    }
  });

  test('focus: the kid color appears only as small indicators (avatar ring, active dock ring), never as a fill', async ({ page }) => {
    await open(page, { kid: 'lime' });
    for (const s of SCOPES) {
      const fills = await page.getByTestId(s.id).evaluate((root, lime) => {
        const out: { el: string; area: number }[] = [];
        for (const el of root.querySelectorAll('*')) {
          if (getComputedStyle(el).backgroundColor !== lime) continue;
          const r = el.getBoundingClientRect();
          if (r.width && r.height) out.push({ el: `${el.tagName}.${el.className}`, area: Math.round(r.width * r.height) });
        }
        return out;
      }, LIME);
      if (s.v === 'focus') expect(fills, `${s.id}: no kid-color fills in focus`).toEqual([]);
      else expect(fills.length, `${s.id}: avatar and active dock item fill at normal`).toBeGreaterThanOrEqual(2);
      const av = await page.getByTestId(s.id).locator('.dk-head-avatar').evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).boxShadow]);
      if (s.v === 'focus') {
        expect(av[0], s.id).toBe(PAPER);
        expect(av[1], `${s.id}: kid-color ring, no hard shadow`).toContain(`${LIME} 0px 0px 0px 4px`);
        expect(av[1], s.id).not.toContain(`${INK} 4px 4px`);
      } else {
        expect(av[0], s.id).toBe(LIME);
        expect(av[1], `${s.id}: hard ink shadow`).toContain(`${INK} 4px 4px 0px`);
      }
    }
  });

  test('contrast and color: body text meets AA, no yellow text by day, text on accents is ink, nothing red', async ({ page }) => {
    for (const kid of ['cyan', 'yellow', 'lilac', 'orange']) {
      await open(page, { kid });
      for (const s of SCOPES) {
        const r = await scopeAudit(page.getByTestId(s.id), kidTarget(s.a));
        // The slice-3 placeholders (sun / trim boxes) are styleguide-only scaffolding.
        expect(r.contrast.filter((c) => !c.includes('sg-placeholder')), `${kid} ${s.id} contrast`).toEqual([]);
        expect(r.yellowOnDay, `${kid} ${s.id}`).toEqual([]);
        expect(r.creamOnAccent, `${kid} ${s.id}`).toEqual([]);
        expect(r.red, `${kid} ${s.id}`).toEqual([]);
      }
    }
  });

  test('targets: every control at least 44 px; dock items and the header avatar at least 80 pt (pre-reader) or 64 pt (reader) on both axes', async ({ page }) => {
    await open(page);
    for (const s of SCOPES) {
      const r = await scopeAudit(page.getByTestId(s.id), kidTarget(s.a));
      expect(r.small44, s.id).toEqual([]);
      expect(r.smallKid, `${s.id}: kid minimum ${kidTarget(s.a)}`).toEqual([]);
    }
  });

  test('header: avatar is the My look button, headline and avatar never overlap, the title is one line, greeting is decoration over a readable title', async ({ page }) => {
    await open(page);
    for (const s of SCOPES) {
      const kit = page.getByTestId(s.id);
      await kit.locator('.dk-kidhead').scrollIntoViewIfNeeded();
      const av = kit.getByRole('button', { name: 'My look' });
      await expect(av, s.id).toHaveCount(1);
      const [a, t, g] = await Promise.all([av.boundingBox(), kit.locator('.dk-kidhead__title').boundingBox(), kit.locator('.dk-kidhead__greet').boundingBox()]);
      expect(t!.x + t!.width, `${s.id}: title clear of the avatar`).toBeLessThanOrEqual(a!.x);
      expect(g!.x + g!.width, s.id).toBeLessThanOrEqual(a!.x);
      const lines = await kit.locator('.dk-kidhead__title').evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
      expect(lines, `${s.id}: THE POINT on one line`).toBe(1);
      // Accents sit behind content and never take taps.
      for (const sel of ['.dk-corner', '.dk-trim']) {
        const pe = await kit.locator(sel).evaluate((e) => [getComputedStyle(e).pointerEvents, getComputedStyle(e).zIndex, e.getAttribute('aria-hidden')]);
        expect(pe, `${s.id} ${sel}`).toEqual(['none', '0', 'true']);
      }
      // The avatar is on top of the corner: tapping its center hits the button.
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.dk-head-avatar') != null, [a!.x + a!.width / 2, a!.y + a!.height / 2]);
      expect(hit, s.id).toBe(true);
    }
  });

  test('die-cut: one cut at every class, untilted in focus, thinner at sm; class follows rendered size and volume', async ({ page }) => {
    await open(page);
    for (const s of SCOPES) {
      const cuts = await page
        .getByTestId(s.id)
        .locator('.dk-cut')
        .evaluateAll((els) => els.map((e) => ({ cls: e.getAttribute('data-size'), w: (e as HTMLElement).offsetWidth, rim: getComputedStyle(e).getPropertyValue('--rim').trim(), filter: getComputedStyle(e).filter })));
      for (const c of cuts) {
        const want = c.w < 48 ? 'sm' : c.w >= 80 && s.v === 'normal' ? 'lg' : 'md';
        expect(c.cls, `${s.id} ${c.w}px`).toBe(want);
        expect(c.rim, s.id).toBe(c.cls === 'sm' ? '1.75px' : '2.5px');
        expect(c.filter, `${s.id}: paper rim and ink line`).toContain('rgb(255, 251, 242)');
      }
    }
  });

  test('the .dk-kidscreen frame at full iPad size: sky band, dock flush to the bottom edge, nothing scrolls; and what happens when content is too tall', async ({ page }, info) => {
    await open(page);
    // Mount the kit's own rendered header and dock in a real-size .dk-kidscreen (the styleguide
    // shrinks it to height:auto), copying the scope's theme attributes.
    const measure = (filler: string) =>
      page.evaluate((fillerCss) => {
        document.getElementById('qa-screen')?.remove();
        const src = document.querySelector('[data-testid="kit-day-normal-reader"]')!;
        const host = document.createElement('div');
        host.id = 'qa-screen';
        for (const a of ['data-ground', 'data-volume']) host.setAttribute(a, src.getAttribute(a) ?? '');
        host.style.cssText = 'position:fixed;inset:0;z-index:9999;padding:0';
        const screen = document.createElement('div');
        screen.className = 'dk-kidscreen';
        screen.setAttribute('data-audience', 'kid');
        screen.style.cssText = 'background:var(--ground);background-image:var(--ground-image);background-size:var(--ground-image-size);color:var(--text);--kid:var(--cyan)';
        screen.append(src.querySelector('.dk-kidhead')!.cloneNode(true));
        const fill = document.createElement('div');
        // Content with an intrinsic height, like real cards (a bare fixed-height div would shrink).
        fill.innerHTML = `<div style="${fillerCss}">content</div>`;
        screen.append(fill, src.querySelector('.dk-dock--full')!.cloneNode(true));
        host.append(screen);
        document.body.append(host);
        const d = screen.querySelector('.dk-dock')!.getBoundingClientRect();
        return { vh: innerHeight, dockTop: Math.round(d.top), dockBottom: Math.round(d.bottom), skyBand: getComputedStyle(screen).paddingTop, scrolls: screen.scrollHeight > screen.clientHeight + 1, overflow: getComputedStyle(screen).overflowY };
      }, filler);
    const ok = await measure('height:200px');
    expect(ok.dockBottom, 'dock flush to the bottom edge').toBe(ok.vh);
    expect(ok.skyBand, 'sky band').toBe(info.project.name === 'ipad' ? '70px' : '60px');
    await page.locator('#qa-screen').screenshot({ path: `${OUT}/${info.project.name}-kidscreen-frame.png` });
    // Too-tall content: the frame clips (overflow hidden) instead of scrolling, so the dock is
    // pushed below the fold and the documentElement "no scroll" check still passes.
    const tall = await measure('height:1400px');
    await page.locator('#qa-screen').screenshot({ path: `${OUT}/${info.project.name}-kidscreen-too-tall.png` });
    test.info().annotations.push({ type: 'too-tall', description: JSON.stringify(tall) });
    expect(tall.overflow).toBe('hidden');
    // Finding (non-blocking): too-tall content clips the dock below the fold instead of shrinking.
    if (tall.dockBottom > tall.vh) test.info().annotations.push({ type: 'finding', description: `too-tall content pushes the dock below the fold: dock ${tall.dockTop}-${tall.dockBottom}, viewport ${tall.vh}` });
  });
});

test.describe('slice 15-2: recorded findings (non-blocking)', () => {
  test('dock icon size vs frames (34 px reader, 46 px pre-reader) and a marker tag on the active item', async ({ page }, info) => {
    test.skip(info.project.name !== 'ipad', 'measured once');
    await open(page);
    for (const s of SCOPES.filter((x) => x.g === 'day' && x.v === 'normal')) {
      const px = await page.getByTestId(s.id).locator('.dk-dock--full .dk-dock__icon svg').first().evaluate((e) => Math.round(e.getBoundingClientRect().width));
      const want = s.a === 'prereader' ? 46 : 34;
      if (px !== want) test.info().annotations.push({ type: 'finding', description: `${s.id}: dock icon ${px} px, frame ${want} px` });
      const tagOnActive = await page.getByTestId(s.id).locator('.dk-dock--slim [aria-current="page"] .dk-dock__tag').count();
      if (tagOnActive) test.info().annotations.push({ type: 'finding', description: `${s.id}: the "Check in" tag still shows on the active Wave Check item (slim dock)` });
    }
  });
});

test.describe('slice 15-2: parent look', () => {
  test('Night and Day: text, muted and link meet AA on ground and panel; primary button text; switch-on is visible on the panel', async ({ page }, info) => {
    await open(page);
    for (const g of ['night', 'day']) {
      const res = await page.getByTestId(`parent-${g}`).evaluate((root) => {
        const qa = (window as any).__qa;
        const v = (n: string) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${n})`;
          root.append(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return qa.parse(c);
        };
        const [ground, panel, text, muted, link, sw, btnBg, btnFg] = ['--p-ground', '--p-panel', '--p-text', '--p-muted', '--p-link', '--p-switch-on', '--p-btn-bg', '--p-btn-fg'].map(v);
        const r = (a: any, b: any) => Number(qa.ratio(a, b).toFixed(2));
        return {
          textGround: r(text, ground),
          textPanel: r(text, panel),
          mutedGround: r(muted, ground),
          mutedPanel: r(muted, panel),
          linkGround: r(link, ground),
          linkPanel: r(link, panel),
          button: r(btnFg, btnBg),
          switchOnPanel: r(sw, panel),
        };
      });
      test.info().annotations.push({ type: `parent-${g}`, description: JSON.stringify(res) });
      for (const k of ['textGround', 'textPanel', 'mutedGround', 'mutedPanel', 'linkGround', 'linkPanel', 'button'] as const) expect(res[k], `${g} ${k}`).toBeGreaterThanOrEqual(4.5);
      expect(res.switchOnPanel, `${g}: switch-on fill vs panel (non-text, 3:1)`).toBeGreaterThanOrEqual(3);
      await page.getByTestId(`parent-${g}`).screenshot({ path: `${OUT}/${info.project.name}-parent-${g}.png` });
    }
  });
});

test.describe('slice 15-2: kit vs frames (side by side)', () => {
  test.beforeEach(({}, info) => test.skip(!isIpad(info.project.name), 'frames are iPad'));

  type Shot = { png: Buffer; w: number; parts: Record<string, { y: number; h: number }> };

  /** A full screenshot of `root` plus the offsets (CSS px) of each named part inside it. */
  async function shotWithParts(root: Locator, sel: Record<string, string>): Promise<Shot> {
    const parts = await root.evaluate((r, s) => {
      const top = r.getBoundingClientRect().top;
      const out: Record<string, { y: number; h: number }> = {};
      for (const [k, q] of Object.entries(s)) {
        const e = r.querySelector(q);
        if (!e) continue;
        const b = e.getBoundingClientRect();
        out[k] = { y: Math.max(0, b.top - top), h: b.height };
      }
      return out;
    }, sel);
    const w = (await root.boundingBox())!.width;
    return { png: await root.screenshot({ animations: 'disabled' }), w, parts };
  }
  const crop = (s: Shot, from: { y: number; h: number }, label: string, pad = 20) => ({ label, png: s.png, w: s.w, y: Math.max(0, from.y - pad), h: from.h + pad });
  const top = (s: Shot, until: { y: number; h: number }, label: string) => ({ label, png: s.png, w: s.w, y: 0, h: until.y + until.h + 16 });

  async function cropComposite(page: Page, out: string, parts: { label: string; png: Buffer; w: number; y: number; h: number }[]) {
    const html = parts
      .map(
        (p) =>
          `<figure style="margin:0"><figcaption style="padding:0 0 6px;max-width:${p.w}px">${p.label}</figcaption><div style="width:${p.w}px;height:${p.h}px;overflow:hidden"><img style="display:block;width:${p.w}px;margin-top:-${p.y}px" src="data:image/png;base64,${p.png.toString('base64')}"></div></figure>`,
      )
      .join('');
    const p2 = await page.context().newPage();
    await p2.setViewportSize({ width: 2800, height: 1400 });
    await p2.setContent(`<!doctype html><html><body style="margin:0;background:#888;font:600 16px system-ui"><div id="c" style="display:flex;flex-direction:column;gap:16px;padding:16px;width:max-content">${html}</div></body></html>`);
    await p2.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    mkdirSync(OUT, { recursive: true });
    await p2.locator('#c').screenshot({ path: out });
    await p2.close();
  }

  async function kitShot(page: Page, id: string, width: number) {
    // Lay the kit scope out at the frame's width so the dock spans the same 820/1180 px.
    await open(page);
    await page.setViewportSize({ width: width + 200, height: 1400 });
    await page.addStyleTag({ content: `.sg-matrix--kit{grid-template-columns:${width}px !important}.sg-kit.dk-kidscreen{--gutter:40px}` });
    await page.waitForTimeout(400);
    const kit = page.getByTestId(id).locator('.sg-kit');
    await kit.scrollIntoViewIfNeeded();
    return shotWithParts(kit, { head: '.dk-kidhead', dock: '.dk-dock--full', slim: '.dk-dock--slim' });
  }

  test('header and dock: kit vs Phase15PointB2 (normal), Phase15PointB2Focus (focus), Phase15PointB2Pre and PreFocus (pre-reader landscape), Phase15RoutineDay and WaveCheckDay (slim)', async ({ page, browser }, info) => {
    test.skip(info.project.name !== 'ipad', 'one composite set, built from both frame orientations');
    const fp = await browser.newPage();
    const F: Record<string, Shot> = {};
    mkdirSync(`${OUT}/frames`, { recursive: true });
    for (const name of ['Phase15PointB2', 'Phase15PointB2Focus', 'Phase15PointB2Pre', 'Phase15PointB2PreFocus', 'Phase15RoutineDay', 'Phase15WaveCheckDay']) {
      const f = await loadFrame(fp, `${name}.dc.html`);
      F[name] = await shotWithParts(f, { head: 'h1', dock: 'nav[aria-label="The Deck"]' });
      await f.screenshot({ path: `${OUT}/frames/${name}.png` });
    }
    await fp.close();
    // h1's own box is the bottom of the header row closely enough; extend to the avatar.
    const kN = await kitShot(page, 'kit-day-normal-reader', 820);
    await cropComposite(page, `${OUT}/compare-normal-vs-PointB2.png`, [
      top(F.Phase15PointB2!, F.Phase15PointB2!.parts.head!, 'FRAME Phase15PointB2 header (day, normal, Kid A cyan; fox sticker is a canvas sprite, not rendered)'),
      top(kN, kN.parts.head!, 'APP kit-day-normal-reader header (sun and trim are slice-3 placeholders)'),
      crop(F.Phase15PointB2!, F.Phase15PointB2!.parts.dock!, 'FRAME Phase15PointB2 dock (6 items; Tune Shop icon is a sprite)'),
      crop(kN, kN.parts.dock!, 'APP full dock (4 items in the kit)'),
    ]);
    await cropComposite(page, `${OUT}/compare-slim-vs-RoutineDay-WaveCheckDay.png`, [
      crop(F.Phase15RoutineDay!, F.Phase15RoutineDay!.parts.dock!, 'FRAME Phase15RoutineDay slim dock (no item active)'),
      crop(F.Phase15WaveCheckDay!, F.Phase15WaveCheckDay!.parts.dock!, 'FRAME Phase15WaveCheckDay slim dock (Wave Check active)'),
      crop(kN, kN.parts.slim!, 'APP slim dock (Wave Check active)'),
      top(F.Phase15RoutineDay!, F.Phase15RoutineDay!.parts.head!, 'FRAME Phase15RoutineDay header (34 px sky band, sun at top -170)'),
    ]);
    const kF = await kitShot(page, 'kit-day-focus-reader', 820);
    await cropComposite(page, `${OUT}/compare-focus-vs-PointB2Focus.png`, [
      top(F.Phase15PointB2Focus!, F.Phase15PointB2Focus!.parts.head!, 'FRAME Phase15PointB2Focus header'),
      top(kF, kF.parts.head!, 'APP kit-day-focus-reader header'),
      crop(F.Phase15PointB2Focus!, F.Phase15PointB2Focus!.parts.dock!, 'FRAME Phase15PointB2Focus dock'),
      crop(kF, kF.parts.dock!, 'APP focus full dock'),
    ]);
    const kP = await kitShot(page, 'kit-day-normal-prereader', 1180);
    await cropComposite(page, `${OUT}/compare-prereader-vs-PointB2Pre.png`, [
      top(F.Phase15PointB2Pre!, F.Phase15PointB2Pre!.parts.head!, 'FRAME Phase15PointB2Pre header (landscape, Kid B magenta)'),
      top(kP, kP.parts.head!, 'APP kit-day-normal-prereader header at 1180 (kit uses Kid A cyan)'),
      crop(F.Phase15PointB2Pre!, F.Phase15PointB2Pre!.parts.dock!, 'FRAME Phase15PointB2Pre dock'),
      crop(kP, kP.parts.dock!, 'APP pre-reader full dock'),
    ]);
    const kPF = await kitShot(page, 'kit-day-focus-prereader', 1180);
    await cropComposite(page, `${OUT}/compare-prereader-focus-vs-PointB2PreFocus.png`, [
      top(F.Phase15PointB2PreFocus!, F.Phase15PointB2PreFocus!.parts.head!, 'FRAME Phase15PointB2PreFocus header'),
      top(kPF, kPF.parts.head!, 'APP kit-day-focus-prereader header'),
      crop(F.Phase15PointB2PreFocus!, F.Phase15PointB2PreFocus!.parts.dock!, 'FRAME Phase15PointB2PreFocus dock'),
      crop(kPF, kPF.parts.dock!, 'APP pre-reader focus dock'),
    ]);
  });


  test('measured against the frames: header, avatar, dock, item and tag geometry', async ({ page, browser }, info) => {
    test.skip(info.project.name !== 'ipad', 'measured once');
    const fp = await browser.newPage();
    const geo = async (root: Locator) =>
      root.evaluate((r) => {
        const cs = (e: Element | null) => (e ? getComputedStyle(e) : null);
        const nav = r.querySelector('nav[aria-label="The Deck"]')!;
        const items = [...nav.querySelectorAll(':scope > a, :scope > button')];
        const active = items.find((i) => i.getAttribute('aria-current') === 'page')!;
        const inactive = items.find((i) => i.getAttribute('aria-current') !== 'page')!;
        const h1 = r.querySelector('h1')!;
        const avatar = r.querySelector('[aria-label="My look"]')!;
        const greet = h1.previousElementSibling!;
        const tag = nav.querySelector('span[style*="29D3FF"], .dk-dock__tag--checkin');
        return {
          h1Size: cs(h1)!.fontSize,
          h1Shadow: cs(h1)!.textShadow,
          greetSize: cs(greet)!.fontSize,
          greetColor: cs(greet)!.color,
          avatar: `${Math.round(avatar.getBoundingClientRect().width)} ${cs(avatar)!.borderTopWidth}`,
          navPad: cs(nav)!.padding,
          itemH: Math.round(items[0]!.getBoundingClientRect().height),
          itemRadius: cs(items[0]!)!.borderTopLeftRadius,
          activeBorder: `${cs(active)!.borderTopWidth} ${cs(active)!.borderTopColor}`,
          inactiveColor: cs(inactive)!.color,
          labelSize: cs(active.querySelector('span:last-child'))!.fontSize,
          tag: tag ? `${cs(tag)!.fontSize} ${cs(tag)!.borderTopWidth} ${cs(tag)!.borderTopLeftRadius} ${cs(tag)!.top}` : null,
        };
      });
    const out: Record<string, unknown> = {};
    out.frameNormal = await geo(await loadFrame(fp, 'Phase15PointB2.dc.html'));
    out.frameFocus = await geo(await loadFrame(fp, 'Phase15PointB2Focus.dc.html'));
    out.framePre = await geo(await loadFrame(fp, 'Phase15PointB2Pre.dc.html'));
    await fp.close();
    await open(page);
    // The kit holds two docks (full, then slim); geo() measures the first, the full one.
    const kitGeo = (id: string) => geo(page.getByTestId(id).locator('.sg-kit'));
    out.appNormal = await kitGeo('kit-day-normal-reader');
    out.appFocus = await kitGeo('kit-day-focus-reader');
    out.appPre = await kitGeo('kit-day-normal-prereader');
    test.info().annotations.push({ type: 'geometry', description: JSON.stringify(out, null, 1) });
    console.log(JSON.stringify(out, null, 1));
    const fn = out.frameNormal as any;
    const an = out.appNormal as any;
    const apre = out.appPre as any;
    // The frame's normal-volume active item is content-box (88 + 2 x 3 px border = 94); focus is
    // border-box (88). The app is 88 / 96 in both, which is the intended size.
    expect(an.itemH).toBe(88);
    expect(apre.itemH).toBe(96);
    for (const k of ['h1Size', 'h1Shadow', 'greetSize', 'greetColor', 'avatar', 'itemRadius', 'activeBorder', 'labelSize', 'tag']) expect.soft(an[k], `normal ${k}`).toBe(fn[k]);
    const ff = out.frameFocus as any;
    const af = out.appFocus as any;
    for (const k of ['h1Size', 'h1Shadow', 'greetSize', 'greetColor', 'itemH', 'activeBorder', 'labelSize']) expect.soft(af[k], `focus ${k}`).toBe(ff[k]);
    const fpre = out.framePre as any;
    for (const k of ['navPad', 'labelSize', 'greetColor', 'h1Size']) expect.soft(apre[k], `pre-reader ${k}`).toBe(fpre[k]);
    // Deliberate: the pre-reader avatar is 82 px (brief: 80 pt) where the frame draws 78.
    expect(apre.avatar).toBe('82 4px');
    if (an.inactiveColor !== fn.inactiveColor) test.info().annotations.push({ type: 'finding', description: `inactive dock label ${an.inactiveColor} (cream); frames use ${fn.inactiveColor} (paper)` });
  });
});

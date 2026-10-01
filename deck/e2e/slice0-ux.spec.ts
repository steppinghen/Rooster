import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * Slice 0 UX and design-rule checks (independent QA).
 * Scope: the /styleguide route only (no feature screens or data yet).
 * Covers: volume rules, grounds, contrast, reduced motion, tap targets, overflow, self-hosting.
 */

const SHOTS = 'review/screenshots/slice-0';
const COMBOS = [
  { ground: 'night', volume: 'normal' },
  { ground: 'night', volume: 'focus' },
  { ground: 'day', volume: 'normal' },
  { ground: 'day', volume: 'focus' },
] as const;
const SCOPES = [...COMBOS.map((c) => `set-${c.ground}-${c.volume}`), 'set-lastrun'];

const YELLOW = 'rgb(255, 210, 63)';

async function open(page: Page, path = '/styleguide') {
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

async function setRoot(page: Page, ground: string, volume: string) {
  await page.getByRole('group', { name: 'Ground' }).getByRole('button', { name: ground, exact: true }).click();
  await page.getByRole('group', { name: 'Volume' }).getByRole('button', { name: volume, exact: true }).click();
  await page.waitForTimeout(1150); // ground cross-fade
}

/** Installs color/contrast helpers on window so page.evaluate callbacks can share them. */
async function installHelpers(page: Page) {
  await page.addInitScript(() => {
    type RGBA = [number, number, number, number];
    const parse = (c: string): RGBA | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const lum = ([r, g, b]: RGBA) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    const blend = (top: RGBA, under: RGBA): RGBA => {
      const a = top[3];
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    /** Background actually behind el: composite translucent layers down to the first opaque one. */
    const effectiveBg = (el: Element): RGBA => {
      const layers: RGBA[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c[3] > 0) {
          layers.push(c);
          if (c[3] >= 1) break;
        }
      }
      let out: RGBA = [255, 255, 255, 1];
      for (const l of layers.reverse()) out = blend(l, out);
      return out;
    };
    const ownText = (el: Element) =>
      [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const opacityChain = (el: Element) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    };
    const rotated = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.rotate && s.rotate !== 'none' && s.rotate !== '0deg') return true;
      const m = s.transform.match(/matrix\(([^)]+)\)/);
      if (!m) return false;
      const [, b] = m[1].split(',').map(Number);
      return Math.abs(b) > 0.001;
    };
    Object.assign(window, { __qa: { parse, ratio, effectiveBg, ownText, visible, opacityChain, rotated } });
  });
}

test.beforeEach(async ({ page }) => {
  await installHelpers(page);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type QA = any;

/** Everything a focus-volume rule cares about, gathered for one scope. */
async function volumeAudit(scope: Locator) {
  return scope.evaluate((root) => {
    const qa = (window as unknown as { __qa: QA }).__qa;
    const all = [root, ...root.querySelectorAll('*')];
    const textShadows: string[] = [];
    const halftone: string[] = [];
    const tilts: string[] = [];
    const marker: string[] = [];
    const accentFills: { cls: string; w: number; h: number }[] = [];
    for (const el of all) {
      const s = getComputedStyle(el);
      const name = `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').trim().replace(/\s+/g, '.')}`;
      const text = qa.ownText(el);
      if (text && s.textShadow !== 'none') textShadows.push(`${name} "${text}" ${s.textShadow}`);
      if (s.backgroundImage.includes('radial-gradient') && qa.opacityChain(el) > 0) halftone.push(name);
      if (qa.rotated(el) && qa.visible(el)) tilts.push(name);
      if (text && s.fontFamily.includes('Permanent Marker')) marker.push(`${name} "${text}"`);
      if (s.backgroundColor === 'rgb(255, 62, 138)' && qa.visible(el)) {
        const r = el.getBoundingClientRect();
        accentFills.push({ cls: name, w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    const patterns = root.querySelectorAll('pattern').length;
    const scopeRect = root.getBoundingClientRect();
    const accentArea = accentFills.reduce((a, f) => a + f.w * f.h, 0) / (scopeRect.width * scopeRect.height);
    return { textShadows, halftone, tilts, marker, accentFills, patterns, accentArea };
  });
}

test.describe('slice 0: volume rules', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  for (const ground of ['night', 'day'] as const) {
    test(`focus (${ground}) has no halftone, tilts, offset headlines or marker lettering`, async ({ page }) => {
      const a = await volumeAudit(page.getByTestId(`set-${ground}-focus`));
      expect(a.textShadows, 'offset headlines / text shadows in focus').toEqual([]);
      expect(a.halftone, 'visible halftone in focus').toEqual([]);
      expect(a.patterns, 'SVG halftone patterns in focus').toBe(0);
      expect(a.tilts, 'tilted elements in focus').toEqual([]);
      expect(a.marker, 'marker lettering in focus').toEqual([]);
    });

    test(`focus (${ground}) shows the accent only as a small indicator`, async ({ page }, info) => {
      const a = await volumeAudit(page.getByTestId(`set-${ground}-focus`));
      info.annotations.push({ type: 'accent fills', description: JSON.stringify(a.accentFills) });
      info.annotations.push({ type: 'accent area share', description: `${(a.accentArea * 100).toFixed(2)}%` });
      // The focus mockups (iPadGromZoneFocus, iPadDawnPatrolDayFocus) use ~30 px progress dots and a ring.
      const big = a.accentFills.filter((f) => Math.max(f.w, f.h) > 40);
      expect(big, 'accent-filled elements larger than a 40 px indicator in focus').toEqual([]);
    });

    test(`normal (${ground}) has the full comic treatment`, async ({ page }) => {
      const a = await volumeAudit(page.getByTestId(`set-${ground}-normal`));
      expect(a.textShadows.some((t) => t.includes('dk-headline')), 'offset headline').toBe(true);
      expect(a.halftone.length, 'halftone ground').toBeGreaterThan(0);
      expect(a.tilts.length, 'tilted cards/stickers').toBeGreaterThan(0);
      expect(a.marker.length, 'marker lettering').toBeGreaterThan(0);
      expect(a.accentFills.some((f) => f.w > 200), 'bold accent block').toBe(true);
      if (ground === 'day') {
        const sun = await page.getByTestId('set-day-normal').locator('.dk-sun').evaluate((el) => getComputedStyle(el).opacity);
        expect(sun, 'day sun visible in day normal').toBe('1');
      }
    });

    test(`ink outlines, display font and pressable buttons are identical across volumes (${ground})`, async ({ page }) => {
      const pick = (id: string, sel: string) =>
        page.getByTestId(id).locator(sel).evaluateAll((els) =>
          els.map((el) => {
            const s = getComputedStyle(el);
            return {
              font: s.fontFamily,
              bw: s.borderTopWidth,
              bc: s.borderTopColor,
              br: s.borderTopLeftRadius,
              shadow: s.boxShadow,
              minH: s.minHeight,
            };
          }),
        );
      for (const sel of ['.dk-btn', '.dk-tile', '.dk-panel', '.dk-card', '.dk-accent-block']) {
        const n = await pick(`set-${ground}-normal`, sel);
        const f = await pick(`set-${ground}-focus`, sel);
        expect(f, `${sel} outline/shadow/font differ between normal and focus`).toEqual(n);
        // The ink "I did it!" button gets a lilac edge on the night ground (3:1 non-text
        // contrast, slice 7); every other outline is ink.
        for (const x of n) expect(x.bc, `${sel} outline is ink`).toMatch(ground === 'night' && sel === '.dk-btn' ? /^rgb\((10, 8, 24|122, 114, 152)\)$/ : /^rgb\(10, 8, 24\)$/);
      }
      const headFont = async (id: string) => page.getByTestId(id).locator('.dk-headline').evaluate((el) => getComputedStyle(el).fontFamily);
      expect(await headFont(`set-${ground}-focus`)).toBe(await headFont(`set-${ground}-normal`));
      expect(await headFont(`set-${ground}-focus`)).toContain('Archivo Black');

      // The press itself behaves the same.
      for (const v of ['normal', 'focus']) {
        const btn = page.getByTestId(`set-${ground}-${v}`).locator('.dk-btn--ink');
        await btn.evaluate((el) => el.setAttribute('data-pressed', 'true'));
        await page.waitForTimeout(250); // 80 ms stepped press transition
        expect(await btn.evaluate((el) => getComputedStyle(el).transform), `pressed transform (${v})`).toBe('matrix(1, 0, 0, 1, 0, 6)');
      }
    });
  }

  test('celebration scope is normal volume with the burst', async ({ page }) => {
    const scope = page.locator('section', { has: page.locator('#sg-celebrate') }).locator('[data-volume]');
    await expect(scope).toHaveAttribute('data-volume', 'normal');
    await expect(scope.locator('.dk-burst')).toBeVisible();
  });
});

test.describe('slice 0: grounds', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('day ground never uses yellow text, anywhere on the page', async ({ page }) => {
    for (const volume of ['normal', 'focus']) {
      await setRoot(page, 'day', volume);
      const yellow = await page.evaluate((Y) => {
        const qa = (window as unknown as { __qa: QA }).__qa;
        return [...document.querySelectorAll('*')]
          .filter((el) => el.closest('[data-ground]')?.getAttribute('data-ground') === 'day' && qa.ownText(el) && qa.visible(el))
          .filter((el) => getComputedStyle(el).color === Y)
          .map((el) => `${el.className}: ${qa.ownText(el)}`);
      }, YELLOW);
      expect(yellow, `yellow text on day (${volume})`).toEqual([]);
    }
  });

  test('day ground uses the day marker color for marker lettering', async ({ page }) => {
    const c = await page.getByTestId('set-day-normal').locator('.dk-marker').first().evaluate((el) => getComputedStyle(el).color);
    expect(c).toBe('rgb(179, 18, 79)');
  });

  test('Last Run stays night even when day is requested, and its components use night tokens', async ({ page }) => {
    const s = page.getByTestId('set-lastrun');
    await expect(s).toHaveAttribute('data-ground', 'night');
    await expect(s).toHaveAttribute('data-volume', 'focus');
    expect(await s.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(20, 18, 40)');
    expect(await s.locator('.dk-panel').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(34, 30, 69)');
    expect(await s.locator('.dk-headline').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(244, 235, 217)');
    const a = await volumeAudit(s);
    expect(a.halftone, 'Last Run is flat').toEqual([]);
    expect(a.textShadows).toEqual([]);
  });

  test('defense in depth: CSS alone keeps data-scene="lastrun" night (annotation only)', async ({ page }, info) => {
    // ThemeScope resolves lastrun -> night in JS. If anything ever writes data-scene="lastrun"
    // with data-ground="day" directly, does the CSS still paint night?
    const bg = await page.evaluate(() => {
      const d = document.createElement('div');
      d.dataset.ground = 'day';
      d.dataset.volume = 'focus';
      d.dataset.scene = 'lastrun';
      document.body.appendChild(d);
      const c = getComputedStyle(d).backgroundColor;
      d.remove();
      return c;
    });
    info.annotations.push({ type: 'lastrun-css-only background', description: bg });
    expect(bg).toBeTruthy();
  });

  test('every scope paints its own ground', async ({ page }) => {
    const expected: Record<string, string> = {
      'set-night-normal': 'rgb(21, 18, 46)',
      'set-night-focus': 'rgb(28, 26, 51)',
      'set-day-normal': 'rgb(242, 230, 204)',
      'set-day-focus': 'rgb(237, 228, 209)',
      'set-lastrun': 'rgb(20, 18, 40)',
    };
    for (const [id, bg] of Object.entries(expected)) {
      expect(await page.getByTestId(id).evaluate((el) => getComputedStyle(el).backgroundColor), id).toBe(bg);
    }
  });
});

test.describe('slice 0: contrast', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('all visible text meets WCAG AA against its actual background, in every scope and root theme', async ({ page }, info) => {
    const failures: string[] = [];
    const audit = async (label: string, selector: string) => {
      const f = await page.evaluate(
        ({ selector }) => {
          const qa = (window as unknown as { __qa: QA }).__qa;
          const out: string[] = [];
          for (const root of document.querySelectorAll(selector)) {
            for (const el of [root, ...root.querySelectorAll('*')]) {
              const text = qa.ownText(el);
              if (!text || !qa.visible(el) || el.closest('.dk-burst, .sg-swatch')) continue;
              const s = getComputedStyle(el);
              const fg = qa.parse(s.color);
              const bg = qa.effectiveBg(el);
              const r = qa.ratio(fg, bg);
              const size = parseFloat(s.fontSize);
              const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
              const need = large ? 3 : 4.5;
              if (r < need) out.push(`"${text.slice(0, 30)}" ${s.color} on rgb(${bg.slice(0, 3).map(Math.round).join(', ')}) = ${r.toFixed(2)} (need ${need})`);
            }
          }
          return out;
        },
        { selector },
      );
      failures.push(...f.map((x) => `[${label}] ${x}`));
    };
    for (const id of SCOPES) await audit(id, `[data-testid="${id}"]`);
    for (const c of COMBOS) {
      await setRoot(page, c.ground, c.volume);
      await audit(`root ${c.ground}-${c.volume}`, 'main.sg');
    }
    info.annotations.push({ type: 'contrast failures', description: failures.join('\n') || 'none' });
    expect(failures).toEqual([]);
  });

  test('text on accent and yellow fills is ink, never cream', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const qa = (window as unknown as { __qa: QA }).__qa;
      const accents = ['rgb(255, 62, 138)', 'rgb(41, 211, 255)', 'rgb(255, 210, 63)', 'rgb(155, 229, 100)', 'rgb(169, 155, 255)', 'rgb(255, 138, 61)'];
      const out: string[] = [];
      for (const el of document.querySelectorAll('main.sg *')) {
        if (!qa.ownText(el) || !qa.visible(el)) continue;
        const bg = qa.effectiveBg(el);
        const bgs = `rgb(${bg.slice(0, 3).map(Math.round).join(', ')})`;
        if (!accents.includes(bgs)) continue;
        const c = getComputedStyle(el).color;
        if (c !== 'rgb(10, 8, 24)') out.push(`"${qa.ownText(el)}" ${c} on ${bgs}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('token contrast table: muted and marker text on ground, surface and card', async ({ page }, info) => {
    const rows = await page.evaluate((scopes) => {
      const qa = (window as unknown as { __qa: QA }).__qa;
      const out: { scope: string; pair: string; ratio: number }[] = [];
      for (const id of scopes) {
        const root = document.querySelector(`[data-testid="${id}"]`)!;
        const probe = document.createElement('span');
        root.appendChild(probe);
        const tok = (v: string) => {
          probe.style.color = `var(${v})`;
          return qa.parse(getComputedStyle(probe).color);
        };
        const pairs: [string, string][] = [
          ['--text', '--ground'],
          ['--text', '--surface'],
          ['--text-muted', '--ground'],
          ['--text-muted', '--surface'],
          ['--text-muted-on-card', '--card'],
          ['--text-on-card', '--card'],
          ['--marker', '--ground'],
          ['--marker', '--surface'],
          ['--marker-color', '--ground'],
          ['--marker-color', '--surface'],
          ['--paper', '--night-text'], // ink button label
        ];
        for (const [fg, bg] of pairs) out.push({ scope: id, pair: `${fg} on ${bg}`, ratio: Math.round(qa.ratio(tok(fg), tok(bg)) * 100) / 100 });
        probe.remove();
      }
      return out;
    }, SCOPES);
    info.annotations.push({ type: 'token contrast', description: rows.map((r) => `${r.scope} ${r.pair}: ${r.ratio}`).join('\n') });
    const fails = rows.filter((r) => r.ratio < 4.5);
    expect(fails).toEqual([]);
  });

  test('non-text contrast: the ink "I did it!" button is distinguishable from its ground (annotation)', async ({ page }, info) => {
    const rows = await page.evaluate((scopes) => {
      const qa = (window as unknown as { __qa: QA }).__qa;
      return scopes.map((id: string) => {
        const root = document.querySelector(`[data-testid="${id}"]`)!;
        const btn = root.querySelector('.dk-btn--ink')!;
        const fill = qa.parse(getComputedStyle(btn).backgroundColor);
        const ground = qa.parse(getComputedStyle(root).backgroundColor);
        return `${id}: button fill vs ground ${qa.ratio(fill, ground).toFixed(2)}:1`;
      });
    }, SCOPES);
    info.annotations.push({ type: 'ink button vs ground (WCAG 1.4.11 wants 3:1)', description: rows.join('\n') });
    expect(rows.length).toBe(SCOPES.length);
  });
});

test.describe('slice 0: reduced motion', () => {
  test('burst, button and tile transitions and the ground cross-fade are off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const m = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!;
      const cs = (s: string) => getComputedStyle(q(s));
      return {
        burstSvg: cs('.dk-burst svg').animationName,
        burstWord: cs('.dk-burst__word').animationName,
        btn: cs('.dk-btn').transitionDuration,
        tile: cs('.dk-tile').transitionDuration,
        ground: getComputedStyle(document.documentElement).transitionDuration,
      };
    });
    expect(m.burstSvg).toBe('none');
    expect(m.burstWord).toBe('none');
    for (const k of ['btn', 'tile', 'ground'] as const) expect(m[k].split(',').every((d) => parseFloat(d) === 0), `${k} transition ${m[k]}`).toBe(true);
    // Feedback still happens instantly: the pressed tile keeps its ring.
    const ring = await page.getByTestId('set-night-normal').locator('.dk-tile[data-pressed="true"]').evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).toContain('rgb(255, 210, 63)');
  });

  test('without reduced motion the transitions and burst are on (sanity)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);
    const m = await page.evaluate(() => ({
      burst: getComputedStyle(document.querySelector('.dk-burst svg')!).animationName,
      btn: getComputedStyle(document.querySelector('.dk-btn')!).transitionDuration,
    }));
    expect(m.burst).toBe('dk-wobble');
    expect(parseFloat(m.btn)).toBeGreaterThan(0);
  });

  test('reduced-motion screenshots of the celebration', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.locator('section', { has: page.locator('#sg-celebrate') }).screenshot({ path: `${SHOTS}/${info.project.name}-celebrate-reduced-motion.png` });
  });
});

test.describe('slice 0: tap targets', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  const measure = (page: Page, sel: string) =>
    page.locator(sel).evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { what: `${el.className} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 20)}"`, w: Math.round(r.width), h: Math.round(r.height) };
        }),
    );

  test('PressButton and Tile are at least 64 px for the reader', async ({ page }) => {
    const all = await measure(page, '[data-age="reader"] .dk-btn, [data-age="reader"] .dk-tile');
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((x) => x.w < 64 || x.h < 64)).toEqual([]);
  });

  test('PressButton and Tile are at least 80 px for the pre-reader', async ({ page }, info) => {
    await page.evaluate(() => document.querySelectorAll('[data-age="reader"]').forEach((el) => el.setAttribute('data-age', 'prereader')));
    const all = await measure(page, '[data-age="prereader"] .dk-btn, [data-age="prereader"] .dk-tile');
    expect(all.filter((x) => x.w < 80 || x.h < 80)).toEqual([]);
    await page.getByTestId('set-night-normal').screenshot({ path: `${SHOTS}/${info.project.name}-prereader-sizing-night-normal.png` });
  });

  test('avatar chips inside kid screens meet the kid minimum (64 reader / 80 pre-reader)', async ({ page }) => {
    const reader = await measure(page, '[data-age="reader"] .dk-avatar');
    const readerBad = reader.filter((x) => x.w < 64 || x.h < 64);
    await page.evaluate(() => document.querySelectorAll('[data-age="reader"]').forEach((el) => el.setAttribute('data-age', 'prereader')));
    const pre = await measure(page, '[data-age="prereader"] .dk-avatar');
    const preBad = pre.filter((x) => x.w < 80 || x.h < 80);
    expect({ readerBad, preBad }).toEqual({ readerBad: [], preBad: [] });
  });

  test('parent controls (toggles, nav items, avatars) are at least 48 px', async ({ page }) => {
    const all = await measure(page, '.sg-toggle .dk-btn, .dk-nav__item, .dk-avatar');
    expect(all.filter((x) => x.w < 48 || x.h < 48)).toEqual([]);
  });
});

test.describe('slice 0: layout and overflow', () => {
  test('no horizontal page overflow, in every root theme', async ({ page }, info) => {
    await open(page);
    for (const c of COMBOS) {
      await setRoot(page, c.ground, c.volume);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(o.sw, `${info.project.name} ${c.ground}-${c.volume}`).toBeLessThanOrEqual(o.cw);
    }
  });

  test('nothing is clipped by its scope, and text never spills out of its box', async ({ page }) => {
    await open(page);
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const clipRoots = [...document.querySelectorAll('.sg-scope, .sg-rail, .sg-tabs')];
      for (const root of clipRoots) {
        const rr = root.getBoundingClientRect();
        for (const el of root.querySelectorAll('*')) {
          if (el.closest('.dk-sun') || el.closest('svg')) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          // tolerate 2px for rotation antialiasing
          if (r.right > rr.right + 2 || r.left < rr.left - 2) out.push(`clipped by scope: ${el.className || el.tagName} (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(rr.left)}..${Math.round(rr.right)})`);
        }
      }
      // Content wider than its own box (e.g. an unbreakable word, a sticker wider than its cell).
      // The day sun overhangs on purpose (clipped by the scope), so it is hidden while measuring.
      // Small tilts legitimately add 2-3 px of overflow, so rows of tilted children get 3 px slack.
      const qa = (window as unknown as { __qa: QA }).__qa;
      const suns = [...document.querySelectorAll<HTMLElement>('.dk-sun')];
      suns.forEach((x) => (x.style.display = 'none'));
      for (const el of document.querySelectorAll('main.sg *')) {
        const he = el as HTMLElement;
        const s = getComputedStyle(he);
        if (s.display === 'inline' || !he.clientWidth) continue;
        const slack = [...he.children].some((c) => qa.rotated(c)) ? 3 : 1;
        if (he.scrollWidth > he.clientWidth + slack && s.overflowX === 'visible' && !he.closest('svg')) {
          out.push(`content wider than box: ${he.className || he.tagName} "${he.textContent?.trim().slice(0, 24)}" ${he.scrollWidth}>${he.clientWidth}`);
        }
      }
      suns.forEach((x) => (x.style.display = ''));
      return [...new Set(out)];
    });
    expect(problems).toEqual([]);
  });

  test('up-next block: title, icon and speaker do not overlap', async ({ page }) => {
    await open(page);
    for (const id of SCOPES) {
      const boxes = await page.getByTestId(id).locator('.sg-upnext').evaluate((b) => {
        const rect = (s: string) => b.querySelector(s)!.getBoundingClientRect();
        const title = b.querySelector('.sg-upnext__title')!;
        const range = document.createRange();
        range.selectNodeContents(title);
        const t = range.getBoundingClientRect();
        return { icon: rect('.sg-upnext__icon'), text: t, speaker: rect('.dk-btn') };
      });
      expect(boxes.text.left, `${id} title vs icon`).toBeGreaterThanOrEqual(boxes.icon.right);
      expect(boxes.text.right, `${id} title vs speaker`).toBeLessThanOrEqual(boxes.speaker.left);
    }
  });

  test('headline row: headline and avatar do not overlap', async ({ page }) => {
    await open(page);
    for (const id of SCOPES) {
      const o = await page.getByTestId(id).locator('.sg-row--between').evaluate((row) => {
        const h = row.querySelector('.dk-headline')!;
        const range = document.createRange();
        range.selectNodeContents(h);
        return { h: range.getBoundingClientRect().right, a: row.querySelector('.dk-avatar')!.getBoundingClientRect().left };
      });
      expect(o.h, id).toBeLessThanOrEqual(o.a);
    }
  });
});

test.describe('slice 0: self-hosted only', () => {
  test('no request leaves 127.0.0.1 on any route or theme, and no stylesheet points off-origin', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol === 'data:' || u.protocol === 'blob:') return;
      if (u.hostname !== '127.0.0.1') foreign.push(r.url());
    });
    await open(page, '/');
    await open(page, '/styleguide');
    for (const c of COMBOS) await setRoot(page, c.ground, c.volume);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    const offOrigin = await page.evaluate(() => {
      const out: string[] = [];
      for (const sheet of document.styleSheets) {
        if (sheet.href && !sheet.href.startsWith(location.origin)) out.push(sheet.href);
        let rules: CSSRuleList | null = null;
        try {
          rules = sheet.cssRules;
        } catch {
          out.push(`unreadable sheet ${sheet.href}`);
        }
        for (const r of rules ?? []) {
          const m = r.cssText.match(/url\((["']?)(https?:)?\/\/[^)]+\)/g);
          if (m) out.push(...m.filter((u) => !u.includes(location.host)));
          if (r instanceof CSSImportRule) out.push(`@import ${r.href}`);
        }
      }
      for (const el of document.querySelectorAll('script[src], link[href], img[src]')) {
        const u = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href || (el as HTMLImageElement).src;
        if (u && !u.startsWith(location.origin) && !u.startsWith('data:')) out.push(u);
      }
      return out;
    });
    expect(foreign).toEqual([]);
    expect(offOrigin).toEqual([]);
  });
});

test.describe('slice 0: screenshots', () => {
  test('each scope, root preview, nav and placeholder, per viewport and theme', async ({ page }, info) => {
    const p = info.project.name;
    await open(page);
    for (const id of SCOPES) {
      await page.getByTestId(id).screenshot({ path: `${SHOTS}/${p}-scope-${id.replace('set-', '')}.png` });
    }
    for (const c of COMBOS) {
      await setRoot(page, c.ground, c.volume);
      await page.locator('section', { has: page.locator('#sg-nav') }).screenshot({ path: `${SHOTS}/${p}-nav-${c.ground}-${c.volume}.png` });
      await page.screenshot({ path: `${SHOTS}/${p}-viewport-${c.ground}-${c.volume}.png` });
    }
    await open(page, '/');
    await page.screenshot({ path: `${SHOTS}/${p}-placeholder-root.png` });
  });
});

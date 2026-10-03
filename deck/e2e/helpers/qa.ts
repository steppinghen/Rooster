import { readFileSync, mkdirSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';

/*
 * Independent QA helpers for real screens (slices 2 to 4 onward): contrast, tap targets,
 * form labelling, overflow, volume rules, read-aloud capture and side-by-side mockup images.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Installs color/contrast helpers on window.__qa and records speech on window.__spoken. */
export async function installQa(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    type RGBA = [number, number, number, number];
    const parse = (c: string): RGBA | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0]!, p[1]!, p[2]!, p.length > 3 ? p[3]! : 1];
    };
    const lum = ([r, g, b]: RGBA) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const blend = (top: RGBA, under: RGBA): RGBA => {
      const a = top[3];
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
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
        if (n.classList.contains('visually-hidden')) return false;
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
      const [, b] = m[1]!.split(',').map(Number);
      return Math.abs(b!) > 0.001;
    };
    const name = (el: Element) => {
      const t = (el.getAttribute('aria-label') || ownText(el) || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${t}"`;
    };
    Object.assign(window, { __qa: { parse, lum, ratio, blend, effectiveBg, ownText, visible, opacityChain, rotated, name } });

    // Record read-aloud calls instead of speaking (WebKit headless has no voices).
    (window as any).__spoken = [] as string[];
    try {
      // An empty utterance is the app priming iOS speech inside a tap: silence, not speech.
      const record = (u: { text: string }) => void (u.text && (window as any).__spoken.push(u.text));
      if ((window as any).SpeechSynthesis?.prototype) {
        // Patch the prototype: WebKit can hand out a fresh speechSynthesis object after load.
        (window as any).SpeechSynthesis.prototype.speak = function (u: { text: string }) {
          record(u);
        };
      } else {
        Object.defineProperty(window, 'speechSynthesis', { value: { speak: record, cancel() {}, getVoices: () => [] }, configurable: true });
        if (!(window as any).SpeechSynthesisUtterance) (window as any).SpeechSynthesisUtterance = class { constructor(public text: string) {} };
      }
    } catch {
      /* ignore */
    }
  });
}

export type Audit = {
  smallTargets: string[];
  contrast: string[];
  yellowOnDay: string[];
  creamOnAccent: string[];
  unlabeled: string[];
  errorsNotDescribed: string[];
  overflowX: boolean;
  scrollsY: boolean;
  selectable: string[];
  callouts: string[];
  ground: string | undefined;
  volume: string | undefined;
};

/** Audit what's on screen. `minTarget` is the smallest allowed hit area in CSS px (= pt). */
export async function audit(page: Page, minTarget: number): Promise<Audit> {
  return page.evaluate((min) => {
    const qa = (window as any).__qa;
    const smallTargets: string[] = [];
    const contrast: string[] = [];
    const yellowOnDay: string[] = [];
    const creamOnAccent: string[] = [];
    const unlabeled: string[] = [];
    const errorsNotDescribed: string[] = [];
    const selectable: string[] = [];
    const callouts: string[] = [];
    const ground = document.documentElement.dataset.ground;
    const volume = document.documentElement.dataset.volume;
    const kid = !!document.querySelector('[data-audience="kid"]');

    const interactive = document.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=radio], [role=tab]',
    );
    for (const el of interactive) {
      if (!qa.visible(el)) continue;
      // A checkbox wrapped in a label is hit through the label.
      const label = el.closest('label');
      const r = (label && el.matches('input') ? label : el).getBoundingClientRect();
      // Allow 0.5px of subpixel rounding.
      if (Math.min(r.width, r.height) + 0.5 < min) smallTargets.push(`${qa.name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (el.matches('input, select, textarea')) {
        const i = el as HTMLInputElement;
        const named = (i.labels && i.labels.length > 0) || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby');
        if (!named) unlabeled.push(qa.name(el));
        if (i.getAttribute('aria-invalid') === 'true' && !i.getAttribute('aria-describedby') && !i.getAttribute('aria-errormessage'))
          errorsNotDescribed.push(qa.name(el));
      }
    }

    const ACCENTS = ['255,62,138', '41,211,255', '255,210,63', '155,229,100', '169,155,255', '255,138,61'];
    const CREAMS = ['244,235,217', '255,251,242', '255,255,255'];
    for (const el of document.querySelectorAll('body *')) {
      const text = qa.ownText(el);
      if (!text || !qa.visible(el)) continue;
      const s = getComputedStyle(el);
      if (kid) {
        if (s.webkitUserSelect !== 'none' && s.userSelect !== 'none') selectable.push(qa.name(el));
        if ((s as any).webkitTouchCallout && (s as any).webkitTouchCallout !== 'none') callouts.push(qa.name(el));
      }
      if (el.closest(':disabled')) continue; // WCAG exempts disabled controls
      const fg = qa.parse(s.color);
      if (!fg) continue;
      const bg = qa.effectiveBg(el);
      const fgOn = qa.blend([fg[0], fg[1], fg[2], fg[3] * qa.opacityChain(el)], bg);
      const cr = qa.ratio(fgOn, bg);
      const px = parseFloat(s.fontSize);
      const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (cr + 0.005 < need) contrast.push(`${qa.name(el)} ${cr.toFixed(2)}:1 (need ${need}) fg ${s.color} bg rgb(${bg.slice(0, 3).map(Math.round)})`);
      const fgKey = fg.slice(0, 3).join(',');
      const bgKey = bg.slice(0, 3).map(Math.round).join(',');
      if (ground === 'day' && fgKey === '255,210,63' && qa.lum(bg) > 0.4) yellowOnDay.push(qa.name(el));
      if (ACCENTS.includes(bgKey) && CREAMS.includes(fgKey)) creamOnAccent.push(`${qa.name(el)} on rgb(${bgKey})`);
    }
    return {
      smallTargets,
      contrast,
      yellowOnDay,
      creamOnAccent,
      unlabeled,
      errorsNotDescribed,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      scrollsY: document.documentElement.scrollHeight > window.innerHeight + 1,
      selectable,
      callouts,
      ground,
      volume,
    };
  }, minTarget);
}

/** Volume-rule evidence across the whole page (ground image included). */
export async function volumeAudit(page: Page) {
  return page.evaluate(() => {
    const qa = (window as any).__qa;
    const all = [document.documentElement, document.body, ...document.querySelectorAll('body *')];
    const textShadows: string[] = [];
    const halftone: string[] = [];
    const tilts: string[] = [];
    const marker: string[] = [];
    const accentFills: { el: string; w: number; h: number }[] = [];
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--magenta').trim();
    void accent;
    for (const el of all) {
      const s = getComputedStyle(el);
      const text = qa.ownText(el);
      if (text && s.textShadow !== 'none' && qa.visible(el)) textShadows.push(`${qa.name(el)} ${s.textShadow}`);
      for (const pseudo of [s, getComputedStyle(el, '::before'), getComputedStyle(el, '::after')]) {
        if (pseudo.backgroundImage.includes('radial-gradient') && Number(pseudo.opacity) > 0 && qa.opacityChain(el) > 0) halftone.push(qa.name(el));
      }
      if (el !== document.documentElement && el !== document.body && qa.rotated(el) && qa.visible(el)) tilts.push(qa.name(el));
      if (text && s.fontFamily.includes('Permanent Marker') && qa.visible(el)) marker.push(qa.name(el));
    }
    return { textShadows, halftone: [...new Set(halftone)], tilts, marker, accentFills, patterns: document.querySelectorAll('pattern').length };
  });
}

/** Area (fraction of the viewport) filled with a given accent rgb, and the fills themselves. */
export async function accentArea(page: Page, rgb: string) {
  return page.evaluate((want) => {
    const qa = (window as any).__qa;
    const fills: string[] = [];
    let area = 0;
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (s.backgroundColor !== want || !qa.visible(el)) continue;
      const r = el.getBoundingClientRect();
      area += r.width * r.height;
      fills.push(`${qa.name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { fraction: area / (window.innerWidth * window.innerHeight), fills };
  }, rgb);
}

export async function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__spoken as string[]);
}

/** Switch the emulated light/dark setting and wait out the ground cross-fade. */
export async function scheme(page: Page, s: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: s });
  await page.waitForTimeout(1200);
}

const REF = 'design/reference/png';

/** App capture on the left, reference PNG on the right, same height. */
export async function sideBySide(page: Page, app: Buffer, refName: string, out: string, appLabel: string, h = 1180) {
  const ref = readFileSync(`${REF}/${refName}.png`);
  const html = `<!doctype html><html><body style="margin:0;background:#888;font:600 16px system-ui">
    <div id="c" style="display:flex;gap:16px;padding:16px;align-items:flex-start;width:max-content">
      <figure style="margin:0"><figcaption>APP: ${appLabel}</figcaption><img style="height:${h}px;display:block" src="data:image/png;base64,${app.toString('base64')}"></figure>
      <figure style="margin:0"><figcaption>REFERENCE: ${refName}.png</figcaption><img style="height:${h}px;display:block" src="data:image/png;base64,${ref.toString('base64')}"></figure>
    </div></body></html>`;
  const p2 = await page.context().newPage();
  await p2.setViewportSize({ width: 2600, height: h + 80 });
  await p2.setContent(html);
  await p2.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
  await p2.locator('#c').screenshot({ path: out });
  await p2.close();
}

/** A family timezone where it is currently day (12:00-16:59) or night (00:00-04:59) locally. */
export function zoneWhere(kind: 'day' | 'night'): string {
  for (let off = -12; off <= 14; off++) {
    const zone = off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    if (kind === 'day' ? h >= 12 && h <= 16 : h >= 0 && h <= 4) return zone;
  }
  throw new Error('no zone found');
}

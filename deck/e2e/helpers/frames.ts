import { readFileSync, mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';

/*
 * Renders a canvas frame (design/canvas/*.dc.html) with Playwright, for side-by-side review.
 *
 * Frames are templated: {{holes}} filled by the frame's own renderVals(), <sc-if value> and
 * <sc-for list as> blocks, and props from data-props. This fills them the same way the canvas
 * does, closely enough to look at: the frame's script runs against a tiny DCLogic shim with the
 * props' defaults (plus any overrides). Google Fonts links are dropped and the self-hosted
 * Fontsource files are inlined instead, so nothing leaves the Mac. The canvas emoji sprite
 * (/_blob/...) is not in the repo, so Fluent stickers render blank; the original SVG art renders.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const FONTS: [string, number, string][] = [
  ['Archivo', 400, 'archivo/files/archivo-latin-400-normal.woff2'],
  ['Archivo', 600, 'archivo/files/archivo-latin-600-normal.woff2'],
  ['Archivo', 700, 'archivo/files/archivo-latin-700-normal.woff2'],
  ['Archivo', 800, 'archivo/files/archivo-latin-800-normal.woff2'],
  ['Archivo Black', 400, 'archivo-black/files/archivo-black-latin-400-normal.woff2'],
  ['Permanent Marker', 400, 'permanent-marker/files/permanent-marker-latin-400-normal.woff2'],
];

let fontCss: string | undefined;
function fontFaces() {
  fontCss ??= FONTS.map(
    ([family, weight, file]) =>
      `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/${file}`).toString('base64')}) format('woff2')}`,
  ).join('\n');
  return fontCss;
}

const get = (scope: any, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
const str = (v: unknown) => (v == null || typeof v === 'function' || (typeof v === 'object' && !Array.isArray(v)) ? '' : String(v));

/** The frame's HTML with its holes filled, plus its artboard size. */
export function frameHtml(file: string, props: Record<string, unknown> = {}): { html: string; width: number; height: number } {
  const src = readFileSync(`design/canvas/${file}`, 'utf8');
  const propsJson = src.match(/data-props='([^']*)'/)?.[1];
  const spec = propsJson ? JSON.parse(propsJson) : {};
  const defaults: Record<string, unknown> = {};
  for (const [k, v] of Object.entries<any>(spec)) if (!k.startsWith('$') && v && 'default' in v) defaults[k] = v.default;
  const code = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? 'class Component extends DCLogic { renderVals() { return {}; } }';
  class DCLogic {
    props: any;
    state: any = {};
    constructor(p: any) {
      this.props = p ?? {};
    }
    setState(s: any) {
      Object.assign(this.state, s);
    }
  }
  const Component = new Function('DCLogic', `${code}\n;return Component;`)(DCLogic);
  const vals = new Component({ ...defaults, ...props }).renderVals();

  const styles = [...src.matchAll(/<helmet>[\s\S]*?<\/helmet>/g)].map((m) => [...m[0].matchAll(/<style>([\s\S]*?)<\/style>/g)].map((s) => s[1]).join('\n')).join('\n');
  let body = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/)?.[1] ?? '';
  body = body.replace(/<helmet>[\s\S]*?<\/helmet>/g, '');
  // sc-for: expand each item, with the item's own holes filled first.
  for (let i = 0; i < 5 && body.includes('<sc-for'); i++) {
    body = body.replace(/<sc-for list="\{\{([\w.]+)\}\}" as="(\w+)"[^>]*>((?:(?!<sc-for)[\s\S])*?)<\/sc-for>/g, (_m, list: string, as: string, inner: string) => {
      const items = (get(vals, list) as unknown[]) ?? [];
      return items.map((it) => inner.replace(new RegExp(`\\{\\{${as}((?:\\.[\\w]+)*)\\}\\}`, 'g'), (_x, p: string) => str(p ? get(it, p.slice(1)) : it))).join('');
    });
  }
  body = body.replace(/\{\{([\w.]+)\}\}/g, (_m, p: string) => str(get(vals, p)));
  const w = Number(spec.$preview?.width ?? 820);
  const h = Number(spec.$preview?.height ?? 1180);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaces()}\n${styles}</style></head><body style="margin:0">${body}</body></html>`;
  return { html, width: w, height: h };
}

/** Loads a frame into `page` (sized to its artboard) and resolves its sc-if blocks. */
export async function loadFrame(page: Page, file: string, props: Record<string, unknown> = {}) {
  const f = frameHtml(file, props);
  await page.setViewportSize({ width: f.width, height: f.height });
  await page.route(/fonts\.(googleapis|gstatic)\.com|\/_blob\//, (r) => r.abort());
  await page.setContent(f.html, { waitUntil: 'load' });
  await page.evaluate(() => {
    for (const el of [...document.querySelectorAll('sc-if')]) {
      if (!el.isConnected) continue;
      const v = (el.getAttribute('value') ?? '').trim();
      if (!v || v === 'false' || v === 'undefined' || v === 'null' || v === '0') el.remove();
      else el.replaceWith(...el.childNodes);
    }
  });
  await page.evaluate(() => document.fonts.ready);
  return page.locator('body > div').first();
}

/** Two or more images in a row with captions, saved as one PNG. */
export async function composite(page: Page, out: string, parts: { label: string; png: Buffer }[], height?: number) {
  const imgs = parts
    .map(
      (p) =>
        `<figure style="margin:0"><figcaption style="padding:0 0 6px">${p.label}</figcaption><img style="display:block;${height ? `height:${height}px` : ''}" src="data:image/png;base64,${p.png.toString('base64')}"></figure>`,
    )
    .join('');
  const p2 = await page.context().newPage();
  await p2.setViewportSize({ width: 3000, height: 1400 });
  await p2.setContent(`<!doctype html><html><body style="margin:0;background:#888;font:600 16px system-ui"><div id="c" style="display:flex;gap:16px;padding:16px;align-items:flex-start;width:max-content">${imgs}</div></body></html>`);
  await p2.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
  await p2.locator('#c').screenshot({ path: out });
  await p2.close();
}

import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setGround } from './helpers/kidqa';
import { loadFrame } from './helpers/frames';
import { AT, LANDSCAPE, PORTRAIT, doneSteps, openPoint, pointFamily, resetPoint, seedWeek, volume, type PointFam } from './helpers/pointqa';

// The frame-vs-build sheet for The Point (parent's request at the smoke check). Every built
// variant (both bands, portrait and landscape, day and night, normal and focus) is shot at the
// iPad's CSS size next to the nearest B2 frame, with a few measured sizes for comparing
// proportions: the dock, the lit pill, Right now, My week and the deck. Output only, no
// assertions: review/screenshots/phase15-slice5-sheet/ (sheet.json + JPEGs).
const OUT = 'review/screenshots/phase15-slice5-sheet';
mkdirSync(OUT, { recursive: true });

test.beforeEach(({}, info) => test.skip(info.project.name !== 'ipad', 'the sheet is built once'));

const KIDS = { 'Kid A': { band: 'reader', color: '#29D3FF' }, 'Kid B': { band: 'prereader', color: '#FF3E8A' } } as const;

/** The nearest drawn frame for a built variant (frames are day only, and the canvas has no reader landscape focus or pre-reader portrait). */
function frameFor(band: string, orient: string, v: string) {
  if (band === 'reader') {
    if (orient === 'portrait') return v === 'focus' ? 'Phase15PointB2Focus.dc.html' : 'Phase15PointB2.dc.html';
    return 'Phase15PointB2Land.dc.html';
  }
  return v === 'focus' ? 'Phase15PointB2PreFocus.dc.html' : 'Phase15PointB2Pre.dc.html';
}

type Box = { x: number; y: number; w: number; h: number } | null;
type Measures = Record<'dock' | 'pill' | 'hero' | 'week' | 'deck' | 'cards', Box>;

/** Sizes of the parts both the app and the frames have, in CSS px. */
async function measure(page: Page, frame: boolean): Promise<Measures> {
  return page.evaluate((isFrame) => {
    const box = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    if (!isFrame) {
      return {
        dock: box(document.querySelector('nav.dk-dock')),
        pill: box(document.querySelector('nav.dk-dock [aria-current="page"]')),
        hero: box(document.querySelector('[data-testid="right-now"],[data-testid="wave-prompt"],[data-testid="session-home"]')),
        week: box(document.querySelector('.pt-week')),
        deck: box(document.querySelector('.pt-week .dk-deck')),
        cards: box(document.querySelector('.pt-cards')),
      };
    }
    const label = [...document.querySelectorAll('div')].find((d) => d.textContent?.trim() === 'RIGHT NOW');
    const deck = document.querySelector('[role="img"][aria-label^="This week"]');
    const sleeps = [...document.querySelectorAll('button')].find((b) => /sleeps/.test(b.textContent ?? ''));
    return {
      dock: box(document.querySelector('nav[aria-label="The Deck"]')),
      pill: box(document.querySelector('nav[aria-label="The Deck"] [aria-current="page"]')),
      hero: box(label?.parentElement),
      week: box(deck?.closest('button')),
      deck: box(deck),
      cards: box(sleeps?.parentElement),
    };
  }, frame);
}

let f: PointFam;
test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'ipad') return;
  f = await pointFamily();
});

test('frame-vs-build sheet for The Point', async ({ browser }) => {
  test.setTimeout(300_000);
  const rows: unknown[] = [];
  const frames = new Map<string, { file: string; color: string; img: string; m: Measures }>();
  resetPoint(f);
  for (const kid of ['Kid A', 'Kid B'] as const) {
    // As the frames draw it: Dawn Patrol running, no check-in moment open, eight stickers.
    seedWeek(f, kid, { moments: [] });
    doneSteps(f, kid, f.r.dawn, ['teeth']);
  }
  for (const kid of ['Kid A', 'Kid B'] as const) {
    const { band, color } = KIDS[kid];
    for (const orient of ['portrait', 'landscape'] as const) {
      for (const ground of ['day', 'night'] as const) {
        for (const v of ['normal', 'focus'] as const) {
          volume(f, kid, v);
          setGround(f, ground);
          const { ctx, page } = await openPoint(browser, f, kid, AT.dawn, { viewport: orient === 'portrait' ? PORTRAIT : LANDSCAPE, colorScheme: ground === 'day' ? 'light' : 'dark' });
          await page.waitForFunction(() => [...document.images].every((i) => i.complete));
          const id = `${band}-${orient}-${ground}-${v}`;
          await page.screenshot({ path: `${OUT}/app-${id}.jpg`, type: 'jpeg', quality: 72, scale: 'css' });
          const m = await measure(page, false);
          await ctx.close();
          const file = frameFor(band, orient, v);
          const key = `${file}-${color}`;
          if (!frames.has(key)) {
            const fctx = await browser.newContext({ deviceScaleFactor: 1 });
            const fp = await fctx.newPage();
            await loadFrame(fp, file, { kidColor: color, markers: 'None', hero: 'Routine', holiday: 'None' });
            const img = `frame-${file.replace('.dc.html', '')}-${color.slice(1)}.jpg`;
            await fp.screenshot({ path: `${OUT}/${img}`, type: 'jpeg', quality: 72 });
            frames.set(key, { file, color, img, m: await measure(fp, true) });
            await fctx.close();
          }
          const fr = frames.get(key)!;
          rows.push({ id, kid, band, orient, ground, volume: v, app: `app-${id}.jpg`, frame: fr.img, frameFile: fr.file, appM: m, frameM: fr.m });
        }
      }
      volume(f, kid, 'normal');
    }
  }
  setGround(f, 'auto');
  writeFileSync(`${OUT}/sheet.json`, JSON.stringify({ at: '07:00, Dawn Patrol 1 of 3 done', rows }, null, 2));
});

// Exports the original Sticker Punk art from the canvas copy in design/canvas/ into
// src/assets/art/<group>/<key>.<class>.svg (docs/design-system.md "Art spec for Claude Code").
// Nothing is drawn or edited by hand: every file comes from a canvas SVG, through SVGO.
//
//   node scripts/export-art.mjs           export, run the checks, write the contact sheet
//   node scripts/export-art.mjs --check   checks only (exit 1 on a failure); writes nothing
//
// How art is found (REVIEW.md A47): each asset names ONE source frame and a selector, either
// its aria-label or, for the unlabelled holiday art, an id inside it. Labels repeat across
// frames, so only the source frame counts; inside it, copies of the same class must match.
// The class comes from the size the canvas draws it at: 100 px and up is lg, 48–99 md,
// under 48 sm. A class the canvas doesn't draw is derived from the next one up by removing the
// halftone (programmatic, flagged on the contact sheet). Stickers lose their built-in cut: the
// app's DieCut applies the one cut every sticker gets.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { optimize } from 'svgo';

const ROOT = process.cwd();
const CANVAS = join(ROOT, 'design/canvas');
const OUT = join(ROOT, 'src/assets/art');
const CHECK_ONLY = process.argv.includes('--check');

// ---------------------------------------------------------------------------------------------
// The mapping table
// ---------------------------------------------------------------------------------------------

const POSES = { board: 'On the board', hello: 'Hello', celebrate: 'Celebrate', calm: 'Calm', headsup: 'Heads-up', breathing: 'Breathing', bedtime: 'Bedtime', winter: 'Winter', 'winter-board': 'Winter board' };
// Classes per pose (art spec "Mascots").
const POSE_CLASSES = { board: ['lg', 'md'], hello: ['lg', 'md', 'sm'], celebrate: ['lg', 'md'], calm: ['lg', 'md', 'sm'], headsup: ['lg', 'md'], breathing: ['lg', 'md'], bedtime: ['lg', 'md'], winter: ['lg', 'md'], 'winter-board': ['lg', 'md'] };
const POSE_FRAME = { board: 'R2', hello: 'R2', celebrate: 'R2', calm: 'R2', headsup: 'R2b', breathing: 'R2b', bedtime: 'R2b', winter: 'R2b', 'winter-board': 'R2b' };

const ASSETS = [];
const add = (group, key, frame, sel, classes, opts = {}) => ASSETS.push({ group, key, frame, sel, classes, ...opts });

for (const [who, name, frameName] of [
  ['rooster', 'Rooster mascot', 'Rooster'],
  ['turtle', 'Turtle mascot', 'Turtle'],
  ['dog-mara', 'Dog mascot', 'Dog'],
  ['dog-costa', 'Dog mascot (Costa)', 'DogCosta'],
]) {
  for (const [key, pose] of Object.entries(POSES)) add(`mascots/${who}`, key, `${POSE_FRAME[key]}${frameName}`, { label: `${name} — ${pose}` }, POSE_CLASSES[key]);
}
add('mascots/dog-mara', 'slap', 'R6StickerSlap', { label: 'Mara slaps the sticker on' }, ['lg']);
add('mascots/dog-costa', 'slap', 'R6StickerSlap', { label: 'Costa slaps the sticker on' }, ['lg']);
add('mascots/turtle', 'float', 'R4WaveExtras', { label: 'Turtle floating on its shell' }, ['lg', 'md']);
add('mascots/turtle', 'tucked', 'R5Celebrations', { label: 'Turtle tucked in its shell' }, ['lg', 'md']);

// Idle and Lights out frames are unlabelled: they're taken by their position in the frame, which
// lists each animation's steps in order (R3Idle: rooster open/closed, Mara down/up, Costa
// down/up, turtle open/closed; R3LightsOut: turtle calm, rooster calm, turtle yawn, turtle
// tucked, rooster roosting). Both frames of each pair ship, so an idle move swaps matched art.
for (const [who, key, nth] of [
  ['rooster', 'idle', 0], ['rooster', 'idle-blink', 1],
  ['dog-mara', 'idle', 7], ['dog-mara', 'idle-tail', 8],
  ['dog-costa', 'idle', 14], ['dog-costa', 'idle-tail', 15],
  ['turtle', 'idle', 21], ['turtle', 'idle-blink', 22],
]) add(`mascots/${who}`, key, 'R3Idle', { nth }, ['lg', 'md'], { single: true });
for (const [who, key, nth] of [['turtle', 'lights-calm', 0], ['rooster', 'lights-calm', 1], ['turtle', 'yawn', 2], ['turtle', 'lights-tucked', 4], ['rooster', 'roost', 5]])
  add(`mascots/${who}`, key, 'R3LightsOut', { nth }, ['lg', 'md'], { single: true });

// Scene props (R3Celebrations, R5Celebrations, R6StickerSlap), unlabelled, by position.
for (const [key, frameName, nth] of [['sparkle', 'R3Celebrations', 10], ['spin-lines', 'R5Celebrations', 5], ['wave-strip', 'R5Celebrations', 37], ['impact-lines', 'R6StickerSlap', 12]])
  add('props', key, frameName, { nth }, ['lg'], { single: true });

const WEATHER = ['sunny', 'cloudy', 'rain', 'storm', 'snow', 'windy', 'hot', 'cold'];
const SNOW_WORD = { sunny: 'Bluebird', cloudy: 'Flat light', rain: 'Slush', storm: 'Blizzard', snow: 'Powder day', windy: 'Gusty', hot: 'Spring snow', cold: 'Deep freeze' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
for (const k of WEATHER) {
  add('weather/surf', k, 'R4Weather', { label: cap(k) }, ['lg', 'md', 'sm']);
  // The Snow Report draws its hot day as "Warm" (REVIEW.md A49): the key stays "hot".
  const plain = k === 'hot' ? 'Warm' : cap(k);
  add('weather/snow', k, 'R5SnowReport', { label: { lg: `${plain}, ${SNOW_WORD[k]}`, md: plain, sm: plain } }, ['lg', 'md', 'sm']);
}
add('weather/badges', 'surf-report', 'R5SnowReport', { label: 'Surf Report' }, ['md']);
add('weather/badges', 'snow-report', 'R5SnowReport', { label: 'Snow Report' }, ['md']);

for (const [k, l] of [['jacket', 'Jacket'], ['shorts', 'Shorts'], ['rain-boots', 'Rain boots'], ['coat', 'Coat'], ['warm-hat', 'Warm hat'], ['gloves', 'Gloves'], ['snow-boots', 'Snow boots']])
  add('dressing', k, 'R4Dressing', { label: l }, ['lg', 'md']);
for (const [k, l] of [['snow-pants', 'Snow pants'], ['scarf', 'Scarf']]) add('dressing', k, 'R5SnowReport', { label: l }, ['lg', 'md']);

for (const f of ['pumping', 'rolling', 'flat', 'choppy']) add('wavecheck', f, 'R4WaveExtras', { label: `${cap(f)} wave` }, ['lg', 'md', 'sm']);

const sticker = (group, key, frame, name, mdsm = name) => add(`stickers/${group}`, key, frame, { label: { lg: `Sticker — ${name}`, md: mdsm, sm: mdsm } }, ['lg', 'md', 'sm'], { cut: 'strip' });
const SETS = {
  skate: [['bolt-deck', 'Bolt deck'], ['wheel', 'Wheel'], ['high-top', 'High-top'], ['half-pipe', 'Half-pipe'], ['helmet', 'Helmet']],
  surf: [['surfboard', 'Surfboard'], ['barrel', 'Barrel'], ['shell', 'Shell'], ['palm-island', 'Palm island'], ['flip-flop', 'Flip-flop'], ['rooster-rider', 'Rooster rider']],
  snow: [['snowboard', 'Snowboard'], ['peak', 'Peak'], ['goggles', 'Goggles'], ['snowflake', 'Snowflake'], ['cocoa', 'Cocoa'], ['turtle-rider', 'Turtle rider']],
};
// The collection frame labels every size "Sticker — …".
for (const [set, list] of Object.entries(SETS)) for (const [k, n] of list) sticker(set, k, 'R4Stickers', n, `Sticker — ${n}`);
// The dog rider follows the dog season, so it ships for both dogs (A48: both drawn on R6DogRider).
sticker('skate', 'dog-rider-mara', 'R6DogRider', 'Dog rider', 'Sticker — Dog rider');
sticker('skate', 'dog-rider-costa', 'R6DogRider', 'Dog rider (Costa)', 'Sticker — Dog rider (Costa)');
for (const n of ['Santa', 'Reindeer', 'Snowman', 'Present', 'Bunny', 'Egg', 'Leprechaun', 'Shamrock', 'Flag', 'Fireworks', 'Pumpkin', 'Ghost', 'Turkey', 'Heart', 'Cake', 'Party hat'])
  sticker('holiday', n.toLowerCase().replace(/ /g, '-'), 'R5Holidays', n);
for (const n of ['Manger', 'North Star', 'Cross', 'Empty tomb', 'Church']) sticker('faith', n.toLowerCase().replace(/ /g, '-'), 'R5FaithSchool', n);
for (const n of ['School', 'School bus', 'Pencil', 'Apple', 'Ribbon']) sticker('school', n.toLowerCase().replace(/ /g, '-'), 'R5FaithSchool', n);
for (const [k, n] of [['tent', 'Tent'], ['cruise-ship', 'Cruise ship'], ['road-trip-car', 'Road trip car'], ['plane', 'Plane'], ['beach', 'Beach'], ['theme-park', 'Theme park'], ['grandmas-house', 'Grandma’s house']])
  sticker('travel', k, 'R6Travel', n);

// Seasonal suns (400 px, normal volume only, behind the header avatar).
add('seasons', 'sun.spring-summer', 'Phase15DinnersDay', { id: 'cp_sun' }, ['lg'], { single: true });
add('seasons', 'sun.fall', 'Phase15PointB2', { id: 'cp_fall' }, ['lg'], { single: true });
add('seasons', 'sun.winter', 'Phase15DinnersDay', { id: 'cp_winter' }, ['lg'], { single: true });

// Holidays: corner circles and edge trims (see holidayArt() below for the trims).
const HOLIDAYS = ['halloween', 'thanksgiving', 'christmas', 'newyear', 'valentine', 'stpat', 'easter', 'fourth', 'birthday', 'winter'];
for (const h of HOLIDAYS) {
  if (h === 'halloween' || h === 'christmas') {
    add(`holidays/${h}`, 'circle.day', 'Phase15PointB2', { id: `cp_${h}` }, ['lg'], { single: true });
    add(`holidays/${h}`, 'circle.night', 'Phase15HolidayTrims', { id: `cpn_${h}` }, ['lg'], { single: true });
  } else {
    add(`holidays/${h}`, 'circle.day', 'Phase15HolidayTrimsFull', { idPrefix: `cp_${h}_p` }, ['lg'], { single: true });
    add(`holidays/${h}`, 'circle.night', 'Phase15HolidayTrimsFull', { idPrefix: `cpn_${h}_l` }, ['lg'], { single: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Reading the canvas
// ---------------------------------------------------------------------------------------------

const frames = new Map();
function frame(name) {
  if (!frames.has(name)) frames.set(name, readFileSync(join(CANVAS, `${name}.dc.html`), 'utf8'));
  return frames.get(name);
}

function allSvgs(text) {
  const out = [];
  const re = /<svg\b[^>]*>[\s\S]*?<\/svg>/g;
  for (let m; (m = re.exec(text)); ) {
    const open = /^<svg\b[^>]*>/.exec(m[0])[0];
    out.push({ text: m[0], at: m.index, label: /aria-label="([^"]*)"/.exec(open)?.[1] ?? null, width: Number(/\bwidth="([\d.]+)"/.exec(open)?.[1] ?? 0) });
  }
  return out;
}

const classOf = (w) => (w >= 100 ? 'lg' : w >= 48 ? 'md' : 'sm');
const hasHalftone = (svg) => /<pattern\b/.test(svg);
// Two copies are the same drawing when they match with ids and number noise removed.
const norm = (svg) =>
  svg
    .replace(/^<svg\b[^>]*>/, '')
    .replace(/\b(id|clip-path|mask|filter)="[^"]*"/g, '')
    .replace(/url\(#[^)]*\)/g, 'url()')
    .replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(0))
    .replace(/\s+/g, ' ');

function candidates(a, cls) {
  const svgs = allSvgs(frame(a.frame));
  const sel = a.sel;
  if (sel.nth !== undefined) return svgs.slice(sel.nth, sel.nth + 1);
  if (sel.id || sel.idPrefix) {
    return svgs.filter((s) => (sel.id ? new RegExp(`\\bid="${sel.id}"`).test(s.text) : new RegExp(`\\bid="${sel.idPrefix}\\d*"`).test(s.text)));
  }
  const label = typeof sel.label === 'string' ? sel.label : sel.label[cls];
  return svgs.filter((s) => s.label === label && classOf(s.width) === cls);
}

// ---------------------------------------------------------------------------------------------
// Transforms (programmatic only)
// ---------------------------------------------------------------------------------------------

/** Remove halftone: the <pattern> defs and every shape filled with one. */
function stripHalftone(svg) {
  const ids = [...svg.matchAll(/<pattern\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  let out = svg.replace(/<pattern\b[\s\S]*?<\/pattern>/g, '');
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`<(path|rect|circle|ellipse|polygon)\\b[^>]*fill="url\\(#${esc}\\)"[^>]*?(?:/>|></\\1>)`, 'g'), '');
  }
  return out;
}

/** Remove the built-in die-cut: the leading ink-shadow and paper-rim groups. */
function stripCut(svg) {
  let out = svg;
  for (const color of ['#0A0818', '#FFFBF2']) {
    const re = new RegExp(`<g\\b[^>]*>((?:(?!<g\\b|</g>)[\\s\\S])*)</g>`);
    const m = re.exec(out);
    if (!m) break;
    const paths = [...m[1].matchAll(/<path\b[^>]*>/g)].map((p) => p[0]);
    const isCut = paths.length && paths.every((p) => p.includes(`fill="${color}"`) && p.includes(`stroke="${color}"`) && Number(/stroke-width="([\d.]+)"/.exec(p)?.[1] ?? 0) >= 6);
    if (!isCut) break;
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  }
  return out;
}

/** Kid-tinted art keeps a CSS variable where the canvas has a template hole. */
const tint = (svg) => svg.replace(/\{\{[^}]*\}\}/g, 'var(--kid)');

function svgo(svg, prefix) {
  // Canvas SVGs were inline in HTML; as files they need their namespace to load in <img>.
  const standalone = /\bxmlns=/.test(svg.slice(0, 300)) ? svg : svg.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return optimize(standalone, {
    multipass: true,
    plugins: [
      { name: 'preset-default', params: { overrides: { cleanupIds: false } } }, // SVGO 4 keeps viewBox by default
      { name: 'removeAttrs', params: { attrs: ['role', 'aria-label', 'aria-hidden', 'style', 'class'] } },
      // Sized by the component, not the file (the viewBox keeps the proportions).
      'removeDimensions',
      { name: 'prefixIds', params: { prefix, delim: '-' } },
    ],
  }).data;
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

const problems = [];
const warnings = [];
const files = []; // { path, group, key, cls, derived, source }

for (const a of ASSETS) {
  const got = {};
  for (const cls of ['lg', 'md', 'sm']) {
    const found = a.single ? candidates(a, cls).slice(0, cls === 'lg' ? undefined : 0) : candidates(a, cls);
    if (!found.length) continue;
    // The biggest drawing is the master when several sizes land in one class.
    found.sort((x, y) => y.width - x.width);
    const distinct = [...new Set(found.map((f) => norm(f.text)))];
    if (distinct.length > 1) warnings.push(`${a.group}/${a.key} ${cls}: ${found.length} copies in ${a.frame} differ; using the largest`);
    got[cls] = { svg: found[0].text, derived: false };
  }
  if (!got.lg && !got.md) {
    problems.push(`${a.group}/${a.key}: not found in ${a.frame} (${JSON.stringify(a.sel)})`);
    continue;
  }
  // Derive classes the canvas doesn't draw: md from lg, sm from md.
  if (a.classes.includes('md') && !got.md && got.lg) got.md = { svg: stripHalftone(got.lg.svg), derived: 'md from lg' };
  if (a.classes.includes('sm') && !got.sm && got.md) got.sm = { svg: stripHalftone(got.md.svg), derived: got.md.derived ? 'sm from lg' : 'sm from md' };
  // A badge is drawn once, large; its md file is that drawing without halftone.
  if (a.classes.includes('md') && !got.md && !got.lg) problems.push(`${a.group}/${a.key}: no md source`);
  for (const cls of a.classes) {
    const g = got[cls] ?? (cls === 'md' && got.lg ? { svg: stripHalftone(got.lg.svg), derived: 'md from lg' } : null);
    if (!g) {
      problems.push(`${a.group}/${a.key}: class ${cls} missing`);
      continue;
    }
    let svg = g.svg;
    if (a.cut === 'strip') svg = stripCut(svg);
    if (cls !== 'lg') svg = stripHalftone(svg);
    if (/\{\{/.test(svg)) svg = tint(svg);
    const file = `${a.group}/${a.key}.${cls}.svg`;
    files.push({ path: file, group: a.group, key: a.key, cls, derived: g.derived, svg: svgo(svg, file.replace(/[^a-z0-9]+/gi, '_')) });
  }
}

// Trims: each holiday block in the full-width frame is [portrait trim (day panel), day circle,
// landscape trim (night panel), night circle]. Halloween and Christmas come from The Point
// frames (day only). A ground the canvas doesn't draw reuses the other one, flagged.
function holidayArt() {
  const full = allSvgs(frame('Phase15HolidayTrimsFull'));
  let pending = [];
  const drawn = {}; // holiday -> { 'portrait.day': svg, ... }
  for (const s of full) {
    const m = /\bid="cp(n?)_([a-z]+)_[pl]\d*"/.exec(s.text);
    if (!m) {
      if (s.width === 640 || s.width === 1000) pending.push(s);
      continue;
    }
    const [ground, h] = [m[1] ? 'night' : 'day', m[2]];
    drawn[h] ??= {};
    for (const t of pending) drawn[h][`${t.width === 640 ? 'portrait' : 'landscape'}.${ground}`] = t.text;
    pending = [];
  }
  for (const [h, n] of [['halloween', 0], ['christmas', 1]]) {
    drawn[h] = {};
    const p = allSvgs(/width: 640px; height: 72px[\s\S]*?<\/div>/.exec(frame('Phase15PointB2'))?.[0] ?? '');
    const l = allSvgs(/width: 1000px; height: 72px[\s\S]*?<\/div>/.exec(frame('Phase15PointB2Land'))?.[0] ?? '');
    if (p[n]) drawn[h]['portrait.day'] = p[n].text;
    if (l[n]) drawn[h]['landscape.day'] = l[n].text;
  }
  for (const h of HOLIDAYS) {
    const d = drawn[h] ?? {};
    for (const orient of ['portrait', 'landscape']) {
      for (const ground of ['day', 'night']) {
        const other = ground === 'day' ? 'night' : 'day';
        const svg = d[`${orient}.${ground}`] ?? d[`${orient}.${other}`] ?? d[`${orient === 'portrait' ? 'landscape' : 'portrait'}.${ground}`];
        if (!svg) {
          problems.push(`holidays/${h}: no ${orient} trim drawn at all`);
          continue;
        }
        const derived = d[`${orient}.${ground}`] ? false : d[`${orient}.${other}`] ? `not drawn: uses the ${other} trim` : `not drawn: uses the other orientation`;
        const file = `holidays/${h}/trim.${orient}.${ground}.svg`;
        files.push({ path: file, group: `holidays/${h}`, key: `trim.${orient}.${ground}`, cls: 'lg', derived, svg: svgo(/\{\{/.test(svg) ? tint(svg) : svg, file.replace(/[^a-z0-9]+/gi, '_')) });
      }
    }
  }
}
holidayArt();

// ---------------------------------------------------------------------------------------------
// Checks (docs/design-system.md "Checks the export script runs")
// ---------------------------------------------------------------------------------------------

for (const f of files) if (f.cls !== 'lg' && hasHalftone(f.svg)) problems.push(`${f.path}: halftone in a ${f.cls} file`);
const dogKeys = (who) => new Set(files.filter((f) => f.group === `mascots/${who}`).map((f) => `${f.key}.${f.cls}`));
const [mara, costa] = [dogKeys('dog-mara'), dogKeys('dog-costa')];
for (const k of mara) if (!costa.has(k)) problems.push(`mascots/dog-costa: missing ${k} (Mara has it)`);
for (const k of costa) if (!mara.has(k)) problems.push(`mascots/dog-mara: missing ${k} (Costa has it)`);
for (const who of ['mara', 'costa']) if (!files.some((f) => f.key === `dog-rider-${who}`)) problems.push(`stickers/skate: no ${who} rider`);
for (const f of files) if (/\{\{|aria-label|role="img"/.test(f.svg)) problems.push(`${f.path}: still has a template hole or accessibility attribute`);

// ---------------------------------------------------------------------------------------------
// Write files, the manifest and the contact sheet
// ---------------------------------------------------------------------------------------------

const derivedCount = files.filter((f) => f.derived).length;
console.log(`${files.length} files from ${ASSETS.length} assets + trims; ${derivedCount} derived or reused; ${warnings.length} warnings; ${problems.length} problems`);
for (const w of warnings) console.log(`  warn: ${w}`);
for (const p of problems) console.log(`  FAIL: ${p}`);

if (!CHECK_ONLY) {
  // Write in place and remove only files the export no longer makes. (The repo can live in a
  // synced folder, where deleting and recreating a folder leaves "name 2.svg" conflict copies.)
  const wanted = new Set(files.map((f) => f.path));
  for (const old of existsSync(OUT) ? readdirSync(OUT, { recursive: true }) : []) {
    const rel = String(old);
    if (rel.endsWith('.svg') && !wanted.has(rel)) rmSync(join(OUT, rel), { force: true });
  }
  for (const f of files) {
    mkdirSync(dirname(join(OUT, f.path)), { recursive: true });
    const dest = join(OUT, f.path);
    const body = f.svg + '\n';
    if (!existsSync(dest) || readFileSync(dest, 'utf8') !== body) writeFileSync(dest, body);
  }
  const manifest = Object.fromEntries(files.map((f) => [f.path, { group: f.group, key: f.key, class: f.cls, derived: f.derived || undefined }]));
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeContactSheet();
  writeAssetsSection();
}
if (problems.length) process.exit(1);

function writeContactSheet() {
  const SIZE = { lg: 96, md: 64, sm: 40 };
  const groups = [...new Set(files.map((f) => f.group))];
  const cell = (f) =>
    `<figure class="${f.derived ? 'derived' : ''}"><img src="../src/assets/art/${f.path}" width="${f.key.startsWith('trim.') ? 320 : f.key.startsWith('circle.') || f.key.startsWith('sun.') ? 120 : SIZE[f.cls]}" alt=""><figcaption>${f.key}.${f.cls}${f.derived ? `<br><b>${f.derived}</b>` : ''}</figcaption></figure>`;
  const section = () =>
    groups.map((g) => `<h3>${g}</h3><div class="row">${files.filter((f) => f.group === g).map(cell).join('')}</div>`).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Art export — contact sheet</title>
<style>
body{margin:0;font:14px system-ui,sans-serif}
.ground{padding:20px}
.day{background:#F2E6CC;color:#15122E}
.night{background:#15122E;color:#F4EBD9}
h2{margin:0 0 8px}
h3{margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em}
.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border-radius:8px}
figure.derived{outline:2px dashed #FF8A3D}
figcaption{font-size:11px;text-align:center}
</style></head><body>
<p style="padding:12px 20px;margin:0">Generated by <code>scripts/export-art.mjs</code> from <code>design/canvas/</code>. Every file at its class size (lg 96, md 64, sm 40 px) on both grounds. Dashed orange: derived from a larger class (halftone removed) or not drawn on the canvas and reused from the other ground or orientation.</p>
<div class="ground day"><h2>Day</h2>${section()}</div>
<div class="ground night"><h2>Night</h2>${section()}</div>
</body></html>
`;
  writeFileSync(join(ROOT, 'design/export-preview.html'), html);
}

// ASSETS.md: one entry per exported file, grouped by folder, between the export's markers.
function writeAssetsSection() {
  const path = join(ROOT, 'ASSETS.md');
  const [begin, end] = ['<!-- export-art:begin -->', '<!-- export-art:end -->'];
  const groups = [...new Set(files.map((f) => f.group))];
  const source = Object.fromEntries(ASSETS.map((a) => [`${a.group}/${a.key}`, a.frame]));
  const rows = groups.map((g) => {
    const list = files.filter((f) => f.group === g).map((f) => `\`${f.key}.${f.cls === 'lg' && f.path.endsWith(`${f.key}.svg`) ? '' : f.cls + '.'}svg\`${f.derived ? ` (${f.derived})` : ''}`);
    const frames = [...new Set(files.filter((f) => f.group === g).map((f) => source[`${f.group}/${f.key}`] ?? (g.startsWith('holidays/') ? 'Phase15HolidayTrimsFull / Phase15PointB2' : '?')))];
    return `| \`src/assets/art/${g}/\` | ${frames.join(', ')} | ${list.join(', ')} |`;
  });
  const section = `${begin}
## Art: original Sticker Punk (exported from the canvas)

- Source: the family's own canvas, "The Deck — Comic Shop Screens", copied into \`design/canvas/\` (\`.dc.html\` frames). Drawn in-house.
- License: **original work, owned by the family outright.** No third-party art. Never copied or adapted from licensed characters.
- Processing: \`npm run art:export\` (\`scripts/export-art.mjs\`) finds each piece in one source frame by its aria-label (or, for unlabelled holiday art, an id inside it), optimizes it with SVGO (MIT, dev only), prefixes its ids, and writes \`<key>.<class>.svg\`. Classes the canvas doesn't draw are derived from the next one up by removing the halftone; trims the canvas draws for one ground only are reused for the other (both flagged below and on \`design/export-preview.html\`). Stickers lose their built-in cut: the app's DieCut applies the one cut every sticker gets.
- ${files.length} files, generated; do not edit by hand.

| Folder | Source frame | Files |
|---|---|---|
${rows.join('\n')}
${end}`;
  const text = readFileSync(path, 'utf8');
  const next = text.includes(begin) ? text.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), section) : `${text.trimEnd()}\n\n${section}\n`;
  writeFileSync(path, next);
}

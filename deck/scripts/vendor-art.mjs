// Downloads the Fluent Emoji 3D art listed in src/art/manifest.json, resizes each file to the
// largest size the app displays it at, and writes WebP to public/art/fluent/. Only listed art ships.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync('src/art/manifest.json', 'utf8'));
const out = 'public/art/fluent';
const tmp = join(process.env.TMPDIR ?? '/tmp', 'deck-art');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });
const base = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';
let total = 0;
for (const [key, { fluent, px }] of Object.entries(manifest)) {
  const slug = fluent.toLowerCase().replace(/ /g, '_');
  const url = `${base}/${encodeURIComponent(fluent)}/3D/${slug}_3d.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${key}: ${res.status} ${url}`);
  const src = join(tmp, `${key}.png`);
  writeFileSync(src, Buffer.from(await res.arrayBuffer()));
  execFileSync('sips', ['-Z', String(px), src], { stdio: 'ignore' });
  const dest = join(out, `${key}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '86', '-alpha_q', '100', src, '-o', dest]);
  total += statSync(dest).size;
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${Object.keys(manifest).length} files, ${(total / 1024).toFixed(0)} KiB`);

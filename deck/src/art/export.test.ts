/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The export's own checks (every label found, both dogs complete, no halftone in md or sm) must
// pass against the committed canvas copy, and the committed files must match what it writes.
describe('art export', () => {
  it('passes its checks', () => {
    const out = execFileSync('node', ['scripts/export-art.mjs', '--check'], { encoding: 'utf8' });
    expect(out).toMatch(/0 problems/);
  }, 60_000);
  it('the manifest lists both dog riders and every mascot pose for both dogs', () => {
    const m = JSON.parse(readFileSync('src/assets/art/manifest.json', 'utf8')) as Record<string, { key: string; group: string; class: string }>;
    const keys = (g: string) => new Set(Object.values(m).filter((x) => x.group === g).map((x) => `${x.key}.${x.class}`));
    expect(keys('mascots/dog-mara')).toEqual(keys('mascots/dog-costa'));
    expect(Object.keys(m)).toEqual(expect.arrayContaining(['stickers/skate/dog-rider-mara.lg.svg', 'stickers/skate/dog-rider-costa.lg.svg']));
    for (const [path, x] of Object.entries(m)) if (x.class !== 'lg') expect(readFileSync(`src/assets/art/${path}`, 'utf8'), path).not.toMatch(/<pattern/);
  });
});

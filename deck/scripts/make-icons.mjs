/* global document */
// Draws the app icon (original art: a pro-model deck on the night ground) and saves PNGs.
import { webkit } from '@playwright/test';
import { readFileSync } from 'node:fs';

const font =
  'data:font/woff2;base64,' +
  readFileSync('node_modules/@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2').toString('base64');

function svg(scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="11" cy="11" r="3" fill="rgba(244,235,217,0.12)"/>
    </pattern>
    <pattern id="ht" width="14" height="14" patternUnits="userSpaceOnUse">
      <rect width="14" height="14" fill="#FFD23F"/><circle cx="7" cy="7" r="2.4" fill="#FF8A3D"/>
    </pattern>
  </defs>
  <rect width="512" height="512" fill="#15122E"/>
  <rect width="512" height="512" fill="url(#dots)"/>
  <g transform="translate(256 256) scale(${scale}) rotate(-28)">
    <rect x="-96" y="-218" width="192" height="436" rx="96" fill="#0A0818" transform="translate(16 16)"/>
    <rect x="-96" y="-218" width="192" height="436" rx="96" fill="#FF3E8A" stroke="#0A0818" stroke-width="16"/>
    <circle cx="0" cy="-122" r="50" fill="url(#ht)" stroke="#0A0818" stroke-width="10"/>
    <text x="0" y="96" text-anchor="middle" font-family="Archivo Black" font-size="150" fill="#0A0818"
      transform="rotate(90 0 60)" style="paint-order:stroke">DK</text>
  </g>
</svg>`;
}

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const [name, size, scale] of [
  ['icon-512', 512, 1],
  ['icon-192', 192, 1],
  ['apple-touch-icon', 180, 1],
  ['icon-maskable-512', 512, 0.72],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>@font-face{font-family:'Archivo Black';src:url('${font}')}html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg(scale)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${name}.png`, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(name);
}
await browser.close();

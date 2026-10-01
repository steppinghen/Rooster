import type { CSSProperties } from 'react';

// A 14-point starburst with a halftone fill, like a comic sound effect.
const POINTS = (() => {
  const pts: string[] = [];
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 50 : 31 + ((i * 7) % 5);
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();

/** Celebration burst ("SHRED!"). Always loud; reduced motion only stops the wobble. */
export function Burst({ word = 'SHRED!', size = 320, animate = true }: { word?: string; size?: number; animate?: boolean }) {
  return (
    <div className={animate ? 'dk-burst dk-burst--animate' : 'dk-burst'} style={{ '--burst-size': `${size}px` } as CSSProperties} role="img" aria-label={word}>
      <svg viewBox="-4 -4 108 108" aria-hidden="true">
        <defs>
          <pattern id="dk-halftone" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="3" fill="#FFD23F" />
            <circle cx="1.5" cy="1.5" r="0.55" fill="#FF8A3D" />
          </pattern>
        </defs>
        <polygon points={POINTS} fill="#0A0818" transform="translate(3 3)" />
        <polygon points={POINTS} fill="url(#dk-halftone)" stroke="#0A0818" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className="dk-burst__word" aria-hidden="true">
        {word}
      </span>
    </div>
  );
}

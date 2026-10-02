// Original line icons for The Deck (24×24, round caps). Same set on kid and parent screens.
const paths = {
  check: ['M5 12.5l4.5 4.5L19 7'],
  speaker: ['M4 9.5v5h3.5L12 18V6L7.5 9.5H4z', 'M15.5 9.2a4 4 0 0 1 0 5.6', 'M18 6.8a7.5 7.5 0 0 1 0 10.4'],
  waves: ['M3 9.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0', 'M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  sun: ['M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z', 'M12 2.5v2', 'M12 19.5v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2.5 12h2', 'M19.5 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z'],
  calendar: ['M4 6h16v14H4z', 'M4 10.5h16', 'M8.5 3.5v4', 'M15.5 3.5v4'],
  bowl: ['M3.5 11.5h17a8.5 8.5 0 0 1-17 0z', 'M9 7.5c0-1.4 1-1.6 1-3', 'M13.5 7.5c0-1.4 1-1.6 1-3'],
  play: ['M3.5 6.5h17v11h-17z', 'M10.5 9.5v5l4-2.5z'],
  home: ['M3.5 11L12 4l8.5 7', 'M6 9.5V20h12V9.5'],
  timer: ['M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z', 'M12 10v3.5l2.5 2', 'M9.5 2.5h5'],
  board: ['M3 10.5h18a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 10.5z', 'M7 16.5h.01', 'M17 16.5h.01'],
  back: ['M15 5l-7 7 7 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  breathe: ['M3 8.5h10a2.8 2.8 0 1 0-2.8-2.8', 'M3 12.5h14a3 3 0 1 1-3 3', 'M3 16.5h6'],
  book: ['M4.5 5.5c2.5-1.5 5-1.5 7.5 0v14c-2.5-1.5-5-1.5-7.5 0z', 'M12 5.5c2.5-1.5 5-1.5 7.5 0v14c-2.5-1.5-5-1.5-7.5 0z'],
  sparkle: ['M12 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z'],
  // A skateboard deck from above, with its truck bolts (My week).
  deck: ['M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', 'M10 7h.01', 'M14 7h.01', 'M10 17h.01', 'M14 17h.01'],
  // Dock glyphs (B2 frames): a skateboard from the side, a wave curl, a closed book, a TV.
  skate: ['M2.5 12.5h19a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z', 'M7 18.5a1.5 1.5 0 1 0 0-.01', 'M17 18.5a1.5 1.5 0 1 0 0-.01', 'M7 14.5v2.5', 'M17 14.5v2.5'],
  wave: ['M2.5 17c3.5 0 4.5-9 10-9 3.2 0 5 2.1 5 4.3 0 1.8-1.3 3.2-3 3.2-1.4 0-2.4-1-2.4-2.3', 'M2.5 20.5h19'],
  bookClosed: ['M6 3.5h12v14.5H7.5A1.5 1.5 0 0 0 6 19.5z', 'M6 19.5A1.5 1.5 0 0 0 7.5 21H18v-3', 'M9.5 7.5h5'],
  tv: ['M3.5 8h17v11h-17z', 'M8.5 3.5l3.5 4 3.5-4', 'M7 21h10'],
  gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'M5.3 5.3l2.1 2.1', 'M16.6 16.6l2.1 2.1', 'M5.3 18.7l2.1-2.1', 'M16.6 7.4l2.1-2.1'],
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 28, strokeWidth = 2.6, label }: { name: IconName; size?: number; strokeWidth?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------------
// coop/js/avatars.js
//
// Original inline-SVG avatars in one flat, calm style. No outlines,
// muted palette tuned to sit on the dark kid theme (#1A2230). All
// artwork is original; nothing here depends on a third-party asset,
// and no characters are copyrighted or trademarked.
//
// Kids pick their avatar in Parent Mode, browsing by pack. The choice
// is stored as `pack:id` in coop_profiles.avatar — for example:
//   animals:fox   dino:trex   xmas:santa   emoji:🦊
//
// Backward compat: plain legacy values (e.g. "lion", "bear") without
// a colon are treated as belonging to the animals pack.
// ------------------------------------------------------------------------

export const DEFAULT_AVATAR_ID = 'animals:fox';

// Every SVG uses viewBox 0 0 100 100 and paints on a background circle
// so all tiles look consistent at any size.
function bg(color) {
  return `<circle cx="50" cy="50" r="48" fill="${color}"/>`;
}

// ---------- ANIMALS ----------
const ANIMALS = [
  { id: 'fox', label: 'Fox', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2A3040')}
      <path d="M28 32 L38 22 L44 34 Z" fill="#D4936B"/>
      <path d="M72 32 L62 22 L56 34 Z" fill="#D4936B"/>
      <circle cx="50" cy="56" r="26" fill="#D4936B"/>
      <path d="M36 60 Q50 74 64 60 Q64 78 50 82 Q36 78 36 60 Z" fill="#F0DCC0"/>
      <circle cx="42" cy="52" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="52" r="2.6" fill="#2A3040"/>
      <ellipse cx="50" cy="65" rx="2.8" ry="2" fill="#2A3040"/>
    </svg>` },
  { id: 'owl', label: 'Owl', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#4A5A47')}
      <ellipse cx="50" cy="56" rx="30" ry="30" fill="#8B7355"/>
      <circle cx="40" cy="48" r="11" fill="#F5E9D8"/>
      <circle cx="60" cy="48" r="11" fill="#F5E9D8"/>
      <circle cx="40" cy="48" r="5" fill="#2A3040"/>
      <circle cx="60" cy="48" r="5" fill="#2A3040"/>
      <path d="M46 58 L54 58 L50 65 Z" fill="#D4936B"/>
      <ellipse cx="50" cy="72" rx="14" ry="8" fill="#B89B7E"/>
    </svg>` },
  { id: 'bear', label: 'Bear', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A4238')}
      <circle cx="28" cy="30" r="9" fill="#8B6F55"/>
      <circle cx="72" cy="30" r="9" fill="#8B6F55"/>
      <circle cx="28" cy="30" r="4.5" fill="#B89B7E"/>
      <circle cx="72" cy="30" r="4.5" fill="#B89B7E"/>
      <circle cx="50" cy="55" r="28" fill="#8B6F55"/>
      <ellipse cx="50" cy="64" rx="14" ry="10" fill="#F0DCC0"/>
      <circle cx="42" cy="50" r="2.8" fill="#2A3040"/>
      <circle cx="58" cy="50" r="2.8" fill="#2A3040"/>
      <ellipse cx="50" cy="60" rx="2.8" ry="2" fill="#2A3040"/>
    </svg>` },
  { id: 'whale', label: 'Whale', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#324457')}
      <ellipse cx="50" cy="56" rx="32" ry="24" fill="#7BA6C4"/>
      <ellipse cx="50" cy="62" rx="20" ry="14" fill="#B8D2E2"/>
      <path d="M82 46 Q92 40 90 52 Q92 60 82 56 Z" fill="#7BA6C4"/>
      <ellipse cx="50" cy="30" rx="3" ry="1.6" fill="#4E7893"/>
      <path d="M50 32 Q46 26 48 22 M50 32 Q54 26 52 22" stroke="#B8D2E2" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="42" cy="52" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="52" r="2.6" fill="#2A3040"/>
    </svg>` },
  { id: 'lion', label: 'Lion', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#42392E')}
      <g fill="#B89468">
        <circle cx="50" cy="52" r="30"/>
        <circle cx="24" cy="42" r="8"/><circle cx="30" cy="26" r="8"/>
        <circle cx="50" cy="20" r="8"/><circle cx="70" cy="26" r="8"/>
        <circle cx="76" cy="42" r="8"/><circle cx="80" cy="60" r="8"/>
        <circle cx="76" cy="76" r="8"/><circle cx="50" cy="82" r="8"/>
        <circle cx="24" cy="76" r="8"/><circle cx="20" cy="60" r="8"/>
      </g>
      <circle cx="50" cy="54" r="22" fill="#E4C480"/>
      <ellipse cx="50" cy="62" rx="10" ry="7" fill="#F0DCC0"/>
      <circle cx="42" cy="52" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="52" r="2.6" fill="#2A3040"/>
      <ellipse cx="50" cy="60" rx="2.6" ry="1.8" fill="#2A3040"/>
    </svg>` },
  { id: 'penguin', label: 'Penguin', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E4152')}
      <ellipse cx="50" cy="56" rx="28" ry="32" fill="#3A4A5E"/>
      <ellipse cx="50" cy="62" rx="18" ry="22" fill="#F0DCC0"/>
      <circle cx="42" cy="44" r="3" fill="#2A3040"/>
      <circle cx="58" cy="44" r="3" fill="#2A3040"/>
      <path d="M45 52 L55 52 L50 58 Z" fill="#D89460"/>
      <ellipse cx="34" cy="82" rx="6" ry="3" fill="#D89460"/>
      <ellipse cx="66" cy="82" rx="6" ry="3" fill="#D89460"/>
    </svg>` },
  { id: 'rabbit', label: 'Rabbit', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A3F4A')}
      <ellipse cx="38" cy="22" rx="5" ry="18" fill="#EFEBE0"/>
      <ellipse cx="62" cy="22" rx="5" ry="18" fill="#EFEBE0"/>
      <ellipse cx="38" cy="24" rx="2.5" ry="12" fill="#F0B5C4"/>
      <ellipse cx="62" cy="24" rx="2.5" ry="12" fill="#F0B5C4"/>
      <circle cx="50" cy="58" r="26" fill="#EFEBE0"/>
      <circle cx="41" cy="54" r="2.6" fill="#2A3040"/>
      <circle cx="59" cy="54" r="2.6" fill="#2A3040"/>
      <ellipse cx="50" cy="62" rx="2.6" ry="1.8" fill="#F0B5C4"/>
      <path d="M45 66 Q50 70 55 66" stroke="#2A3040" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },
  { id: 'octopus', label: 'Octopus', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E2E44')}
      <ellipse cx="50" cy="42" rx="28" ry="26" fill="#B58DC9"/>
      <path d="M24 56 Q18 72 24 82 Q30 74 30 62 Z" fill="#B58DC9"/>
      <path d="M36 62 Q32 78 40 86 Q44 74 42 62 Z" fill="#B58DC9"/>
      <path d="M50 66 Q50 82 58 84 Q60 74 54 62 Z" fill="#B58DC9"/>
      <path d="M64 62 Q68 78 60 86 Q56 74 58 62 Z" fill="#B58DC9"/>
      <path d="M76 56 Q82 72 76 82 Q70 74 70 62 Z" fill="#B58DC9"/>
      <circle cx="42" cy="40" r="3" fill="#2A3040"/>
      <circle cx="58" cy="40" r="3" fill="#2A3040"/>
      <path d="M45 50 Q50 54 55 50" stroke="#2A3040" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },
  { id: 'turtle', label: 'Turtle', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A4A3F')}
      <ellipse cx="50" cy="60" rx="30" ry="22" fill="#7FBFA4"/>
      <ellipse cx="50" cy="58" rx="24" ry="17" fill="#5B8968"/>
      <circle cx="38" cy="52" r="4" fill="#7FBFA4"/>
      <circle cx="62" cy="52" r="4" fill="#7FBFA4"/>
      <circle cx="42" cy="66" r="4" fill="#7FBFA4"/>
      <circle cx="58" cy="66" r="4" fill="#7FBFA4"/>
      <ellipse cx="50" cy="34" rx="10" ry="8" fill="#B8D2A0"/>
      <circle cx="46" cy="33" r="1.8" fill="#2A3040"/>
      <circle cx="54" cy="33" r="1.8" fill="#2A3040"/>
    </svg>` },
  { id: 'elephant', label: 'Elephant', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A3F4A')}
      <circle cx="22" cy="52" r="14" fill="#A0A2A9"/>
      <circle cx="78" cy="52" r="14" fill="#A0A2A9"/>
      <circle cx="22" cy="52" r="7" fill="#C6B8AE"/>
      <circle cx="78" cy="52" r="7" fill="#C6B8AE"/>
      <circle cx="50" cy="54" r="28" fill="#A0A2A9"/>
      <path d="M50 68 Q48 78 44 84 Q50 88 54 84 Q52 78 50 68 Z" fill="#A0A2A9"/>
      <circle cx="42" cy="50" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="50" r="2.6" fill="#2A3040"/>
    </svg>` },
  { id: 'bee', label: 'Bee', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A3F2E')}
      <ellipse cx="30" cy="34" rx="14" ry="10" fill="#F0EBDC" opacity="0.85"/>
      <ellipse cx="70" cy="34" rx="14" ry="10" fill="#F0EBDC" opacity="0.85"/>
      <ellipse cx="50" cy="56" rx="26" ry="26" fill="#F5D782"/>
      <rect x="24" y="46" width="52" height="6" fill="#2A3040"/>
      <rect x="24" y="64" width="52" height="6" fill="#2A3040"/>
      <circle cx="42" cy="46" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="46" r="2.6" fill="#2A3040"/>
      <path d="M42 76 Q50 82 58 76" stroke="#2A3040" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },
  { id: 'puppy', label: 'Puppy', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A342E')}
      <ellipse cx="24" cy="48" rx="10" ry="18" fill="#B89468" transform="rotate(-16 24 48)"/>
      <ellipse cx="76" cy="48" rx="10" ry="18" fill="#B89468" transform="rotate(16 76 48)"/>
      <circle cx="50" cy="56" r="28" fill="#D4A578"/>
      <ellipse cx="50" cy="66" rx="14" ry="10" fill="#F0DCC0"/>
      <circle cx="42" cy="50" r="2.8" fill="#2A3040"/>
      <circle cx="58" cy="50" r="2.8" fill="#2A3040"/>
      <ellipse cx="50" cy="62" rx="3" ry="2.2" fill="#2A3040"/>
      <path d="M46 70 Q50 74 54 70 Q50 78 46 70 Z" fill="#F0B5C4"/>
    </svg>` }
];

// ---------- DINOSAURS ----------
const DINO = [
  { id: 'trex', label: 'T-Rex', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#324033')}
      <path d="M18 62 Q26 76 40 74 L58 74 Q78 70 82 56 Q82 40 66 34 Q52 30 42 34 Q30 40 26 50 Z" fill="#7FBFA4"/>
      <path d="M18 62 Q10 58 6 66 Q10 74 16 72 Z" fill="#7FBFA4"/>
      <path d="M50 52 Q64 52 68 60 Q60 66 46 62 Z" fill="#F0DCC0"/>
      <path d="M50 56 L52 60 M56 55 L57 60 M62 54 L62 60" stroke="#F0DCC0" stroke-width="0.8"/>
      <circle cx="72" cy="44" r="2.6" fill="#2A3040"/>
      <circle cx="72" cy="44" r="1" fill="#F0DCC0"/>
    </svg>` },
  { id: 'triceratops', label: 'Triceratops', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3E4A42')}
      <path d="M18 62 Q30 78 50 76 Q68 76 78 58 Q82 44 68 36 Q54 30 40 36 Q22 46 18 62 Z" fill="#9ABEA8"/>
      <path d="M40 42 Q50 22 60 42 Q68 40 74 42 Q68 32 62 26 Q50 20 38 26 Q32 32 26 42 Q32 40 40 42 Z" fill="#7FBFA4"/>
      <path d="M42 30 L38 18 L46 24 Z" fill="#F0DCC0"/>
      <path d="M58 30 L62 18 L54 24 Z" fill="#F0DCC0"/>
      <path d="M48 22 L50 12 L52 22 Z" fill="#F0DCC0"/>
      <circle cx="42" cy="52" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="52" r="2.6" fill="#2A3040"/>
    </svg>` },
  { id: 'stegosaurus', label: 'Stegosaurus', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A4238')}
      <path d="M14 66 Q22 76 40 74 L64 74 Q78 70 82 60 Q82 50 70 46 L30 46 Q18 52 14 66 Z" fill="#B89468"/>
      <path d="M84 60 Q92 58 90 68 Q88 74 84 70 Z" fill="#B89468"/>
      <path d="M24 46 L30 32 L36 46 Z" fill="#7FBFA4"/>
      <path d="M38 42 L46 28 L52 42 Z" fill="#7FBFA4"/>
      <path d="M54 42 L62 28 L68 42 Z" fill="#7FBFA4"/>
      <path d="M70 46 L76 34 L80 46 Z" fill="#7FBFA4"/>
      <circle cx="22" cy="60" r="2.6" fill="#2A3040"/>
    </svg>` },
  { id: 'brachiosaurus', label: 'Brachiosaurus', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#333F44')}
      <ellipse cx="52" cy="70" rx="32" ry="18" fill="#7BA6C4"/>
      <path d="M56 72 Q66 46 70 26 Q74 20 78 24 Q78 40 68 60 Q64 74 56 72 Z" fill="#7BA6C4"/>
      <circle cx="74" cy="22" r="6" fill="#7BA6C4"/>
      <circle cx="76" cy="21" r="1.6" fill="#2A3040"/>
    </svg>` },
  { id: 'pterodactyl', label: 'Pterodactyl', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#40384A')}
      <path d="M50 46 Q22 30 12 44 Q30 52 46 54 Z" fill="#C6B8E5"/>
      <path d="M50 46 Q78 30 88 44 Q70 52 54 54 Z" fill="#C6B8E5"/>
      <ellipse cx="50" cy="54" rx="10" ry="12" fill="#B58DC9"/>
      <path d="M50 42 L58 26 L46 34 Z" fill="#B58DC9"/>
      <circle cx="47" cy="54" r="2.4" fill="#2A3040"/>
      <path d="M42 60 L36 66 L42 64 Z" fill="#F0DCC0"/>
    </svg>` },
  { id: 'egg', label: 'Baby dino', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A3F4A')}
      <path d="M28 62 Q28 88 50 88 Q72 88 72 62 L68 66 L64 60 L60 66 L56 60 L52 66 L48 60 L44 66 L40 60 L36 66 L32 60 Z" fill="#F0DCC0"/>
      <circle cx="50" cy="46" r="18" fill="#7FBFA4"/>
      <circle cx="44" cy="44" r="2.6" fill="#2A3040"/>
      <circle cx="56" cy="44" r="2.6" fill="#2A3040"/>
      <path d="M46 52 Q50 55 54 52" stroke="#2A3040" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M40 30 L44 22 L48 30 M52 30 L56 22 L60 30" stroke="#5B8968" stroke-width="2" fill="none" stroke-linejoin="round"/>
    </svg>` }
];

// ---------- CHRISTMAS ----------
const XMAS = [
  { id: 'santa', label: 'Santa', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E3A44')}
      <path d="M22 34 Q26 12 50 12 Q74 12 78 34 L74 30 Q64 22 50 22 Q36 22 26 30 Z" fill="#D89896"/>
      <circle cx="76" cy="30" r="6" fill="#F5E9D8"/>
      <circle cx="50" cy="54" r="24" fill="#F0DCC0"/>
      <path d="M22 60 Q34 90 50 92 Q66 90 78 60 Q60 78 50 78 Q40 78 22 60 Z" fill="#F5E9D8"/>
      <circle cx="42" cy="52" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="52" r="2.6" fill="#2A3040"/>
      <ellipse cx="50" cy="60" rx="4" ry="3" fill="#D89896"/>
    </svg>` },
  { id: 'reindeer', label: 'Reindeer', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E3A2E')}
      <path d="M18 24 L26 18 L26 30 M26 30 L18 34 M26 30 L34 26 M34 26 L34 18 M34 26 L40 22" stroke="#8B6F55" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M82 24 L74 18 L74 30 M74 30 L82 34 M74 30 L66 26 M66 26 L66 18 M66 26 L60 22" stroke="#8B6F55" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="50" cy="56" r="28" fill="#8B6F55"/>
      <ellipse cx="50" cy="66" rx="14" ry="10" fill="#F0DCC0"/>
      <circle cx="42" cy="52" r="2.8" fill="#2A3040"/>
      <circle cx="58" cy="52" r="2.8" fill="#2A3040"/>
      <circle cx="50" cy="66" r="5" fill="#D89896"/>
    </svg>` },
  { id: 'snowman', label: 'Snowman', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E4152')}
      <ellipse cx="50" cy="76" rx="24" ry="14" fill="#F5E9D8"/>
      <circle cx="50" cy="54" r="18" fill="#F5E9D8"/>
      <path d="M28 30 L72 30 L72 24 L28 24 Z M40 30 L60 30 L60 20 L40 20 Z" fill="#2A3040"/>
      <path d="M40 20 L60 20 L60 16 L40 16 Z" fill="#D89896"/>
      <circle cx="44" cy="52" r="2.6" fill="#2A3040"/>
      <circle cx="56" cy="52" r="2.6" fill="#2A3040"/>
      <path d="M48 58 L56 60 L48 62 Z" fill="#D89460"/>
      <circle cx="46" cy="66" r="1.4" fill="#2A3040"/>
      <circle cx="50" cy="66" r="1.4" fill="#2A3040"/>
      <circle cx="54" cy="66" r="1.4" fill="#2A3040"/>
    </svg>` },
  { id: 'elf', label: 'Elf', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E4232')}
      <path d="M22 42 Q34 4 50 4 Q66 4 78 42 Q66 34 50 34 Q34 34 22 42 Z" fill="#5B8968"/>
      <circle cx="78" cy="8" r="6" fill="#F5E9D8"/>
      <circle cx="50" cy="56" r="26" fill="#F0DCC0"/>
      <path d="M22 44 Q28 46 30 44 M70 44 Q72 46 78 44" fill="#5B8968"/>
      <path d="M22 56 L14 58 L22 62 Z" fill="#F0DCC0"/>
      <path d="M78 56 L86 58 L78 62 Z" fill="#F0DCC0"/>
      <circle cx="42" cy="54" r="2.6" fill="#2A3040"/>
      <circle cx="58" cy="54" r="2.6" fill="#2A3040"/>
      <path d="M42 66 Q50 72 58 66" stroke="#2A3040" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <circle cx="36" cy="62" r="3" fill="#F0B5C4" opacity="0.7"/>
      <circle cx="64" cy="62" r="3" fill="#F0B5C4" opacity="0.7"/>
    </svg>` },
  { id: 'gingerbread', label: 'Gingerbread', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A2E24')}
      <circle cx="50" cy="34" r="16" fill="#B57944"/>
      <path d="M22 60 Q22 52 30 52 L44 52 L44 84 L28 84 Q22 82 22 60 Z" fill="#B57944"/>
      <path d="M78 60 Q78 52 70 52 L56 52 L56 84 L72 84 Q78 82 78 60 Z" fill="#B57944"/>
      <rect x="42" y="50" width="16" height="34" fill="#B57944"/>
      <circle cx="44" cy="32" r="2.4" fill="#2A3040"/>
      <circle cx="56" cy="32" r="2.4" fill="#2A3040"/>
      <path d="M44 40 Q50 44 56 40" stroke="#2A3040" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="50" cy="62" r="2.4" fill="#F5E9D8"/>
      <circle cx="50" cy="72" r="2.4" fill="#F5E9D8"/>
      <path d="M22 46 Q30 42 44 46 M78 46 Q70 42 56 46" stroke="#F5E9D8" stroke-width="1.6" fill="none"/>
    </svg>` },
  { id: 'penguin-hat', label: 'Penguin (hat)', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E3A44')}
      <ellipse cx="50" cy="60" rx="26" ry="30" fill="#3A4A5E"/>
      <ellipse cx="50" cy="66" rx="17" ry="20" fill="#F0DCC0"/>
      <path d="M22 34 Q28 12 52 16 Q68 20 74 28 L28 36 Z" fill="#D89896"/>
      <path d="M20 32 L74 32 L74 38 L20 38 Z" fill="#F5E9D8"/>
      <circle cx="72" cy="14" r="6" fill="#F5E9D8"/>
      <circle cx="42" cy="48" r="2.8" fill="#2A3040"/>
      <circle cx="58" cy="48" r="2.8" fill="#2A3040"/>
      <path d="M45 56 L55 56 L50 62 Z" fill="#D89460"/>
    </svg>` }
];

// ---------- EASTER & SPRING ----------
const SPRING = [
  { id: 'bunny', label: 'Easter Bunny', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3E4A44')}
      <ellipse cx="38" cy="22" rx="5" ry="18" fill="#F5E9D8"/>
      <ellipse cx="62" cy="22" rx="5" ry="18" fill="#F5E9D8"/>
      <ellipse cx="38" cy="24" rx="2.5" ry="12" fill="#F0B5C4"/>
      <ellipse cx="62" cy="24" rx="2.5" ry="12" fill="#F0B5C4"/>
      <circle cx="50" cy="58" r="26" fill="#F5E9D8"/>
      <circle cx="41" cy="54" r="2.6" fill="#2A3040"/>
      <circle cx="59" cy="54" r="2.6" fill="#2A3040"/>
      <ellipse cx="50" cy="62" rx="2.6" ry="1.8" fill="#F0B5C4"/>
      <path d="M28 46 L26 40 L32 44 M32 42 L36 40 L34 46 Z" fill="#F0B5C4"/>
      <path d="M26 44 Q26 50 32 48 Q34 44 30 40 Q26 40 26 44 Z" fill="#F0B5C4"/>
    </svg>` },
  { id: 'chick', label: 'Chick', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3F3F2E')}
      <path d="M44 16 L48 10 L50 18 L52 10 L56 16 Z" fill="#E4C480"/>
      <circle cx="50" cy="56" r="30" fill="#F5D782"/>
      <path d="M18 54 Q22 46 32 50 Q26 62 20 60 Z" fill="#E4C480"/>
      <path d="M82 54 Q78 46 68 50 Q74 62 80 60 Z" fill="#E4C480"/>
      <circle cx="42" cy="52" r="2.8" fill="#2A3040"/>
      <circle cx="58" cy="52" r="2.8" fill="#2A3040"/>
      <path d="M46 60 L54 60 L50 66 Z" fill="#D89460"/>
      <ellipse cx="42" cy="86" rx="3" ry="1.6" fill="#D89460"/>
      <ellipse cx="58" cy="86" rx="3" ry="1.6" fill="#D89460"/>
    </svg>` },
  { id: 'lamb', label: 'Lamb', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A4A3F')}
      <g fill="#F5E9D8">
        <circle cx="30" cy="46" r="10"/>
        <circle cx="30" cy="62" r="10"/>
        <circle cx="70" cy="46" r="10"/>
        <circle cx="70" cy="62" r="10"/>
        <circle cx="40" cy="38" r="10"/>
        <circle cx="60" cy="38" r="10"/>
        <circle cx="50" cy="30" r="10"/>
        <circle cx="40" cy="72" r="10"/>
        <circle cx="60" cy="72" r="10"/>
        <circle cx="50" cy="80" r="10"/>
        <circle cx="50" cy="56" r="18"/>
      </g>
      <circle cx="50" cy="56" r="14" fill="#B89B7E"/>
      <ellipse cx="38" cy="60" rx="6" ry="5" fill="#F0B5C4" opacity="0.6"/>
      <ellipse cx="62" cy="60" rx="6" ry="5" fill="#F0B5C4" opacity="0.6"/>
      <circle cx="44" cy="55" r="2" fill="#2A3040"/>
      <circle cx="56" cy="55" r="2" fill="#2A3040"/>
      <ellipse cx="50" cy="63" rx="2" ry="1.4" fill="#2A3040"/>
    </svg>` },
  { id: 'easter-egg', label: 'Decorated egg', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A3F4A')}
      <path d="M30 60 Q30 20 50 20 Q70 20 70 60 Q70 88 50 88 Q30 88 30 60 Z" fill="#F0DCC0"/>
      <path d="M30 40 Q50 32 70 40" stroke="#C6B8E5" stroke-width="4" fill="none"/>
      <path d="M30 56 Q50 66 70 56" stroke="#F0B5C4" stroke-width="4" fill="none"/>
      <path d="M30 72 Q50 62 70 72" stroke="#7FBFA4" stroke-width="4" fill="none"/>
      <circle cx="42" cy="30" r="2.2" fill="#F5D782"/>
      <circle cx="58" cy="30" r="2.2" fill="#F5D782"/>
      <circle cx="38" cy="80" r="2.2" fill="#F5D782"/>
      <circle cx="62" cy="80" r="2.2" fill="#F5D782"/>
    </svg>` }
];

// ---------- HALLOWEEN & FALL ----------
const FALL = [
  { id: 'pumpkin', label: 'Pumpkin', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A2E24')}
      <ellipse cx="26" cy="58" rx="12" ry="24" fill="#E48540"/>
      <ellipse cx="74" cy="58" rx="12" ry="24" fill="#E48540"/>
      <ellipse cx="38" cy="58" rx="14" ry="26" fill="#F09E58"/>
      <ellipse cx="62" cy="58" rx="14" ry="26" fill="#F09E58"/>
      <ellipse cx="50" cy="58" rx="16" ry="28" fill="#F4B370"/>
      <path d="M48 30 Q52 20 58 24 Q62 30 56 34" stroke="#5B8968" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M40 56 L36 62 L44 62 Z" fill="#2A3040"/>
      <path d="M60 56 L56 62 L64 62 Z" fill="#2A3040"/>
      <path d="M40 72 Q50 78 60 72 L54 72 L52 76 L48 76 L46 72 Z" fill="#2A3040"/>
    </svg>` },
  { id: 'ghost', label: 'Ghost', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E3244')}
      <path d="M22 50 Q22 20 50 20 Q78 20 78 50 V80 Q74 74 70 80 Q66 74 62 80 Q58 74 54 80 Q50 74 46 80 Q42 74 38 80 Q34 74 30 80 Q26 74 22 80 Z" fill="#F0EBE0"/>
      <circle cx="40" cy="48" r="4" fill="#2A3040"/>
      <circle cx="60" cy="48" r="4" fill="#2A3040"/>
      <ellipse cx="50" cy="62" rx="4" ry="5" fill="#2A3040"/>
      <ellipse cx="30" cy="58" rx="4" ry="3" fill="#F0B5C4" opacity="0.7"/>
      <ellipse cx="70" cy="58" rx="4" ry="3" fill="#F0B5C4" opacity="0.7"/>
    </svg>` },
  { id: 'black-cat', label: 'Black cat', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A3244')}
      <path d="M24 34 L30 16 L44 32 Z" fill="#2A2432"/>
      <path d="M76 34 L70 16 L56 32 Z" fill="#2A2432"/>
      <circle cx="50" cy="56" r="30" fill="#2A2432"/>
      <ellipse cx="50" cy="66" rx="14" ry="10" fill="#4E4658"/>
      <ellipse cx="42" cy="52" rx="4" ry="6" fill="#B8E060"/>
      <ellipse cx="58" cy="52" rx="4" ry="6" fill="#B8E060"/>
      <ellipse cx="42" cy="52" rx="1.2" ry="4" fill="#2A2432"/>
      <ellipse cx="58" cy="52" rx="1.2" ry="4" fill="#2A2432"/>
      <path d="M46 62 L54 62 L50 68 Z" fill="#F0B5C4"/>
      <path d="M20 56 L32 58 M20 62 L32 62 M80 56 L68 58 M80 62 L68 62" stroke="#F5E9D8" stroke-width="1" opacity="0.7"/>
    </svg>` },
  { id: 'owl-moon', label: 'Owl with moon', svg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#2E3244')}
      <path d="M82 30 A26 26 0 1 0 82 74 A20 20 0 1 1 82 30 Z" fill="#F5D782"/>
      <ellipse cx="42" cy="60" rx="22" ry="24" fill="#8B6F55"/>
      <circle cx="34" cy="52" r="8" fill="#F0DCC0"/>
      <circle cx="50" cy="52" r="8" fill="#F0DCC0"/>
      <circle cx="34" cy="52" r="4" fill="#2A3040"/>
      <circle cx="50" cy="52" r="4" fill="#2A3040"/>
      <path d="M38 60 L46 60 L42 66 Z" fill="#D89460"/>
    </svg>` }
];

// ---------- EMOJI (curated, kid-friendly) ----------
const EMOJI_LIST = [
  '🦊','🐻','🐼','🐨','🐰','🐭','🐹','🐢',
  '🐧','🦉','🐦','🦆','🐤','🐔','🦅','🐝',
  '🦋','🐛','🐌','🐙','🐳','🐬','🦈','🐠',
  '🦖','🦕','🐲','🐎','🐕','🐈','🐇','🐓',
  '🌸','🌻','🌈','⭐','🌙','☀️','⚡','🌍',
  '🍎','🍓','🍉','🍕','🍩','🎂','🎈','🎉',
  '🚀','⚽','🏀','🎨','🎧','🎸','🎁','❄️'
];
const EMOJI = EMOJI_LIST.map(e => ({ id: e, label: e, emoji: e }));

// Public catalogue.
export const PACKS = [
  { id: 'animals', label: 'Animals',        avatars: ANIMALS },
  { id: 'dino',    label: 'Dinosaurs',      avatars: DINO },
  { id: 'xmas',    label: 'Christmas',      avatars: XMAS },
  { id: 'spring',  label: 'Easter & Spring', avatars: SPRING },
  { id: 'fall',    label: 'Halloween & Fall', avatars: FALL },
  { id: 'emoji',   label: 'Emoji',          avatars: EMOJI }
];

// Legacy compatibility. Kept exports so any earlier import path still works.
export const AVATARS = ANIMALS;
export const AVATAR_META = ANIMALS.map(a => a.id);
export const AVATARS_BY_ID = Object.fromEntries(
  PACKS.flatMap(p => p.avatars.filter(a => a.svg).map(a => [`${p.id}:${a.id}`, a.svg]))
);
export const KID_COLORS = [
  { name: 'Coral',    color: '#FF8A65', soft: '#FFE5D9' },
  { name: 'Peach',    color: '#FFAB73', soft: '#FFE8D4' },
  { name: 'Butter',   color: '#F5B700', soft: '#FFF1C4' },
  { name: 'Sage',     color: '#81C784', soft: '#DDF0DE' },
  { name: 'Mint',     color: '#4DB6AC', soft: '#CFEBE7' },
  { name: 'Sky',      color: '#64B5F6', soft: '#D6EAFB' },
  { name: 'Lavender', color: '#B39DDB', soft: '#E6DEF2' },
  { name: 'Rose',     color: '#F06292', soft: '#FBD7E5' }
];

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c]));
}

// Return the SVG markup for an avatar spec. Handles:
//   pack:id       — pack-scoped avatar
//   emoji:X       — emoji glyph rendered inside a rounded square
//   legacy id     — with no colon, treated as animals:<id>
// Falls back to the default fox when the spec doesn't resolve.
export function avatarSvg(spec) {
  const s = spec || DEFAULT_AVATAR_ID;
  const idx = s.indexOf(':');
  const packId = idx >= 0 ? s.slice(0, idx) : 'animals';
  const itemId = idx >= 0 ? s.slice(idx + 1) : s;
  if (packId === 'emoji') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('#3A3F4A')}<text x="50" y="66" text-anchor="middle" font-size="56" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',system-ui">${escapeXml(itemId)}</text></svg>`;
  }
  const pack = PACKS.find(p => p.id === packId);
  const item = pack?.avatars.find(a => a.id === itemId);
  if (item && item.svg) return item.svg;
  // Fallback
  const def = PACKS[0].avatars[0];
  return def.svg;
}

// Convenience for legacy call sites that expected { __svg }.
export function avatarEl(id) { return { __svg: avatarSvg(id) }; }

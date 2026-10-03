// Weekly deck designs (docs/stickers-and-holidays.md "Weekly decks"). Slice 5 draws the first
// parametric template, Sunset Stripes; slice 8 adds the other designs. Until then any other
// design draws as Sunset Stripes under its own name (REVIEW.md V8).

export type DeckDesign = { name: string; stripes: string[] };

const DESIGNS: Record<string, DeckDesign> = {
  // Three bands over the kid's color, ink rules between (B2 frames).
  'sunset-stripes': { name: 'Sunset Stripes', stripes: ['var(--yellow)', 'var(--orange)', 'var(--magenta)'] },
};

export function deckDesign(key: string | null | undefined): DeckDesign {
  const d = key ? DESIGNS[key] : undefined;
  if (d) return d;
  const name = key ? key.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : DESIGNS['sunset-stripes']!.name;
  return { ...DESIGNS['sunset-stripes']!, name };
}

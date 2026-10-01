import type { ArtKey } from '../../art/art';
import type { Feeling } from '../../lib/types';

/** The Wave Check scale (CLAUDE.md): surf word, plain feeling word, a face, a color. */
export const FEELINGS: { key: Feeling; surf: string; words: string; spoken: string; color: string; art: ArtKey }[] = [
  { key: 'pumping', surf: 'Pumping', words: 'Happy, excited', spoken: 'Pumping. Happy or excited?', color: 'var(--yellow)', art: 'pumping' },
  { key: 'rolling', surf: 'Rolling', words: 'Okay, calm', spoken: 'Rolling. Okay or calm?', color: 'var(--cyan)', art: 'rolling' },
  { key: 'flat', surf: 'Flat', words: 'Sad, tired', spoken: 'Flat. Sad or tired?', color: 'var(--lilac)', art: 'flat' },
  { key: 'choppy', surf: 'Choppy', words: 'Upset, mad', spoken: 'Choppy. Upset or mad?', color: 'var(--orange)', art: 'choppy' },
];

export const SIZES = ['A tiny bit', 'A little', 'Some', 'A lot', 'Huge'];

/** Things that help, for the reset plan. The turtle's shell comes first: its signature move. */
export const TOOLS: { key: string; art: ArtKey; label: string }[] = [
  { key: 'turtle', art: 'turtle', label: 'Go in my shell' },
  { key: 'balloon', art: 'balloon', label: 'Balloon breaths' },
  { key: 'teddy', art: 'teddy', label: 'Hug teddy' },
  { key: 'water', art: 'water', label: 'Drink water' },
  { key: 'crayon', art: 'crayon', label: 'Draw it' },
  { key: 'headphone', art: 'headphone', label: 'Music' },
  { key: 'tent', art: 'tent', label: 'Quiet spot' },
];

export const BODY_SIGNS: { key: string; art: ArtKey; label: string }[] = [
  { key: 'hot_face', art: 'hot_face', label: 'Hot face' },
  { key: 'heart', art: 'heart', label: 'Fast heart' },
  { key: 'huffing', art: 'huffing', label: 'Huffing' },
  { key: 'crying', art: 'crying', label: 'Tears' },
];

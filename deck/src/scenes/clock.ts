// Heads-up clock helpers (R3HeadsUp: eight chunks over the real two minutes).
export const HEADS_UP_TOTAL_MS = 120_000;
export const CHUNK_MS = 15_000;

/** Whole chunks left of eight, draining one every 15 s. */
export function chunksLeft(msLeft: number): number {
  return Math.max(0, Math.min(8, Math.ceil(msLeft / CHUNK_MS)));
}

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Whole-word, case-insensitive blocklist matcher.
// Shared between the browser (js/data.js display filter) and the
// scheduled sync function (netlify/functions/sync-youtube.js).
//
// Whole-word means "Chip" does not match "chocolate chip cookies" the
// wrong way (…wait, it does — Chip IS a whole word there). Whole-word
// means "Chip" does not match "microchip" or "chipmunk". That's the
// point: parents can block a character name without collateral damage
// to unrelated words that happen to contain the same letters.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build a single compiled regex from the keyword list. `\b` uses ASCII
// word boundaries, which is fine for the English kid-content this app
// deals with. Empty keyword list → returns null (matches nothing).
export function compile(keywords) {
  const cleaned = (keywords || [])
    .map(k => (k || '').trim().toLowerCase())
    .filter(Boolean);
  if (cleaned.length === 0) return null;
  return new RegExp('\\b(?:' + cleaned.map(escapeRegex).join('|') + ')\\b', 'i');
}

export function matches(title, keywordsOrCompiled) {
  if (!title) return false;
  const re = keywordsOrCompiled instanceof RegExp
    ? keywordsOrCompiled
    : compile(keywordsOrCompiled);
  if (!re) return false;
  return re.test(title);
}

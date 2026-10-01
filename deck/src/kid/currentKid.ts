// Which kid is using the iPad right now. A PIN-protected profile stays open until someone
// switches profiles, so a reload doesn't ask again.
const KEY = 'deck.currentKid';

export function getCurrentKid(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCurrentKid(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

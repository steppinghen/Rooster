import { useEffect, useState } from 'react';
import { useKidStore } from './store';

/** Server-corrected "now", re-rendering every `everyMs`. */
export function useNow(everyMs = 1000): number {
  const { now } = useKidStore();
  const [t, setT] = useState(() => now());
  useEffect(() => {
    const id = setInterval(() => setT(now()), everyMs);
    return () => clearInterval(id);
  }, [now, everyMs]);
  return t;
}

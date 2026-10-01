import { useEffect, useState } from 'react';
import type { Ground } from './volume';

/** Follows the phone's or iPad's light/dark setting (parents' phones keep their own choice). */
export function usePreferredGround(): Ground {
  const query = '(prefers-color-scheme: light)';
  const [ground, setGround] = useState<Ground>(() => (window.matchMedia?.(query).matches ? 'day' : 'night'));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setGround(mq.matches ? 'day' : 'night');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return ground;
}

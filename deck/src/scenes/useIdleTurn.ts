import { useEffect, useRef, useState } from 'react';
import type { Mascot, Pose } from '../art/mascots';
import { useTheme } from '../theme/ThemeScope';

// Idle moves (R3Idle): which frame each mascot swaps to, and when.
export const IDLE: Record<Mascot, { alt: Pose; ats: number[]; total: number }> = {
  rooster: { alt: 'idle-blink', ats: [0, 0.12, 0.24], total: 0.24 },
  dog: { alt: 'idle-tail', ats: [0, 0.16, 0.32], total: 0.32 },
  turtle: { alt: 'idle-blink', ats: [0, 0.6, 1.2], total: 1.2 },
};

/** Whose turn it is to idle: one mascot every 8–15 s, never two, never during a tap, never in focus. */
export function useIdleTurn(mascots: Mascot[], reduced: boolean): { who: Mascot | null; tick: number } {
  const { volume } = useTheme();
  const [turn, setTurn] = useState<{ who: Mascot | null; tick: number }>({ who: null, tick: 0 });
  const pressed = useRef(false);
  const key = mascots.join(',');
  useEffect(() => {
    const down = () => (pressed.current = true);
    const up = () => (pressed.current = false);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
    };
  }, []);
  useEffect(() => {
    if (reduced || volume === 'focus' || !mascots.length) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        if (!pressed.current) setTurn((p) => ({ who: mascots[Math.floor(Math.random() * mascots.length)]!, tick: p.tick + 1 }));
        schedule();
      }, 8000 + Math.random() * 7000);
    };
    schedule();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced, volume]);
  return turn;
}

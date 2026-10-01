import type { ReactNode } from 'react';
import type { Kid } from '../lib/types';
import { RootTheme } from '../theme/ThemeScope';
import { effectiveVolume, type Scene, type Volume } from '../theme/volume';
import { effectiveFocus, modeVolume } from './focus';
import { useKidStore } from './store';
import { useDeviceGround } from './useDeviceGround';
import { useNow } from './useNow';

/**
 * Sets volume and ground for a kid's screens, from data: the quieter of the kid's default and
 * their focus mode wins; Lights out (and Last Run, via `scene`) is always night.
 * `celebration` forces normal volume unless reduced motion is on.
 */
export function KidTheme({ kid, scene, volume: forced, children }: { kid: Kid; scene?: Scene; volume?: Volume; children: ReactNode }) {
  const { snapshot } = useKidStore();
  const now = useNow(15_000);
  const ground = useDeviceGround(snapshot!, now);
  const focus = effectiveFocus(snapshot!.focus.find((f) => f.kid_id === kid.id), now);
  const volume = forced ?? effectiveVolume(kid.default_volume, modeVolume(focus.mode));
  const effectiveScene: Scene = scene ?? (focus.mode === 'lights_out' ? 'lastrun' : 'default');
  return (
    <RootTheme ground={ground} volume={volume} scene={effectiveScene}>
      {children}
    </RootTheme>
  );
}

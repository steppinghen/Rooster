import { resolveGround, type GroundSetting } from '../theme/ground';
import { usePreferredGround } from '../theme/usePreferredGround';
import type { Snapshot } from './store';

export function useDeviceGround(snapshot: Snapshot, at: number) {
  const prefersLight = usePreferredGround() === 'day';
  return resolveGround((snapshot.device.ground as GroundSetting) ?? 'auto', {
    timezone: snapshot.family.timezone,
    at: new Date(at),
    morningStarts: snapshot.routines.filter((r) => r.slot === 'morning').map((r) => r.starts_at),
    bedtimeStarts: snapshot.routines.filter((r) => r.slot === 'bedtime').map((r) => r.starts_at),
    prefersLight,
  });
}


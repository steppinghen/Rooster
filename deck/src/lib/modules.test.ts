import { describe, expect, it } from 'vitest';
import { kidVisibleModules, type ResolvedModule } from './moduleRules';

const mod = (key: string, over: Partial<ResolvedModule> = {}): ResolvedModule => ({
  key,
  label: key,
  icon: 'star',
  audience: 'kid',
  removable: true,
  default_enabled: true,
  visible_in: ['everything'],
  sort_order: 0,
  enabled: true,
  settings: {},
  ...over,
});

const all = [
  mod('routines'),
  mod('wave_check', { removable: false, visible_in: ['everything', 'session', 'lights_out'] }),
  mod('session', { visible_in: ['everything', 'session'] }),
  mod('tour_dates', { audience: 'both' }),
  mod('today', { audience: 'parent', visible_in: [] }),
  mod('off', { enabled: false }),
];

describe('kidVisibleModules', () => {
  it('shows every enabled kid module in Everything, never parent modules or disabled ones', () => {
    expect(kidVisibleModules(all, 'everything').map((m) => m.key)).toEqual(['routines', 'wave_check', 'session', 'tour_dates']);
  });
  it('Session mode keeps learning plus Wave Check', () => {
    expect(kidVisibleModules(all, 'session').map((m) => m.key)).toEqual(['wave_check', 'session']);
  });
  it('Lights out leaves only Wave Check (breathing)', () => {
    expect(kidVisibleModules(all, 'lights_out').map((m) => m.key)).toEqual(['wave_check']);
  });
  it('Wave Check survives even a bad family switch', () => {
    expect(kidVisibleModules([mod('wave_check', { enabled: false, removable: false, visible_in: [] })], 'lights_out').map((m) => m.key)).toEqual(['wave_check']);
  });
});

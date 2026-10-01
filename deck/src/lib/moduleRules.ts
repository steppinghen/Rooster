import type { FocusMode, ModuleCatalogRow } from './types';

export type ResolvedModule = ModuleCatalogRow & { enabled: boolean; settings: Record<string, unknown> };

/**
 * Modules a kid can see right now. The most restrictive layer wins: family switch, then the
 * kid's focus mode (holds arrive in Phase 3). Wave Check is never removable.
 */
export function kidVisibleModules(modules: ResolvedModule[], mode: FocusMode): ResolvedModule[] {
  return modules.filter((m) => m.audience !== 'parent' && (m.key === 'wave_check' || (m.enabled && m.visible_in.includes(mode))));
}

export function parentModules(modules: ResolvedModule[]): ResolvedModule[] {
  return modules.filter((m) => m.audience !== 'kid' && m.enabled);
}

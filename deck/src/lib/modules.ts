import { supabase } from './supabase';
import { must } from './useAsync';
import type { ResolvedModule } from './moduleRules';
import type { FamilyModule, ModuleCatalogRow } from './types';

export { kidVisibleModules, parentModules, type ResolvedModule } from './moduleRules';

/** The catalog joined with this family's switches. Navigation is built from this, never hardcoded. */
export async function loadModules(familyId: string): Promise<ResolvedModule[]> {
  const [catalog, family] = await Promise.all([
    supabase.from('module_catalog').select('key, label, icon, audience, removable, default_enabled, visible_in, sort_order').order('sort_order'),
    supabase.from('family_modules').select('family_id, module_key, enabled, settings').eq('family_id', familyId),
  ]);
  const rows = must(catalog) as ModuleCatalogRow[];
  const switches = new Map((must(family) as FamilyModule[]).map((m) => [m.module_key, m]));
  return rows.map((c) => {
    const s = switches.get(c.key);
    return { ...c, enabled: c.removable ? (s?.enabled ?? false) : true, settings: s?.settings ?? {} };
  });
}

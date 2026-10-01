import { loadModules } from '../../../lib/modules';
import { supabase } from '../../../lib/supabase';
import { useAsync } from '../../../lib/useAsync';
import { Check, Notice } from '../../../ui/forms';
import { Panel } from '../../../ui/surfaces';
import { useState } from 'react';

/**
 * Which modules this household uses at all (the first of the three access layers). Wave Check
 * can't be switched off: feelings are never locked out.
 */
export function ModulesSection({ familyId }: { familyId: string }) {
  const mods = useAsync(() => loadModules(familyId), [familyId]);
  const [error, setError] = useState<string | null>(null);
  const kidFacing = (mods.data ?? []).filter((m) => m.audience !== 'parent');

  async function toggle(key: string, enabled: boolean) {
    setError(null);
    if (mods.data) mods.setData(mods.data.map((m) => (m.key === key ? { ...m, enabled } : m)));
    // Update the family's row; insert it only if this module is newer than the family.
    const upd = await supabase.from('family_modules').update({ enabled }).eq('family_id', familyId).eq('module_key', key).select('module_key');
    let error = upd.error;
    if (!error && !upd.data?.length) error = (await supabase.from('family_modules').insert({ family_id: familyId, module_key: key, enabled })).error;
    if (error) setError(error.message);
    void mods.reload();
  }

  return (
    <Panel className="p-section">
      <h2 className="p-section__title">Modules</h2>
      <p className="dk-muted">What the kids see on their iPads. Hidden modules disappear completely; they aren't greyed out.</p>
      {kidFacing.map((m) => (
        <div key={m.key} className="p-row" data-testid={`module-${m.key}`}>
          {m.removable ? (
            <Check label={m.label} checked={m.enabled} onChange={(v) => void toggle(m.key, v)} />
          ) : (
            <span className="dk-check">
              <span>{m.label}</span>
              <span className="p-badge p-badge--muted">Always on</span>
            </span>
          )}
        </div>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}

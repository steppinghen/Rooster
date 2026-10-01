import { useCallback } from 'react';
import { newId } from '../lib/id';
import { useKidStore } from './store';

/** Usage snapshots: what was touched and for how long, never content (CLAUDE.md "Usage snapshots"). */
export function useLogUsage(kidId: string | null) {
  const { snapshot, enqueue } = useKidStore();
  const familyId = snapshot?.family.id;
  return useCallback(
    (module_key: string, action: 'opened' | 'completed' | 'abandoned' | 'skipped', target_id: string | null = null, duration_ms: number | null = null) => {
      if (!familyId) return;
      // Usage is a side note: it must never stop the tap it's logging (e.g. opening Wave Check).
      try {
        enqueue({ kind: 'usage', key: newId(), row: { family_id: familyId, kid_id: kidId, module_key, action, target_id, duration_ms } });
      } catch (e) {
        console.warn('usage log skipped', e);
      }
    },
    [familyId, kidId, enqueue],
  );
}

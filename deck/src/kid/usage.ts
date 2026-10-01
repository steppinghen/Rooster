import { useCallback } from 'react';
import { useKidStore } from './store';

/** Usage snapshots: what was touched and for how long, never content (CLAUDE.md "Usage snapshots"). */
export function useLogUsage(kidId: string | null) {
  const { snapshot, enqueue } = useKidStore();
  const familyId = snapshot?.family.id;
  return useCallback(
    (module_key: string, action: 'opened' | 'completed' | 'abandoned' | 'skipped', target_id: string | null = null, duration_ms: number | null = null) => {
      if (!familyId) return;
      enqueue({ kind: 'usage', key: crypto.randomUUID(), row: { family_id: familyId, kid_id: kidId, module_key, action, target_id, duration_ms } });
    },
    [familyId, kidId, enqueue],
  );
}

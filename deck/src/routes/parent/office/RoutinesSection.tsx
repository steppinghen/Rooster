import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { KID_COLUMNS, type Kid, type Routine } from '../../../lib/types';
import { must, useAsync } from '../../../lib/useAsync';
import { formatTime } from '../../../kid/routine';
import { PressButton } from '../../../ui/PressButton';
import { Panel } from '../../../ui/surfaces';
import { RoutineEditor } from './RoutineEditor';
import { SLOT_LABEL, TEMPLATES } from './routineTemplates';
import { ROUTINE_SELECT, toRoutine } from '../../../lib/routines';

/** Dawn Patrol, After School, Last Run: picture-step routines the kids follow on the iPad. */
export function RoutinesSection({ familyId }: { familyId: string }) {
  const data = useAsync(async () => {
    const [r, k] = await Promise.all([
      supabase.from('routines').select(ROUTINE_SELECT).eq('family_id', familyId).order('starts_at'),
      supabase.from('kids').select(KID_COLUMNS).eq('family_id', familyId).order('sort_order'),
    ]);
    return { routines: (must(r) as Parameters<typeof toRoutine>[0][]).map(toRoutine), kids: must(k) as Kid[] };
  }, [familyId]);
  const [editing, setEditing] = useState<{ routine: Routine | null; template: (typeof TEMPLATES)[number] } | null>(null);
  const routines = data.data?.routines ?? [];
  const kids = data.data?.kids ?? [];
  const nick = (id: string | null) => (id ? (kids.find((k) => k.id === id)?.nickname ?? 'one kid') : 'Everyone');

  return (
    <Panel className="p-section">
      <h2 className="p-section__title">Routines</h2>
      {routines.map((r) => (
        <div className="p-row" key={r.id} data-testid="routine-row">
          <div className="p-row__main">
            <span className="p-row__title">{r.name}</span>
            <span className="p-row__meta">
              {SLOT_LABEL[r.slot]} · {formatTime(r.starts_at)} · {r.kid_ids.length ? r.kid_ids.map(nick).join(', ') : nick(null)} · {r.steps.length} steps
            </span>
          </div>
          <PressButton small onClick={() => setEditing({ routine: r, template: TEMPLATES[0]! })}>
            Edit
          </PressButton>
        </div>
      ))}
      {routines.length === 0 && !data.loading && <p className="dk-muted">No routines yet. Start from one below and change anything.</p>}
      {editing ? (
        <RoutineEditor
          familyId={familyId}
          kids={kids}
          routine={editing.routine}
          draft={
            editing.routine
              ? { name: editing.routine.name, slot: editing.routine.slot, starts_at: editing.routine.starts_at, kid_id: editing.routine.kid_ids[0] ?? null, steps: editing.routine.steps }
              : { name: editing.template.name, slot: editing.template.slot, starts_at: editing.template.starts_at, kid_id: null, steps: editing.template.steps }
          }
          onDone={(changed) => {
            setEditing(null);
            if (changed) void data.reload();
          }}
        />
      ) : (
        <div className="p-actions">
          {TEMPLATES.map((t) => (
            <PressButton key={t.slot} variant="yellow" small onClick={() => setEditing({ routine: null, template: t })}>
              + {t.name}
            </PressButton>
          ))}
        </div>
      )}
    </Panel>
  );
}

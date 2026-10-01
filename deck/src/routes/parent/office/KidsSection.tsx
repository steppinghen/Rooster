import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { KID_COLUMNS, type Kid } from '../../../lib/types';
import { must, useAsync } from '../../../lib/useAsync';
import { KidAvatar } from '../../../ui/KidAvatar';
import { PressButton } from '../../../ui/PressButton';
import { Panel } from '../../../ui/surfaces';
import { KidEditor } from './KidEditor';

export function KidsSection({ familyId }: { familyId: string }) {
  const kids = useAsync(async () => must(await supabase.from('kids').select(KID_COLUMNS).eq('family_id', familyId).order('sort_order').order('created_at')) as Kid[], [familyId]);
  const [editing, setEditing] = useState<Kid | 'new' | null>(null);
  const list = kids.data ?? [];

  return (
    <Panel className="p-section">
      <h2 className="p-section__title">Team Riders</h2>
      {list.map((k) => (
        <div className="p-row" key={k.id} data-testid="kid-row">
          <KidAvatar nickname={k.nickname} avatar={k.avatar} accent={k.accent} size={52} />
          <div className="p-row__main">
            <span className="p-row__title">{k.nickname}</span>
            <span className="p-row__meta">
              {k.age_band === 'prereader' ? 'Pre-reader' : 'Reader'} · {k.default_volume === 'focus' ? 'Calm look' : 'Full comic'}
              {k.has_pin && ' · PIN'}
            </span>
          </div>
          <PressButton small onClick={() => setEditing(k)}>
            Edit
          </PressButton>
        </div>
      ))}
      {list.length === 0 && !kids.loading && <p className="dk-muted">No kids yet.</p>}
      {editing ? (
        <KidEditor
          familyId={familyId}
          kid={editing === 'new' ? null : editing}
          nextSort={list.length}
          onDone={(changed) => {
            setEditing(null);
            if (changed) void kids.reload();
          }}
        />
      ) : (
        <PressButton variant="yellow" onClick={() => setEditing('new')}>
          Add a kid
        </PressButton>
      )}
    </Panel>
  );
}

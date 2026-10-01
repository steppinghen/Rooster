import { useState, type FormEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../../lib/session';
import { Notice, TextField } from '../../../ui/forms';
import { PressButton } from '../../../ui/PressButton';
import { Panel } from '../../../ui/surfaces';

export function FamilySection({ familyId, name }: { familyId: string; name: string }) {
  const { refresh } = useSession();
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('families').update({ name: value.trim() }).eq('id', familyId);
    if (error) return setError(error.message);
    setSaved(true);
    void refresh();
  }

  return (
    <Panel className="p-section">
      <h2 className="p-section__title">Family</h2>
      <form onSubmit={save} className="p-actions" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <TextField label="Family name" maxLength={60} value={value} onChange={(e) => (setValue(e.target.value), setSaved(false))} />
        </div>
        <PressButton type="submit" disabled={!value.trim() || value.trim() === name}>
          Save
        </PressButton>
      </form>
      {saved && <Notice tone="ok">Saved.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}

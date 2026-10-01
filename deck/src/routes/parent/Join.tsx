import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { Notice, Segmented, TextField } from '../../ui/forms';
import { PressButton } from '../../ui/PressButton';
import { AuthLayout } from '../AuthLayout';

type Invite = { family_id: string; family_name: string };

/** Second parent: their email was added by the first parent. They pick the family explicitly. */
export function Join() {
  const { refresh, signOut } = useSession();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [familyId, setFamilyId] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc('my_invites').then(({ data, error }) => {
      if (error) return setError(error.message);
      const list = (data ?? []) as Invite[];
      setInvites(list);
      if (list[0]) setFamilyId(list[0].family_id);
    });
  }, []);

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('accept_invite', { p_family_id: familyId, p_display_name: displayName.trim() });
    setBusy(false);
    if (error) return setError("Couldn't join. " + error.message);
    await refresh();
  }

  return (
    <AuthLayout title="You're in" mascot="turtle">
      <form onSubmit={join} className="auth__card" style={{ padding: 0, border: 0, boxShadow: 'none', background: 'none' }}>
        {invites.length === 1 && (
          <p>
            You've been added to <strong>{invites[0]!.family_name}</strong>.
          </p>
        )}
        {invites.length > 1 && (
          <Segmented label="Which family?" value={familyId} onChange={setFamilyId} options={invites.map((i) => ({ value: i.family_id, label: i.family_name }))} />
        )}
        <TextField label="Your name in the app" required maxLength={24} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Parent B" hint="A nickname is fine." />
        {error && <Notice tone="error">{error}</Notice>}
        <PressButton variant="ink" block type="submit" disabled={busy || !displayName.trim() || !familyId}>
          {busy ? 'Joining…' : 'Join the family'}
        </PressButton>
        <button type="button" className="auth__link" onClick={() => void signOut()}>
          Sign out
        </button>
      </form>
    </AuthLayout>
  );
}

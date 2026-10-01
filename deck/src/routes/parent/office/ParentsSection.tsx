import { useState, type FormEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { must, useAsync } from '../../../lib/useAsync';
import { Notice, TextField } from '../../../ui/forms';
import { PressButton } from '../../../ui/PressButton';
import { Panel } from '../../../ui/surfaces';

type ParentRow = { user_id: string; display_name: string };
type Invite = { id: string; email: string; joined_at: string | null };

/**
 * Both parents are full parents. Inviting is just adding an email to the allowlist: the second
 * parent signs in with an email code and joins on first sign-in. No invite links.
 */
export function ParentsSection({ familyId, myUserId }: { familyId: string; myUserId: string }) {
  const data = useAsync(async () => {
    const [p, a] = await Promise.all([
      supabase.from('parents').select('user_id, display_name').eq('family_id', familyId).order('created_at'),
      supabase.from('parent_allowlist').select('id, email, joined_at').eq('family_id', familyId).is('joined_at', null).order('created_at'),
    ]);
    return { parents: must(p) as ParentRow[], invites: must(a) as Invite[] };
  }, [familyId]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('parent_allowlist').insert({ email: email.trim().toLowerCase(), family_id: familyId });
    setBusy(false);
    if (error) return setError(error.code === '23505' ? 'That email is already on your list.' : error.message);
    setEmail('');
    void data.reload();
  }

  async function cancel(id: string) {
    await supabase.from('parent_allowlist').delete().eq('id', id);
    void data.reload();
  }

  return (
    <Panel className="p-section">
      <h2 className="p-section__title">Grown-ups</h2>
      {data.data?.parents.map((p) => (
        <div className="p-row" key={p.user_id}>
          <div className="p-row__main">
            <span className="p-row__title">
              {p.display_name}
              {p.user_id === myUserId && ' (you)'}
            </span>
            <span className="p-row__meta">Parent</span>
          </div>
        </div>
      ))}
      {data.data?.invites.map((i) => (
        <div className="p-row" key={i.id} data-testid="invite-row">
          <div className="p-row__main">
            <span className="p-row__title">{i.email}</span>
            <span className="p-row__meta">Can sign in and join</span>
          </div>
          <PressButton small onClick={() => void cancel(i.id)}>
            Remove
          </PressButton>
        </div>
      ))}
      <form onSubmit={invite} className="p-actions" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <TextField label="Add a parent by email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent-b@example.com" />
        </div>
        <PressButton variant="yellow" type="submit" disabled={busy || !email.includes('@')}>
          Add
        </PressButton>
      </form>
      <p className="dk-muted">They sign in with that email and a code, set up their own second code, and they're in. Same powers as you.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}

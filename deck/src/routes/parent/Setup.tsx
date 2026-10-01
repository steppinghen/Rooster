import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { Notice, TextField } from '../../ui/forms';
import { PressButton } from '../../ui/PressButton';
import { AuthLayout } from '../AuthLayout';

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** First parent, first time: name the family. */
export function Setup() {
  const { refresh, signOut } = useSession();
  const [familyName, setFamilyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('create_family', { p_name: familyName.trim(), p_display_name: displayName.trim(), p_timezone: browserTimezone() });
    setBusy(false);
    if (error) return setError("Couldn't set up the family. " + error.message);
    await refresh();
  }

  return (
    <AuthLayout title="Welcome aboard" mascot="turtle">
      <form onSubmit={create} className="auth__card" style={{ padding: 0, border: 0, boxShadow: 'none', background: 'none' }}>
        <p>Let's set up your family's Deck.</p>
        <TextField label="Family name" required maxLength={60} value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Our family" hint="Shown at the top of the app. Keep it simple." />
        <TextField label="Your name in the app" required maxLength={24} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Parent A" hint="A nickname is fine." />
        {error && <Notice tone="error">{error}</Notice>}
        <PressButton variant="ink" block type="submit" disabled={busy || !familyName.trim() || !displayName.trim()}>
          {busy ? 'Setting up…' : 'Create our Deck'}
        </PressButton>
        <button type="button" className="auth__link" onClick={() => void signOut()}>
          Sign out
        </button>
      </form>
    </AuthLayout>
  );
}

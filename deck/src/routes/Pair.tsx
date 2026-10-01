import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { CodeField, Notice } from '../ui/forms';
import { PressButton } from '../ui/PressButton';
import { AuthLayout } from './AuthLayout';

const REASONS: Record<string, string> = {
  invalid_or_expired: "That code didn't work. Codes last 10 minutes and work once; get a fresh one on the phone.",
  too_many_attempts: 'Too many tries. Wait 10 minutes, then get a fresh code on the phone.',
  already_paired: 'This iPad is already paired.',
  not_a_device_session: 'Something went wrong. Reload and try again.',
};

/**
 * iPad side of pairing. The iPad gets its own anonymous identity, then trades the parent's
 * code for a device role in the family. It never holds a parent's powers.
 */
export function Pair() {
  const { refresh } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setBusy(false);
        return setError("Couldn't reach The Deck. Check the Wi-Fi and try again.");
      }
    }
    const { data, error } = await supabase.rpc('redeem_pairing_code', { p_code: code });
    setBusy(false);
    if (error) return setError("Couldn't reach The Deck. Check the Wi-Fi and try again.");
    const result = data as { ok: boolean; reason?: string };
    if (!result.ok) {
      setCode('');
      return setError(REASONS[result.reason ?? ''] ?? REASONS.invalid_or_expired!);
    }
    await refresh();
  }

  return (
    <AuthLayout title="Set up iPad" mascot="turtle">
      <form onSubmit={pair} className="auth__card" style={{ padding: 0, border: 0, boxShadow: 'none', background: 'none' }}>
        <p>
          On a parent's phone, open <strong>Back Office → Devices</strong> and tap <strong>Get a code</strong>. Type it here.
        </p>
        <CodeField label="Pairing code" length={8} value={code} onChange={setCode} autoFocus />
        {error && <Notice tone="error">{error}</Notice>}
        <PressButton variant="ink" block type="submit" disabled={busy || code.length !== 8}>
          {busy ? 'Pairing…' : 'Pair this iPad'}
        </PressButton>
      </form>
    </AuthLayout>
  );
}

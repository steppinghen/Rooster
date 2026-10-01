import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clearPending, readPending, savePending } from '../../lib/mfaPending';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { CodeField, Notice } from '../../ui/forms';
import { PressButton } from '../../ui/PressButton';
import { AuthLayout } from '../AuthLayout';

type Enrollment = { factorId: string; qr: string; secret: string; uri: string };

/**
 * TOTP for every parent. The database refuses parent actions without an aal2 session, so this
 * is a hard requirement, not a UI nicety.
 */
export function Mfa() {
  const { who, session, refresh, signOut } = useSession();
  const userId = session?.user.id ?? null;
  const enrolled = who.role === 'needs_mfa' && who.enrolled;
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Runs once per signed-in user (not on focus, visibility or token refresh): reuse a pending
  // enrollment if we still hold its secret, otherwise clear stale ones and enroll once.
  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setError(error.message);
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        clearPending();
        return setFactorId(verified.id);
      }
      const unverified = data.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified');
      const pending = readPending(userId);
      const reuse = pending && unverified.some((f) => f.id === pending.factorId) ? pending : null;
      // Stale half-finished enrollments (secret no longer known here) are removed.
      for (const f of unverified) {
        if (f.id !== reuse?.factorId) await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      if (reuse) {
        setEnrollment({ factorId: reuse.factorId, qr: reuse.qr, secret: reuse.secret, uri: reuse.uri });
        return setFactorId(reuse.factorId);
      }
      clearPending();
      const res = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'The Deck', issuer: 'The Deck' });
      if (res.error) return setError(res.error.message);
      const next = { factorId: res.data.id, qr: res.data.totp.qr_code, secret: res.data.totp.secret, uri: res.data.totp.uri };
      savePending({ ...next, userId, at: Date.now() });
      setEnrollment(next);
      setFactorId(res.data.id);
    })();
  }, [userId]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) {
      setError("That code didn't match. Codes change every 30 seconds; try the current one.");
      setCode('');
      return;
    }
    clearPending();
    await refresh();
  }

  return (
    <AuthLayout title={enrolled ? 'One more code' : 'Lock it down'}>
      <form onSubmit={verify} className="auth__card" style={{ padding: 0, border: 0, boxShadow: 'none', background: 'none' }}>
        {enrollment ? (
          <>
            <p>
              Parents use a second code from an authenticator app. On this iPhone, tap <strong>Add to Passwords</strong>; on another device, scan the code.
            </p>
            <a className="dk-btn dk-btn--yellow dk-btn--block" href={enrollment.uri}>
              Add to Passwords
            </a>
            <img className="auth__qr" src={enrollment.qr} alt="QR code for your authenticator app" />
            <p className="dk-muted">Or type this key:</p>
            <p className="auth__secret" data-testid="totp-secret">
              {enrollment.secret}
            </p>
          </>
        ) : enrolled ? (
          <p>Type the 6-digit code from your authenticator app for The Deck.</p>
        ) : (
          <p aria-busy="true">Setting up your second code…</p>
        )}
        <CodeField label="6-digit code" length={6} value={code} onChange={setCode} error={error} autoFocus={enrolled} />
        <PressButton variant="ink" block type="submit" disabled={busy || code.length !== 6 || !factorId}>
          {busy ? 'Checking…' : enrolled ? 'Continue' : 'Turn it on'}
        </PressButton>
        <button type="button" className="auth__link" onClick={() => void signOut()}>
          Sign out
        </button>
      </form>
      {error && !factorId && <Notice tone="error">{error}</Notice>}
    </AuthLayout>
  );
}

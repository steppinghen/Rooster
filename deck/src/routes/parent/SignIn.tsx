import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { CodeField, Notice, TextField } from '../../ui/forms';
import { PressButton } from '../../ui/PressButton';
import { AuthLayout } from '../AuthLayout';

const CODE_LENGTH = 6;
const RESEND_AFTER_S = 60;

/**
 * Email one-time code sign-in. No links anywhere: links open in Safari instead of the
 * installed PWA, whose storage is separate on iOS. Only allowlisted emails get a code
 * (the before_user_created hook rejects the rest).
 */
export function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      setError(
        error.status === 429
          ? 'Too many codes asked for. Wait a minute and try again.'
          : "We couldn't send a code to that email. If you're new here, ask the parent who set up The Deck to add your email.",
      );
      return;
    }
    setStep('code');
    setCode('');
    setResendIn(RESEND_AFTER_S);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
    setBusy(false);
    if (error) setError("That code didn't work. Check the newest email, or ask for a new code.");
    // On success the session listener routes onward (MFA next).
  }

  if (step === 'email') {
    return (
      <AuthLayout title="Sign in">
        <form onSubmit={sendCode} className="auth__card" style={{ padding: 0, border: 0, boxShadow: 'none', background: 'none' }}>
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" error={error} />
          <PressButton variant="ink" block type="submit" disabled={busy || !email.includes('@')}>
            {busy ? 'Sending…' : 'Email me a code'}
          </PressButton>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Check email">
      <form onSubmit={verify} className="auth__card" style={{ padding: 0, border: 0, boxShadow: 'none', background: 'none' }}>
        <p>
          We sent a {CODE_LENGTH}-digit code to <strong>{email}</strong>. Type it here; there's no link to tap.
        </p>
        <CodeField label="Code" length={CODE_LENGTH} value={code} onChange={setCode} autoFocus error={error} />
        <PressButton variant="ink" block type="submit" disabled={busy || code.length !== CODE_LENGTH}>
          {busy ? 'Checking…' : 'Sign in'}
        </PressButton>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="auth__link" onClick={() => setStep('email')}>
            Use a different email
          </button>
          <button type="button" className="auth__link" disabled={resendIn > 0 || busy} onClick={() => void sendCode()}>
            {resendIn > 0 ? `New code in ${resendIn}s` : 'Send a new code'}
          </button>
        </div>
      </form>
      {resendIn === RESEND_AFTER_S && <Notice tone="ok">Code sent.</Notice>}
    </AuthLayout>
  );
}

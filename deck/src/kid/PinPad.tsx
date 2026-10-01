import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Kid } from '../lib/types';
import { RootTheme } from '../theme/ThemeScope';
import type { Ground } from '../theme/volume';
import { Icon } from '../ui/Icon';
import { KidAvatar } from '../ui/KidAvatar';
import { PressButton } from '../ui/PressButton';
import { effectiveFocus } from './focus';
import { speak } from './speech';
import { useKidStore } from './store';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'clear'] as const;

/**
 * Four big keys deep. The hash compare happens in the database (verify_kid_pin); the iPad never
 * sees the hash. Wrong codes get a gentle retry, never a penalty.
 */
export function PinPad({ kid, ground, onCancel, onUnlocked }: { kid: Kid; ground: Ground; onCancel: () => void; onUnlocked: () => void }) {
  const { online, snapshot, now } = useKidStore();
  // A kid in Lights out gets the night ground here too.
  const lightsOut = effectiveFocus(snapshot?.focus.find((f) => f.kid_id === kid.id), now()).mode === 'lights_out';
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string>('Type your secret code');
  const [busy, setBusy] = useState(false);

  async function check(full: string) {
    setBusy(true);
    const { data, error } = await supabase.rpc('verify_kid_pin', { p_kid_id: kid.id, p_pin: full });
    setBusy(false);
    setPin('');
    if (error) {
      setMessage('The Deck is offline. Ask a grown-up.');
      return;
    }
    const r = data as { ok: boolean; reason?: string; retry_after_s?: number; tries_left?: number };
    if (r.ok) return onUnlocked();
    if (r.reason === 'locked') {
      const mins = Math.max(1, Math.ceil((r.retry_after_s ?? 300) / 60));
      setMessage(`Take a little break. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      speak('Take a little break, then try again.');
    } else {
      const left = r.tries_left ?? 0;
      const msg = left > 0 && left <= 2 ? `Not quite. ${left} more ${left === 1 ? 'try' : 'tries'}, then a little break.` : 'Not quite. Try again!';
      setMessage(msg);
      speak(msg);
    }
  }

  function press(key: (typeof KEYS)[number]) {
    if (busy) return;
    if (key === 'back') return setPin((p) => p.slice(0, -1));
    if (key === 'clear') return setPin('');
    const next = (pin + key).slice(0, 4);
    setPin(next);
    if (next.length === 4) void check(next);
  }

  return (
    <RootTheme ground={lightsOut ? 'night' : ground} volume="focus" scene={lightsOut ? 'lastrun' : 'default'}>
      <main className="kid kid--pin" data-audience="kid" data-age="prereader">
        <header className="kid__bar">
          <PressButton aria-label="Back to Who's riding" onClick={onCancel}>
            <Icon name="back" size={30} /> Back
          </PressButton>
          <span className="pin-who">
            <span className="pin-who__name">{kid.nickname}</span>
            <KidAvatar nickname={kid.nickname} avatar={kid.avatar} accent={kid.accent} size={80} />
          </span>
        </header>
        <div className="dk-card pin-card">
          <div className="pin-card__ask">
            <p className="pin-card__msg" aria-live="polite">
              {online ? message : 'The Deck is offline. Ask a grown-up to help.'}
            </p>
            <PressButton round aria-label="Read it to me" className="pin-card__speak" onClick={() => speak(online ? message : 'The Deck is offline. Ask a grown-up to help.')}>
              <Icon name="speaker" size={32} />
            </PressButton>
          </div>
          <div className="pin-dots" aria-label={`${pin.length} of 4 typed`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i < pin.length ? 'pin-dot pin-dot--on' : 'pin-dot'} style={{ '--accent': `var(--${kid.accent})` } as React.CSSProperties} />
            ))}
          </div>
          <div className="pin-keys">
            {KEYS.map((k) => (
              <PressButton key={k} className="pin-key" aria-label={k === 'back' ? 'Delete' : k === 'clear' ? 'Clear' : k} onClick={() => press(k)} disabled={busy || !online}>
                {k === 'back' ? <Icon name="back" size={48} strokeWidth={3.4} /> : k === 'clear' ? <Icon name="close" size={44} strokeWidth={3.4} /> : k}
              </PressButton>
            ))}
          </div>
        </div>
      </main>
    </RootTheme>
  );
}

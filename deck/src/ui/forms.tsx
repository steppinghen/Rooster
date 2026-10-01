import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="dk-field">
      <label className="dk-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="dk-field__hint">{hint}</p>}
      {error && (
        <p className="dk-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} className="dk-input" aria-invalid={error ? true : undefined} {...input} />
    </Field>
  );
}

/** One-time code entry (email code, TOTP, pairing code, PIN): digits only, big, spaced. */
export function CodeField({ label, length, value, onChange, hint, error, autoFocus, secret }: { label: string; length: number; value: string; onChange: (v: string) => void; hint?: string; error?: string | null; autoFocus?: boolean; secret?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        className="dk-input dk-input--code"
        inputMode="numeric"
        autoComplete={secret ? 'off' : 'one-time-code'}
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        autoFocus={autoFocus}
        type={secret ? 'password' : 'text'}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
      />
    </Field>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="dk-field" role="radiogroup" aria-label={label}>
      <span className="dk-field__label">{label}</span>
      <div className="dk-segmented">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="dk-segmented__opt" onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={`dk-notice dk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

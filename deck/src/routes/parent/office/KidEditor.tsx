import { useId, useState, type FormEvent } from 'react';
import { artSrc } from '../../../art/art';
import { supabase } from '../../../lib/supabase';
import { ACCENTS, accentVar, type Accent, type AgeBand, type Kid, type Volume } from '../../../lib/types';
import { Check, CodeField, Field, Notice, Segmented, TextField } from '../../../ui/forms';
import { PressButton } from '../../../ui/PressButton';
import { AVATAR_CHOICES } from './avatars';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Add or edit a kid. Nickname only, birthday as month + day, optional 4-digit PIN (hashed server-side). */
export function KidEditor({ familyId, kid, nextSort, onDone }: { familyId: string; kid: Kid | null; nextSort: number; onDone: (changed: boolean) => void }) {
  const [nickname, setNickname] = useState(kid?.nickname ?? '');
  const [avatar, setAvatar] = useState(kid?.avatar ?? 'turtle');
  const [accent, setAccent] = useState<Accent>(kid?.accent ?? 'magenta');
  const [ageBand, setAgeBand] = useState<AgeBand>(kid?.age_band ?? 'reader');
  const [volume, setVolume] = useState<Volume>(kid?.default_volume ?? 'normal');
  const [month, setMonth] = useState<number | ''>(kid?.birthday_month ?? '');
  const [day, setDay] = useState<number | ''>(kid?.birthday_day ?? '');
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monthId = useId();
  const dayId = useId();

  async function save(e: FormEvent) {
    e.preventDefault();
    if (pin && pin.length !== 4) return setError('A PIN is 4 digits.');
    if ((month === '') !== (day === '')) return setError('Pick both a month and a day for the birthday, or neither.');
    setBusy(true);
    setError(null);
    const fields = {
      nickname: nickname.trim(),
      avatar,
      accent,
      age_band: ageBand,
      default_volume: volume,
      birthday_month: month === '' ? null : month,
      birthday_day: day === '' ? null : day,
    };
    let kidId = kid?.id;
    if (kid) {
      const { error } = await supabase.from('kids').update(fields).eq('id', kid.id);
      if (error) return fail(error.message);
    } else {
      const { data, error } = await supabase.from('kids').insert({ ...fields, family_id: familyId, sort_order: nextSort }).select('id').single();
      if (error) return fail(error.message);
      kidId = data.id;
    }
    if (pin || removePin) {
      const { error } = await supabase.rpc('set_kid_pin', { p_kid_id: kidId, p_pin: removePin ? null : pin });
      if (error) return fail(error.message);
    }
    setBusy(false);
    onDone(true);
  }

  function fail(msg: string) {
    setBusy(false);
    setError(msg);
  }

  return (
    <form onSubmit={save} className="dk-card p-section" data-testid="kid-editor">
      <h3 className="p-section__title">{kid ? `Edit ${kid.nickname}` : 'Add a kid'}</h3>
      <TextField label="Nickname" required maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Kid A" hint="Nicknames only. No last names." />

      <Field label="Avatar">
        <div className="p-art-pick" role="radiogroup" aria-label="Avatar">
          {AVATAR_CHOICES.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={avatar === a} aria-label={a} onClick={() => setAvatar(a)}>
              <img src={artSrc(a)} alt="" />
            </button>
          ))}
        </div>
      </Field>

      <Field label="Color">
        <div className="p-swatches" role="radiogroup" aria-label="Color">
          {ACCENTS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={accent === a} aria-label={a} className="p-swatch" style={{ background: accentVar(a) }} onClick={() => setAccent(a)} />
          ))}
        </div>
      </Field>

      <Segmented
        label="Screens"
        value={ageBand}
        onChange={setAgeBand}
        options={[
          { value: 'prereader', label: 'Pictures + audio (pre\u2011reader)' },
          { value: 'reader', label: 'Words + audio (reader)' },
        ]}
      />
      <Segmented
        label="Everyday look"
        value={volume}
        onChange={setVolume}
        options={[
          { value: 'normal', label: 'Full comic' },
          { value: 'focus', label: 'Calm (always quiet)' },
        ]}
      />

      <div className="p-grid-2">
        <Field label="Birthday month" htmlFor={monthId}>
          <select id={monthId} className="dk-input" value={month} onChange={(e) => setMonth(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Not set</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Birthday day" htmlFor={dayId}>
          <select id={dayId} className="dk-input" value={day} onChange={(e) => setDay(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Not set</option>
            {Array.from({ length: month === '' ? 31 : DAYS_IN[month - 1]! }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="dk-muted">Only month and day are stored, for "sleeps until my birthday". No birth year.</p>

      {!removePin && (
        <CodeField
          label={kid?.has_pin ? 'New PIN (leave empty to keep the current one)' : 'PIN (optional)'}
          length={4}
          value={pin}
          onChange={setPin}
          secret
          hint="Keeps a sibling out of this profile on a shared iPad."
        />
      )}
      {kid?.has_pin && (
        <Check label="Remove the PIN" checked={removePin} onChange={setRemovePin} />
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <div className="p-actions">
        <PressButton variant="ink" type="submit" disabled={busy || !nickname.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </PressButton>
        <PressButton type="button" onClick={() => onDone(false)}>
          Cancel
        </PressButton>
      </div>
    </form>
  );
}

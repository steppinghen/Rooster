import { useId, useState, type FormEvent } from 'react';
import { artInGroup, artSrc, isArtKey } from '../../art/art';
import { nextOccurrence, sleepsBetween } from '../../kid/dates';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { KID_COLUMNS, type DeckEvent, type EventKind, type Kid } from '../../lib/types';
import { must, useAsync } from '../../lib/useAsync';
import { Check, Field, Notice, Segmented, TextField } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { PressButton } from '../../ui/PressButton';
import { Panel } from '../../ui/surfaces';
import { Headline } from '../../ui/type';
import './dates.css';

const EVENT_ART = artInGroup('event');
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');

function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

type Item = { key: string; date: string; title: string; icon: string; kidsSee: boolean; event?: DeckEvent };

/** Expand events (yearly ones into this month) and birthdays into one month's items. */
function monthItems(events: DeckEvent[], kids: Kid[], y: number, m: number): Item[] {
  const prefix = `${y}-${pad(m)}`;
  const out: Item[] = [];
  for (const e of events) {
    const date = e.repeats_yearly ? `${y}-${e.on_date.slice(5)}` : e.on_date;
    if (date.startsWith(prefix)) out.push({ key: e.id, date, title: e.title, icon: e.icon, kidsSee: e.visible_to_kids, event: e });
  }
  for (const k of kids) {
    if (k.birthday_month === m && k.birthday_day) out.push({ key: `b-${k.id}`, date: nextOccurrence(`${y}-${pad(m)}-01`, m, k.birthday_day), title: `${k.nickname}'s birthday`, icon: 'cake', kidsSee: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Tour Dates for parents: a month view, and adding or editing events (kid-visible or parents only). */
export function ParentDates() {
  const { who } = useSession();
  const familyId = who.role === 'parent' ? who.familyId : '';
  const tz = who.role === 'parent' ? who.timezone : 'UTC';
  const today = todayIn(tz);
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [editing, setEditing] = useState<DeckEvent | { new: string } | null>(null);
  const data = useAsync(async () => {
    const [e, k] = await Promise.all([
      supabase.from('events').select('id, family_id, title, icon, on_date, kind, visible_to_kids, repeats_yearly').eq('family_id', familyId).order('on_date'),
      supabase.from('kids').select(KID_COLUMNS).eq('family_id', familyId),
    ]);
    return { events: must(e) as DeckEvent[], kids: must(k) as Kid[] };
  }, [familyId]);
  if (who.role !== 'parent') return null;

  const items = monthItems(data.data?.events ?? [], data.data?.kids ?? [], month.y, month.m);
  const first = new Date(Date.UTC(month.y, month.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (by: number) => setMonth(({ y, m }) => ({ y: m + by > 12 ? y + 1 : m + by < 1 ? y - 1 : y, m: ((m + by + 11) % 12) + 1 }));

  return (
    <>
      <header className="parent-head">
        <Headline size={40}>Tour Dates</Headline>
        <p className="dk-muted">Events kids can see become countdowns on their iPad.</p>
      </header>
      <Panel className="p-section">
        <div className="cal__head">
          <PressButton small aria-label="Previous month" onClick={() => shift(-1)}>
            <Icon name="back" size={20} />
          </PressButton>
          <h2 className="p-section__title" aria-live="polite">
            {label}
          </h2>
          <PressButton small aria-label="Next month" onClick={() => shift(1)}>
            <span style={{ display: 'inline-block', transform: 'rotate(180deg)' }}>
              <Icon name="back" size={20} />
            </span>
          </PressButton>
        </div>
        <div className="cal" role="grid" aria-label={label}>
          {WEEKDAYS.map((d) => (
            <span key={d} className="cal__dow" role="columnheader">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`x${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month.y}-${pad(month.m)}-${pad(i + 1)}`;
            const here = items.filter((it) => it.date === date);
            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                className={`cal__day${date === today ? ' cal__day--today' : ''}`}
                aria-label={`${date}${here.length ? `: ${here.map((h) => h.title).join(', ')}` : ''}`}
                onClick={() => setEditing({ new: date })}
              >
                <span>{i + 1}</span>
                {here.slice(0, 2).map((h) => (isArtKey(h.icon) ? <img key={h.key} src={artSrc(h.icon)} alt="" /> : null))}
              </button>
            );
          })}
        </div>
        <ul className="cal__list">
          {items.map((it) => (
            <li key={it.key} className="p-row" data-testid="event-row">
              {isArtKey(it.icon) && <img src={artSrc(it.icon)} alt="" width={36} height={36} />}
              <div className="p-row__main">
                <span className="p-row__title">{it.title}</span>
                <span className="p-row__meta">
                  {new Date(it.date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  {it.date >= today && ` · ${sleepsBetween(today, it.date)} sleeps`}
                  {' · '}
                  {it.kidsSee ? 'Kids see it' : 'Parents only'}
                </span>
              </div>
              {it.event && (
                <PressButton small onClick={() => setEditing(it.event!)}>
                  Edit
                </PressButton>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="dk-muted">Nothing this month.</li>}
        </ul>
        {!editing && (
          <PressButton variant="yellow" onClick={() => setEditing({ new: today })}>
            Add an event
          </PressButton>
        )}
      </Panel>
      {editing && (
        <EventEditor
          familyId={familyId}
          event={'new' in editing ? null : editing}
          date={'new' in editing ? editing.new : editing.on_date}
          onDone={(changed) => {
            setEditing(null);
            if (changed) void data.reload();
          }}
        />
      )}
    </>
  );
}

function EventEditor({ familyId, event, date, onDone }: { familyId: string; event: DeckEvent | null; date: string; onDone: (changed: boolean) => void }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [icon, setIcon] = useState(event?.icon ?? 'star');
  const [onDate, setOnDate] = useState(date);
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'other');
  const [kidsSee, setKidsSee] = useState(event?.visible_to_kids ?? true);
  const [yearly, setYearly] = useState(event?.repeats_yearly ?? false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateId = useId();

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { title: title.trim(), icon, on_date: onDate, kind, visible_to_kids: kidsSee, repeats_yearly: yearly };
    const { error } = event ? await supabase.from('events').update(row).eq('id', event.id) : await supabase.from('events').insert({ ...row, family_id: familyId });
    if (error) return setError(error.message);
    onDone(true);
  }

  async function remove() {
    if (!event) return;
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) return setError(error.message);
    onDone(true);
  }

  return (
    <form onSubmit={save} className="dk-card p-section" data-testid="event-editor">
      <h3 className="p-section__title">{event ? 'Edit event' : 'New event'}</h3>
      <TextField label="What" required maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Beach trip" />
      <Field label="When" htmlFor={dateId}>
        <input id={dateId} className="dk-input" type="date" required value={onDate} onChange={(e) => setOnDate(e.target.value)} />
      </Field>
      <Field label="Picture">
        <div className="p-art-pick" role="radiogroup" aria-label="Picture">
          {EVENT_ART.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={icon === a} aria-label={a} onClick={() => setIcon(a)}>
              <img src={artSrc(a)} alt="" />
            </button>
          ))}
        </div>
      </Field>
      <Segmented
        label="Kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'trip', label: 'Trip' },
          { value: 'holiday', label: 'Holiday' },
          { value: 'birthday', label: 'Birthday' },
          { value: 'other', label: 'Other' },
        ]}
      />
      <Segmented
        label="Who sees it"
        value={kidsSee ? 'kids' : 'parents'}
        onChange={(v) => setKidsSee(v === 'kids')}
        options={[
          { value: 'kids', label: 'Kids too (countdown)' },
          { value: 'parents', label: 'Parents only' },
        ]}
      />
      <Check label="Every year" checked={yearly} onChange={setYearly} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="p-actions">
        <PressButton variant="ink" type="submit" disabled={!title.trim() || !onDate}>
          Save
        </PressButton>
        <PressButton onClick={() => onDone(false)}>Cancel</PressButton>
        {event &&
          (confirmDelete ? (
            <PressButton small variant="ink" onClick={() => void remove()}>
              Yes, delete it
            </PressButton>
          ) : (
            <PressButton small onClick={() => setConfirmDelete(true)}>
              Delete…
            </PressButton>
          ))}
      </div>
    </form>
  );
}

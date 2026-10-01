import { useEffect, useState, type CSSProperties } from 'react';
import { artSrc, isArtKey } from '../../art/art';
import { familyDate } from '../../kid/cache';
import { sleepsLabel, upcomingCountdowns } from '../../kid/dates';
import { effectiveFocus, MODE_LABEL } from '../../kid/focus';
import { doneCount, formatTime, routineNow, routinesForKid } from '../../kid/routine';
import { FEELINGS, SIZES } from '../../kid/wave/feelings';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { accentVar, KID_COLUMNS, type DeckEvent, type FocusMode, type Kid, type KidFocus, type Routine } from '../../lib/types';
import { must, useAsync } from '../../lib/useAsync';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { localMinutes } from '../../theme/ground';
import { Check, Notice, Segmented } from '../../ui/forms';
import { KidAvatar } from '../../ui/KidAvatar';
import { PressButton } from '../../ui/PressButton';
import { ProgressDots } from '../../ui/ProgressDots';
import { Panel } from '../../ui/surfaces';
import { Headline, Marker } from '../../ui/type';
import './today.css';

type Checkin = { kid_id: string; feeling: string; size: number; moment: string; created_at: string };
type Usage = { kid_id: string | null; module_key: string; action: string; created_at: string };
type Completion = { routine_id: string; kid_id: string; on_date: string; completed_steps: string[]; completed_at: string | null };

const DURATIONS = [
  { value: '', label: 'No limit' },
  { value: '10', label: '10 min' },
  { value: '20', label: '20 min' },
  { value: '30', label: '30 min' },
];

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const time = (iso: string, tz: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });

async function load(familyId: string, timezone: string) {
  const today = familyDate(timezone);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [kids, routines, completions, events, focus, checkins, usage, now] = await Promise.all([
    supabase.from('kids').select(KID_COLUMNS).eq('family_id', familyId).order('sort_order').order('created_at'),
    supabase.from('routines').select('id, family_id, kid_id, slot, name, starts_at, steps, sort_order').eq('family_id', familyId),
    supabase.from('routine_completions').select('routine_id, kid_id, on_date, completed_steps, completed_at').eq('family_id', familyId).eq('on_date', today),
    supabase.from('events').select('id, family_id, title, icon, on_date, kind, visible_to_kids, repeats_yearly').eq('family_id', familyId),
    supabase.from('kid_focus').select('kid_id, family_id, mode, since, ends_at, return_mode, pending_mode, switch_at, pending_ends_at, pinned, updated_at').eq('family_id', familyId),
    supabase.from('feelings_checkins').select('kid_id, feeling, size, moment, created_at').eq('family_id', familyId).gte('created_at', since).order('created_at', { ascending: false }),
    supabase.from('usage_events').select('kid_id, module_key, action, created_at').eq('family_id', familyId).gte('created_at', new Date(Date.now() - 4 * 3600_000).toISOString()),
    supabase.rpc('server_now'),
  ]);
  return {
    today,
    kids: must(kids) as Kid[],
    routines: must(routines) as Routine[],
    completions: must(completions) as Completion[],
    events: must(events) as DeckEvent[],
    focus: must(focus) as KidFocus[],
    checkins: must(checkins) as Checkin[],
    usage: must(usage) as Usage[],
    offsetMs: new Date(must(now) as string).getTime() - Date.now(),
  };
}

/**
 * Parent home: today at a glance. The board (routines and events), and per kid: routine
 * progress, their latest Wave Check (parents only), countdowns, and the focus-mode switcher.
 */
export function Today() {
  const { who } = useSession();
  const familyId = who.role === 'parent' ? who.familyId : '';
  const tz = who.role === 'parent' ? who.timezone : 'UTC';
  const wide = useMediaQuery('(min-width: 1000px)');
  const data = useAsync(() => load(familyId, tz), [familyId, tz]);
  const [tick, setTick] = useState(() => Date.now());
  const reload = data.reload; // stable (useCallback); the data object itself is new every render

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live: the family's private topic says something changed; refetch.
  useEffect(() => {
    if (!familyId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`family:${familyId}`, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => void reload(), 300);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void reload();
        });
    });
    // A Realtime message can be missed (sleep, network): refresh on return and every 30 s too.
    const poll = setInterval(() => void reload(), 30_000);
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [familyId, reload]);

  if (who.role !== 'parent') return null;
  const d = data.data;
  const now = tick + (d?.offsetMs ?? 0);
  const at = new Date(now);
  const minutes = localMinutes(tz, at);
  const weekday = at.toLocaleDateString(undefined, { weekday: 'long', timeZone: tz });

  if (!d) {
    return (
      <header className="parent-head">
        <Marker>{who.familyName}</Marker>
        <Headline size={56}>{weekday}</Headline>
        {data.error && <Notice tone="error">{data.error}</Notice>}
      </header>
    );
  }

  // The board: today's routines (once each) and today's events, in time order.
  const board = [
    ...d.routines.map((r) => ({
      key: r.id,
      at: r.starts_at.slice(0, 5),
      title: r.name,
      meta: r.kid_id ? (d.kids.find((k) => k.id === r.kid_id)?.nickname ?? '') : 'Everyone',
      icon: r.steps[0]?.icon ?? 'star',
      routine: r,
    })),
    ...d.events
      .filter((e) => (e.repeats_yearly ? e.on_date.slice(5) === d.today.slice(5) : e.on_date === d.today))
      .map((e) => ({ key: e.id, at: '', title: e.title, meta: e.visible_to_kids ? 'Tour Dates' : 'Parents only', icon: e.icon, routine: null as Routine | null })),
  ].sort((a, b) => (a.at || '99').localeCompare(b.at || '99'));
  const live = [...d.routines].filter((r) => r.starts_at.slice(0, 5) <= `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).pop();
  const countdowns = upcomingCountdowns(d.events, d.kids, d.today).slice(0, 3);

  return (
    <div className={wide ? 'today today--wide' : 'today'}>
      <header className="parent-head today__head">
        <Marker>
          {live ? `${live.name} · ` : ''}
          {time(at.toISOString(), tz)}
        </Marker>
        <Headline size={wide ? 72 : 60}>{weekday}</Headline>
        <p className="dk-muted">
          Hi, {who.displayName}. {board.length} things on the board today.
        </p>
        <div className="today__kids" role="list">
          {d.kids.map((k) => (
            <a key={k.id} href={`#kid-${k.id}`} className="today__kid-chip" role="listitem">
              <KidAvatar nickname={k.nickname} avatar={k.avatar} accent={k.accent} size={52} />
              <span>{k.nickname}</span>
            </a>
          ))}
        </div>
      </header>

      <Panel className="p-section today__board">
        <Marker size={16}>On the board</Marker>
        <ol className="board">
          {board.map((b) => (
            <li key={b.key} className={b.routine && b.routine === live ? 'board__item board__item--now' : 'board__item'} data-testid="board-item">
              <span className="board__time">{b.at ? formatTime(b.at) : 'Today'}</span>
              <span className="board__icon">{isArtKey(b.icon) && <img src={artSrc(b.icon)} alt="" />}</span>
              <span className="board__text">
                <span className="board__title">{b.title}</span>
                <span className="board__meta">{b.meta}</span>
              </span>
              {b.routine && b.routine === live && <span className="dk-tag board__now">NOW</span>}
            </li>
          ))}
          {board.length === 0 && <li className="dk-muted">Nothing yet. Add routines in Back Office and events in Tour Dates.</li>}
        </ol>
        {countdowns.length > 0 && (
          <p className="dk-muted today__countdowns">
            Coming up: {countdowns.map((c) => `${c.title} (${sleepsLabel(c.sleeps)})`).join(' · ')}
          </p>
        )}
      </Panel>

      <div className="today__cards">
        {d.kids.length > 1 && <FocusSwitcher kids={d.kids} focus={d.focus} now={now} tz={tz} label="Everyone" onDone={() => void data.reload()} />}
        {d.kids.map((k) => (
          <KidCard key={k.id} kid={k} d={d} now={now} minutes={minutes} tz={tz} onChanged={() => void data.reload()} />
        ))}
      </div>
    </div>
  );
}

function KidCard({ kid, d, now, minutes, tz, onChanged }: { kid: Kid; d: Awaited<ReturnType<typeof load>>; now: number; minutes: number; tz: string; onChanged: () => void }) {
  const [history, setHistory] = useState(false);
  const rn = routineNow(d.routines, d.completions, kid.id, d.today, minutes);
  const latest = d.checkins.find((c) => c.kid_id === kid.id);
  const feel = latest && FEELINGS.find((f) => f.key === latest.feeling);
  const focus = effectiveFocus(d.focus.find((f) => f.kid_id === kid.id), now);
  const mine = routinesForKid(d.routines, kid.id);
  const ended = focus.ended && now - focus.ended.at < 2 * 3600_000 ? focus.ended : null;
  const sessionUse = ended ? d.usage.filter((u) => u.kid_id === kid.id && Date.parse(u.created_at) <= ended.at && Date.parse(u.created_at) >= ended.at - 4 * 3600_000) : [];

  return (
    <section id={`kid-${kid.id}`} className="dk-accent-block today__kid" style={{ '--accent': accentVar(kid.accent) } as CSSProperties} data-testid="kid-card">
      <header className="today__kid-head">
        <KidAvatar nickname={kid.nickname} avatar={kid.avatar} accent={kid.accent} size={48} />
        <h2 className="dk-title today__kid-name">{kid.nickname}</h2>
        <span className="today__mode" data-testid="kid-mode">
          {MODE_LABEL[focus.mode]}
          {focus.endsAt && ` · ${mmss(focus.endsAt - now)} left`}
        </span>
      </header>

      {rn.kind === 'active' || rn.kind === 'finished' ? (
        <div className="today__routine">
          <ProgressDots total={rn.routine.steps.length} done={rn.kind === 'active' ? doneCount(rn.routine, rn.done) : rn.routine.steps.length} size={30} />
          <span className="today__routine-text">
            <strong>{rn.routine.name}</strong>{' '}
            {rn.kind === 'active' ? `${doneCount(rn.routine, rn.done)} of ${rn.routine.steps.length} · Next: ${rn.next.text}` : 'All done'}
          </span>
        </div>
      ) : (
        <p className="today__routine-text">{rn.kind === 'waiting' ? `${rn.upcoming.name} at ${formatTime(rn.upcoming.starts_at)}` : 'No routines yet'}</p>
      )}
      {mine.length > 1 && (
        <p className="today__small">
          Today:{' '}
          {mine
            .map((r) => {
              const c = d.completions.find((x) => x.routine_id === r.id && x.kid_id === kid.id);
              return `${r.name} ${c ? doneCount(r, c.completed_steps) : 0}/${r.steps.length}`;
            })
            .join(' · ')}
        </p>
      )}

      <div className="today__wave" data-testid="kid-wave">
        {feel ? (
          <>
            <img src={artSrc(feel.art)} alt="" width={40} height={40} />
            <span>
              <strong>{feel.surf}</strong> ({feel.words.toLowerCase()}) · {SIZES[latest!.size]?.toLowerCase()} · {time(latest!.created_at, tz)}
            </span>
          </>
        ) : (
          <span>No Wave Check today.</span>
        )}
        <button type="button" className="today__link" onClick={() => setHistory((h) => !h)} aria-expanded={history}>
          {history ? 'Hide' : 'History'}
        </button>
      </div>
      {history && (
        <ul className="today__history" data-testid="wave-history">
          {d.checkins
            .filter((c) => c.kid_id === kid.id)
            .map((c) => {
              const f = FEELINGS.find((x) => x.key === c.feeling);
              return (
                <li key={c.created_at}>
                  {new Date(c.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz })} {time(c.created_at, tz)} · {f?.surf} · {SIZES[c.size]?.toLowerCase()} · {c.moment.replace('_', ' ')}
                </li>
              );
            })}
          {!d.checkins.some((c) => c.kid_id === kid.id) && <li>No check-ins in the last 30 days.</li>}
          <li className="today__small">Kept 30 days, then deleted automatically. Kids only ever see today's.</li>
        </ul>
      )}

      {ended && (
        <p className="today__small" data-testid="session-summary">
          {MODE_LABEL[ended.mode]} ended {time(new Date(ended.at).toISOString(), tz)}.{' '}
          {sessionUse.length ? `${sessionUse.filter((u) => u.action === 'opened').length} opened, ${sessionUse.filter((u) => u.action === 'completed').length} finished.` : 'Nothing opened.'}
        </p>
      )}

      <FocusSwitcher kids={[kid]} focus={d.focus} now={now} tz={tz} onDone={onChanged} />
    </section>
  );
}

/** Switch one kid (or everyone): mode, optional duration, heads-up or now. */
function FocusSwitcher({ kids, focus, now, tz, label, onDone }: { kids: Kid[]; focus: KidFocus[]; now: number; tz: string; label?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FocusMode>('session');
  const [minutes, setMinutes] = useState('20');
  const [switchNow, setSwitchNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = kids.map((k) => k.id);
  const pending = kids.map((k) => effectiveFocus(focus.find((f) => f.kid_id === k.id), now).headsUp).find(Boolean);

  async function apply() {
    setError(null);
    const { error } = await supabase.rpc('set_focus', { p_kid_ids: ids, p_mode: mode, p_minutes: mode === 'everything' || !minutes ? null : Number(minutes), p_now: switchNow });
    if (error) return setError(error.message);
    setOpen(false);
    onDone();
  }

  async function now_(m: FocusMode) {
    const { error } = await supabase.rpc('set_focus', { p_kid_ids: ids, p_mode: m, p_minutes: null, p_now: true });
    if (error) return setError(error.message);
    onDone();
  }

  async function cancel() {
    const { error } = await supabase.rpc('cancel_focus_switch', { p_kid_ids: ids });
    if (error) return setError(error.message);
    onDone();
  }

  return (
    <div className={label ? 'dk-card switcher switcher--all' : 'switcher'} data-testid={label ? 'switcher-all' : 'switcher'}>
      {label && <h2 className="p-section__title">{label}</h2>}
      {pending ? (
        <div className="switcher__pending" role="status">
          <span>
            <strong>{MODE_LABEL[pending.mode]}</strong> in {mmss(pending.at - now)} (at {time(new Date(pending.at).toISOString(), tz)}). The kids see a heads-up.
          </span>
          <span className="p-actions">
            <PressButton small variant="ink" onClick={() => void now_(pending.mode)}>
              Switch now
            </PressButton>
            <PressButton small onClick={() => void cancel()}>
              Cancel
            </PressButton>
          </span>
        </div>
      ) : !open ? (
        <PressButton small onClick={() => setOpen(true)}>
          {label ? 'Change everyone…' : 'Change mode…'}
        </PressButton>
      ) : (
        <>
          <Segmented
            label={label ? 'Mode for everyone' : 'Mode'}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'everything', label: 'Everything' },
              { value: 'session', label: 'Session' },
              { value: 'lights_out', label: 'Lights out' },
            ]}
          />
          {mode !== 'everything' && <Segmented label="For" value={minutes} onChange={setMinutes} options={DURATIONS} />}
          <Check label="Switch now (skip the 2-minute heads-up)" checked={switchNow} onChange={setSwitchNow} />
          <span className="p-actions">
            <PressButton variant="yellow" onClick={() => void apply()}>
              {switchNow ? 'Switch' : 'Switch in 2 minutes'}
            </PressButton>
            <PressButton small onClick={() => setOpen(false)}>
              Cancel
            </PressButton>
          </span>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

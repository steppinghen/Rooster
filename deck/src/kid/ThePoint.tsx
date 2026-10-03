import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { isArtKey, artSrc } from '../art/art';
import { stickerName, stickerSrc } from '../art/stickers';
import { deckDesign } from '../art/decks';
import { wholeArt } from '../art/original';
import { kidVisibleModules } from '../lib/moduleRules';
import { accentVar, type Kid, type Routine, type RoutineSlot } from '../lib/types';
import { useMediaQuery } from '../lib/useMediaQuery';
import { IdleMascot, SceneStill } from '../scenes/AmbientScenes';
import { MascotArt } from '../scenes/MascotArt';
import { useFamilySettings } from '../scenes/SceneContext';
import { firstTimeToday } from '../scenes/timeline';
import { useIdleTurn } from '../scenes/useIdleTurn';
import { localMinutes } from '../theme/ground';
import { useTheme } from '../theme/ThemeScope';
import { DeckBoard } from '../ui/DeckBoard';
import { DieCut } from '../ui/DieCut';
import { Icon, type IconName } from '../ui/Icon';
import { InkDock } from '../ui/InkDock';
import { KidHeader } from '../ui/KidHeader';
import { PressButton } from '../ui/PressButton';
import { familyDate } from './cache';
import { setCurrentKid } from './currentKid';
import { sleepsLabel, upcomingCountdowns } from './dates';
import { effectiveFocus } from './focus';
import { kidDock } from './kidDock';
import { KidTheme } from './KidTheme';
import { finishChip, greeting, season, stickerSlots, toMinutes, weekDeck, type StickerSlot } from './point';
import { useCheckinMoment } from './useCheckinMoment';
import { doneCount, formatTime, routineNow } from './routine';
import { speak } from './speech';
import { useKidStore } from './store';
import { useLogUsage } from './usage';
import { useNow } from './useNow';
import { useReducedMotion } from './useReducedMotion';
import './point.css';

// The deck on The Point is the full-size My week deck scaled down: saved sizes of 86–96 px
// draw at 64–71 px, as the B2 frames show them.
const POINT_DECK_SCALE = 0.74;
// Check in tags already shown in this page load (with firstTimeToday: once a day across loads).
const tagsShown = new Set<string>();
const SLOT_ICON: Record<RoutineSlot, IconName> = { morning: 'sun', after_school: 'bag', bedtime: 'moon', other: 'star' };

/**
 * The Point (layout B2), the kid's home. It answers "what's next for me right now" first (the
 * Right now hero), then today's stickers, the week's deck and three fixed info cards, with the
 * ink dock along the bottom. Every part fits the iPad in both orientations with no scrolling.
 *
 * Reader portrait stacks the parts in the frame's order. Landscape (both bands) uses two
 * columns: Right now and the info cards on the left, My week on the right (readers add Today's
 * stickers under it; pre-readers get the sticker circles inside My week). Pre-reader portrait
 * isn't drawn: it stacks the two landscape columns (REVIEW.md V9).
 */
export function ThePoint({ kid }: { kid: Kid }) {
  const { snapshot } = useKidStore();
  const nav = useNavigate();
  const log = useLogUsage(kid.id);
  const now = useNow(1000);
  const reduced = useReducedMotion();
  const settings = useFamilySettings();
  const landscape = useMediaQuery('(orientation: landscape)');
  const { moment, notNow } = useCheckinMoment(kid.id, now);
  const s = snapshot!;
  const tz = s.family.timezone;
  const at = new Date(now);
  const today = familyDate(tz, at);
  const minutes = localMinutes(tz, at);
  const prereader = kid.age_band === 'prereader';
  const focus = effectiveFocus(s.focus.find((f) => f.kid_id === kid.id), now);
  const visible = new Set(kidVisibleModules(s.modules, focus.mode).map((m) => m.key));
  const routinesOn = visible.has('routines');

  const rn = routinesOn ? routineNow(s.routines, s.completions, kid.id, today, minutes) : ({ kind: 'none' } as const);
  const slots = routinesOn ? stickerSlots(s.routines, s.completions, s.awards ?? [], kid.id, today, minutes) : [];
  const week = weekDeck(s.decks ?? [], s.awards ?? [], kid.id, today);
  const countdown = visible.has('tour_dates') ? upcomingCountdowns(s.events, s.kids, today)[0] : undefined;

  function go(to: string, module: string) {
    log(module, 'opened');
    nav(to);
  }

  // The tag pops on once (per moment, per day), then stays still: not on every visit home.
  const tagKey = moment ? `tag.${kid.id}.${moment.id}` : '';
  const popTag = !!moment && firstTimeToday(tagKey, today) && !tagsShown.has(tagKey);
  useEffect(() => {
    if (tagKey) tagsShown.add(tagKey);
  }, [tagKey]);
  const dock = kidDock(kid, focus.mode, visible, moment ? { kind: 'checkin', text: 'Check in', pop: popTag } : undefined);
  const lastRun = (rn.kind === 'active' || rn.kind === 'finished') && rn.routine.slot === 'bedtime';
  const sun = wholeArt('seasons', `sun.${season(at, settings)}`);

  const stillKind = focus.mode === 'session' ? 'session' : lastRun ? 'lastrun' : minutes < 12 * 60 ? 'morning' : null;
  const { still, skip } = usePointStill(kid.id, today, stillKind);
  const hero = still ? <PointStill kind={still} name={kid.nickname} onSkip={skip} /> : <RightNow kid={kid} rn={rn} moment={moment} session={focus.mode === 'session'} minutes={minutes} reduced={reduced} onGo={go} onNotNow={notNow} />;
  // A card or button never leads to a hidden module: in Session mode My week is off the dock,
  // so its card goes too; the countdown card goes whenever Tour Dates is hidden.
  const weekOn = focus.mode !== 'session';
  const myWeek = weekOn && (
    <MyWeekCard
      kid={kid}
      design={week.deck?.design_key}
      stickers={week.stickers}
      slots={prereader ? slots : null}
      onOpen={() => go(`/kid/${kid.id}/week`, 'my_week')}
      onRoutine={(r) => {
        speak(r.name);
        go(`/kid/${kid.id}/routine/${r.id}`, 'routines');
      }}
    />
  );
  const stickers = slots.length > 0 && !prereader && <TodaysStickers kid={kid} slots={slots} onOpen={(r) => go(`/kid/${kid.id}/routine/${r.id}`, 'routines')} />;
  const cards = <InfoCards kid={kid} countdown={countdown} datesOn={visible.has('tour_dates')} onDates={() => go(`/kid/${kid.id}/dates`, 'tour_dates')} />;

  let body: ReactNode;
  if (prereader || landscape) {
    body = (
      <div className="pt__cols">
        <div className="pt__col pt__col--left">
          {hero}
          {cards}
        </div>
        <div className="pt__col pt__col--right">
          {myWeek}
          {stickers}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {hero}
        {stickers}
        {myWeek}
        {cards}
      </>
    );
  }

  return (
    <KidTheme kid={kid} scene={lastRun ? 'lastrun' : undefined}>
      <main
        className={`dk-kidscreen pt${landscape ? ' dk-kidscreen--landscape pt--land' : ''}${prereader ? ' pt--pre' : ''}`}
        data-audience="kid"
        data-age={kid.age_band}
        data-testid="the-point"
        style={{ '--accent': accentVar(kid.accent), '--kid': accentVar(kid.accent) } as CSSProperties}
      >
        <KidHeader
          greeting={`${greeting(minutes)}, ${kid.nickname}!`}
          title="The Point"
          kid={kid}
          onAvatar={() => {
            // My look arrives in slice 13; until then the avatar switches riders.
            setCurrentKid(null);
            nav('/kid');
          }}
          avatarLabel={`${kid.nickname}. Tap to switch riders.`}
          corner={sun ? <img src={sun} alt="" draggable={false} /> : undefined}
        />
        <div className="dk-kidscreen__body pt__body">{body}</div>
        <InkDock items={dock} active="home" onNavigate={(k) => log(k, 'opened')} />
      </main>
    </KidTheme>
  );
}

// ---------- Right now ----------

type RN = ReturnType<typeof routineNow> | { kind: 'none' };

function RightNow({
  kid,
  rn,
  moment,
  session,
  minutes,
  reduced,
  onGo,
  onNotNow,
}: {
  kid: Kid;
  rn: RN;
  moment: { label: string; startedAt: number } | null;
  session: boolean;
  minutes: number;
  reduced: boolean;
  onGo: (to: string, module: string) => void;
  onNotNow: () => void;
}) {
  const prereader = kid.age_band === 'prereader';
  const home = `/kid/${kid.id}`;

  // Assigned work comes first: a Session the parent has switched on.
  if (session) {
    return (
      <HeroCard kid={kid} testid="session-home" state="session" who="rooster" reduced={reduced} title="Session time" line="Time to learn!" speakText="Session time. Tap Start Session.">
        <PressButton
          variant="ink"
          className="pt-hero__go"
          onClick={() => {
            speak("Let's learn!");
            onGo(`${home}/session`, 'session');
          }}
        >
          Start Session <Icon name="chevron" size={36} strokeWidth={3} />
        </PressButton>
      </HeroCard>
    );
  }

  // Whichever started last leads: a moment that opened after the routine began invites first
  // (an unfinished morning routine doesn't hide the after-school check-in); a routine that
  // starts after the moment takes over, and the tag on the dock keeps the invitation.
  const momentFirst = !!moment && rn.kind === 'active' && moment.startedAt > toMinutes(rn.routine.starts_at);
  if (rn.kind === 'active' && !momentFirst) {
    const n = doneCount(rn.routine, rn.done);
    const total = rn.routine.steps.length;
    const chip = finishChip(rn.routine, minutes);
    return (
      <HeroCard
        kid={kid}
        testid="right-now"
        state="routine"
        who={rn.routine.slot === 'bedtime' ? 'turtle' : 'rooster'}
        reduced={reduced}
        title={rn.routine.name}
        line={
          <>
            Next: <span data-testid="up-next">{rn.next.text}</span>
            {!prereader && ` · ${n} of ${total} done`}
          </>
        }
        speakText={`${rn.routine.name}. Next: ${rn.next.text}.`}
        dots={{ done: n, total }}
        chip={chip}
      >
        <PressButton
          variant="ink"
          className="pt-hero__go"
          onClick={() => {
            if (prereader) speak(`Next: ${rn.next.text}.`);
            onGo(`${home}/routine/${rn.routine.id}`, 'routines');
          }}
        >
          Keep going <Icon name="chevron" size={36} strokeWidth={3} />
        </PressButton>
      </HeroCard>
    );
  }

  if (moment) {
    return (
      <HeroCard kid={kid} testid="wave-prompt" state="wave" who="turtle" reduced={reduced} title="How’s your wave?" line={`${moment.label}. Check in?`} speakText={`How's your wave? ${moment.label}. Check in?`} invite>
        <>
          <PressButton
            variant="ink"
            className="pt-hero__go"
            onClick={() => {
              if (prereader) speak("How's your wave?");
              onGo(`${home}/wave`, 'wave_check');
            }}
          >
            Wave Check <Icon name="chevron" size={36} strokeWidth={3} />
          </PressButton>
          <PressButton variant="card" className="pt-hero__later" onClick={onNotNow}>
            Not now
          </PressButton>
        </>
      </HeroCard>
    );
  }

  const upcoming = rn.kind === 'waiting' ? rn.upcoming : rn.kind === 'finished' ? rn.upcoming : null;
  if (upcoming) {
    return (
      <HeroCard
        kid={kid}
        testid="right-now"
        state="upcoming"
        who={upcoming.slot === 'bedtime' ? 'turtle' : 'rooster'}
        reduced={reduced}
        title={`Next: ${upcoming.name}`}
        line={`at ${formatTime(upcoming.starts_at)}`}
        speakText={`${upcoming.name} starts at ${formatTime(upcoming.starts_at)}.`}
      />
    );
  }
  const allDone = rn.kind === 'finished';
  return (
    <HeroCard
      kid={kid}
      testid="right-now"
      state={allDone ? 'done' : 'free'}
      who="rooster"
      reduced={reduced}
      title={allDone ? 'All done!' : `Hi, ${kid.nickname}!`}
      line={allDone ? 'Nice riding today.' : 'Nothing to do right now.'}
      speakText={allDone ? 'All done! Nice riding today.' : `Hi, ${kid.nickname}! Nothing to do right now.`}
    />
  );
}

function HeroCard({
  kid,
  testid,
  state,
  who,
  reduced,
  title,
  line,
  speakText,
  dots,
  chip,
  invite,
  children,
}: {
  kid: Kid;
  testid: string;
  state: string;
  who: 'rooster' | 'turtle';
  reduced: boolean;
  title: string;
  line: ReactNode;
  speakText: string;
  dots?: { done: number; total: number };
  chip?: { label: string; value: string } | null;
  invite?: boolean;
  children?: ReactNode;
}) {
  const prereader = kid.age_band === 'prereader';
  const speaker = (
    <PressButton round aria-label="Read it to me" className="pt-hero__speak" onClick={() => speak(speakText)}>
      <Icon name="speaker" size={32} />
    </PressButton>
  );
  return (
    <section className={`pt-hero${invite ? ' pt-hero--invite' : ''}`} aria-label="Right now" data-testid={testid} data-state={state}>
      <span className="pt-hero__label">Right now</span>
      <div className="pt-hero__top">
        <span className="pt-hero__who">
          <HeroMascot who={who} reduced={reduced} />
        </span>
        <div className="pt-hero__words">
          <span className="pt-hero__title">{title}</span>
          <span className="pt-hero__line">{line}</span>
          {dots && (
            <span className="pt-hero__dots" aria-hidden="true">
              {Array.from({ length: dots.total }, (_, i) => (
                <span key={i} className={i < dots.done ? 'is-done' : ''} />
              ))}
            </span>
          )}
        </div>
        {chip && (
          <span className="pt-hero__chip" data-testid="finish-chip">
            <span className="pt-hero__chip-label">{chip.label}</span>
            <span className="pt-hero__chip-value">{chip.value}</span>
          </span>
        )}
        {prereader && !children && speaker}
      </div>
      {children && (
        <div className="pt-hero__row">
          {children}
          {prereader && speaker}
        </div>
      )}
    </section>
  );
}

/**
 * The hero mascot. Normal volume: says hello (the rooster waves; the turtle is calm), then
 * settles and idles in turn (useIdleTurn), since the idle frames are drawn from the idle pose.
 * Focus volume: the small Calm pose, still. Reduce Motion: the hello, still.
 */
function HeroMascot({ who, reduced }: { who: 'rooster' | 'turtle'; reduced: boolean }) {
  const { volume } = useTheme();
  const focus = volume === 'focus';
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (reduced || focus) return;
    const t = setTimeout(() => setSettled(true), 2400);
    return () => clearTimeout(t);
  }, [reduced, focus]);
  const turn = useIdleTurn(settled ? [who] : [], reduced);
  if (focus) return <MascotArt who={who} pose="calm" px={58} label={who === 'rooster' ? 'The rooster' : 'The turtle'} />;
  const px = who === 'rooster' ? 88 : 92;
  if (!settled) return <MascotArt who={who} pose={who === 'rooster' ? 'hello' : 'calm'} px={px} label={who === 'rooster' ? 'The rooster says hi' : 'The turtle'} />;
  return <IdleMascot who={who} base={who === 'rooster' ? 'idle' : 'calm'} px={px} turn={turn} />;
}

// ---------- Today's stickers ----------

function TodaysStickers({ kid, slots, onOpen }: { kid: Kid; slots: StickerSlot[]; onOpen: (r: Routine) => void }) {
  return (
    <section className="pt-stickers" aria-label="Today’s stickers" data-testid="todays-stickers">
      <h2 className="pt-rule">
        <span>Today’s stickers</span>
      </h2>
      <div className="pt-stickers__grid" style={{ '--slots': slots.length } as CSSProperties}>
        {slots.map((slot) => (
          <button key={slot.routine.id} type="button" className={`pt-slot pt-slot--${slot.kind}`} data-testid="sticker-slot" data-kind={slot.kind} onClick={() => onOpen(slot.routine)} aria-label={slotLabel(slot)}>
            <SlotFace slot={slot} px={kid.age_band === 'prereader' ? 62 : 62} />
            <span className="pt-slot__text">
              {slot.routine.name}
              <br />
              <span className="pt-slot__sub">{slotSub(slot)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function slotSub(slot: StickerSlot): string {
  switch (slot.kind) {
    case 'earned':
      return 'Got it!';
    case 'pick':
      return 'Pick one!';
    case 'done':
      return 'All done';
    case 'next':
      return slot.stepsLeft === null ? formatTime(slot.routine.starts_at) : `${slot.stepsLeft} ${slot.stepsLeft === 1 ? 'step' : 'steps'} to go`;
    case 'later':
      return formatTime(slot.routine.starts_at);
  }
}

function slotLabel(slot: StickerSlot): string {
  const what = slot.kind === 'earned' ? `${stickerName(slot.sticker)} sticker` : slot.kind === 'next' || slot.kind === 'pick' ? 'mystery sticker' : '';
  return [slot.routine.name, slotSub(slot), what].filter(Boolean).join(', ');
}

function SlotFace({ slot, px }: { slot: StickerSlot; px: number }) {
  const { volume } = useTheme();
  if (slot.kind === 'earned') {
    const src = stickerSrc(slot.sticker, px, volume);
    return (
      <DieCut size={px} tilt={-6}>
        {src ? <img src={src} alt="" draggable={false} /> : <Icon name="star" size={px} />}
      </DieCut>
    );
  }
  if (slot.kind === 'next' || slot.kind === 'pick') return <span className="pt-q">?</span>;
  if (slot.kind === 'done') return <Icon name="check" size={42} strokeWidth={3} />;
  return <Icon name={SLOT_ICON[slot.routine.slot]} size={42} />;
}

// ---------- My week ----------

/**
 * My week: the title and deck open My week. The pre-reader's sticker circles sit under the deck
 * as their own buttons (80 pt hit areas around 62 px circles) that open their routine, as a
 * reader's slots do.
 */
function MyWeekCard({ kid, design, stickers, slots, onOpen, onRoutine }: { kid: Kid; design: string | null | undefined; stickers: { id: string; key: string; x: number; y: number; size: number; tilt: number }[]; slots: StickerSlot[] | null; onOpen: () => void; onRoutine: (r: Routine) => void }) {
  const prereader = kid.age_band === 'prereader';
  const name = deckDesign(design).name;
  const n = stickers.length;
  return (
    <section className="pt-week" aria-label="My week">
      <button type="button" className="pt-week__open" data-testid="my-week-card" onClick={onOpen} aria-label={`My week: ${n} ${n === 1 ? 'sticker' : 'stickers'} on ${name}`}>
      <span className="pt-week__head">
        <span className="pt-week__title">My week</span>
        {!prereader && (
          <span className="pt-week__sub">
            {n === 0 ? 'New deck' : `${n} ${n === 1 ? 'sticker' : 'stickers'}`} · {name}
          </span>
        )}
      </span>
      <span className="pt-week__deck">
        <DeckBoard design={design} stickers={stickers} scale={POINT_DECK_SCALE} />
      </span>
      </button>
      {slots && slots.length > 0 && (
        <span className="pt-circles" data-testid="todays-stickers">
          {slots.map((slot) => (
            <button key={slot.routine.id} type="button" className="pt-circle-hit" data-testid="sticker-slot" data-kind={slot.kind} aria-label={slotLabel(slot)} onClick={() => onRoutine(slot.routine)}>
              <span className={`pt-circle pt-circle--${slot.kind}`}>
                <SlotFace slot={slot} px={50} />
              </span>
            </button>
          ))}
        </span>
      )}
    </section>
  );
}

// ---------- Info cards ----------

/**
 * Three fixed slots: weather (Surf Report, slice 11), dinner (slice 12), the countdown (Tour
 * Dates). Until their data and screens land, weather and dinner show a quiet resting state and
 * don't open anything (no arrow). Pre-readers get one-word labels, spoken on tap.
 */
function InfoCards({ kid, countdown, datesOn, onDates }: { kid: Kid; countdown: ReturnType<typeof upcomingCountdowns>[number] | undefined; datesOn: boolean; onDates: () => void }) {
  const prereader = kid.age_band === 'prereader';
  const countIcon = countdown && isArtKey(countdown.icon) ? countdown.icon : null;
  return (
    <div className="pt-cards" style={{ '--cards': datesOn ? 3 : 2 } as CSSProperties}>
      <InfoCard testid="card-weather" art={<Icon name="sun" size={46} />} title="Weather" line="Look outside" say="Look outside to see the weather." prereader={prereader} />
      <InfoCard testid="card-dinner" art={<Icon name="bowl" size={46} />} title={prereader ? 'Dinner' : 'Tonight'} line="Dinner later" say="Dinner later." prereader={prereader} />
      {datesOn && (
      <InfoCard
        testid="card-countdown"
        art={countIcon ? <img src={artSrc(countIcon)} alt="" draggable={false} /> : <Icon name="calendar" size={46} />}
        title={countdown ? sleepsLabel(countdown.sleeps) : 'Tour Dates'}
        line={countdown ? (prereader ? countdown.title.split(' ')[0]! : countdown.title) : 'Countdowns'}
        say={countdown ? `${sleepsLabel(countdown.sleeps)} until ${countdown.title}.` : 'Tour Dates.'}
        prereader={prereader}
        onOpen={onDates}
      />
      )}
    </div>
  );
}

function InfoCard({ testid, art, title, line, say, prereader, onOpen }: { testid: string; art: ReactNode; title: string; line: string; say: string; prereader: boolean; onOpen?: () => void }) {
  const body = (
    <>
      {onOpen && (
        <span className="pt-card__arrow" aria-hidden="true">
          <Icon name="chevron" size={20} strokeWidth={3} />
        </span>
      )}
      <span className="pt-card__art">{art}</span>
      <span className="pt-card__title">{title}</span>
      <span className="pt-card__line">{line}</span>
    </>
  );
  if (!onOpen && !prereader) {
    return (
      <div className="pt-card pt-card--rest" data-testid={testid}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`pt-card${onOpen ? '' : ' pt-card--rest'}`}
      data-testid={testid}
      onClick={() => {
        if (prereader) speak(say);
        onOpen?.();
      }}
    >
      {body}
    </button>
  );
}

// ---------- Scene stills ----------

/**
 * Morning, Session starts and Last Run (wind-down) have behavior but no frames yet, so they ship
 * as their stills (slice 4): once a day each, the first time The Point opens in the morning, in
 * a Session, or once Last Run has started. The still plays in the Right now slot, so the dock
 * (and Wave Check) stays reachable; a tap skips it, and it hands back after 2.5 s.
 */
function usePointStill(kidId: string, today: string, kind: 'morning' | 'session' | 'lastrun' | null) {
  const due = kind && firstTimeToday(`still.${kind}.${kidId}`, today) ? `${kind}@${today}` : null;
  const [over, setOver] = useState<string[]>([]);
  const active = due && !over.includes(due) ? due : null;
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setOver((o) => [...o, active]), 2500);
    return () => clearTimeout(t);
  }, [active]);
  return { still: active ? (active.split('@')[0] as 'morning' | 'session' | 'lastrun') : null, skip: () => active && setOver((o) => [...o, active]) };
}

function PointStill({ kind, name, onSkip }: { kind: 'morning' | 'session' | 'lastrun'; name: string; onSkip: () => void }) {
  return (
    <button type="button" className="pt-hero pt-still" data-testid="point-still" data-kind={kind} onClick={onSkip} aria-label={`${kind === 'morning' ? `Good morning, ${name}!` : kind === 'session' ? 'Session time!' : 'Time to wind down.'} Tap to go on.`}>
      <SceneStill kind={kind} name={name} />
    </button>
  );
}

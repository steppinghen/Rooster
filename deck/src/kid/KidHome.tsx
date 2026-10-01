import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ART, isArtKey, type ArtKey } from '../art/art';
import { kidVisibleModules } from '../lib/moduleRules';
import { accentVar, type Kid } from '../lib/types';
import { ThemeScope } from '../theme/ThemeScope';
import { celebrationVolume } from '../theme/volume';
import { Burst } from '../ui/Burst';
import { DaySun } from '../ui/DaySun';
import { Icon, type IconName } from '../ui/Icon';
import { KidAvatar } from '../ui/KidAvatar';
import { PressButton } from '../ui/PressButton';
import { ProgressDots } from '../ui/ProgressDots';
import { Sticker } from '../ui/Sticker';
import { AccentBlock, TaskCard } from '../ui/surfaces';
import { Headline, Marker } from '../ui/type';
import { familyDate } from './cache';
import { setCurrentKid } from './currentKid';
import { sleepsLabel, upcomingCountdowns } from './dates';
import { effectiveFocus } from './focus';
import { KidTheme } from './KidTheme';
import { doneCount, formatTime, routineNow } from './routine';
import { speak } from './speech';
import { useKidStore } from './store';
import { useLogUsage } from './usage';
import { useNow } from './useNow';
import { localMinutes } from '../theme/ground';
import { useReducedMotion } from './useReducedMotion';
import './kid.css';
import './home.css';

type TileDef = { key: string; label: string; status?: string; icon: IconName; art: ArtKey; to: string };

function greeting(minutes: number): string {
  if (minutes < 12 * 60) return 'Good morning';
  if (minutes < 17 * 60) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Grom Zone: the kid's home. It answers "what's next for me right now" first (the next routine
 * step, big, with a spoken prompt), then shows the modules this kid can use in this mode.
 * Everything fits on one iPad screen; nothing scrolls.
 */
export function KidHome({ kid }: { kid: Kid }) {
  const { snapshot, enqueue, patch } = useKidStore();
  const nav = useNavigate();
  const log = useLogUsage(kid.id);
  const now = useNow(30_000);
  const reduced = useReducedMotion();
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const s = snapshot!;
  const tz = s.family.timezone;
  const today = familyDate(tz, new Date(now));
  const minutes = localMinutes(tz, new Date(now));
  const prereader = kid.age_band === 'prereader';
  const focus = effectiveFocus(
    s.focus.find((f) => f.kid_id === kid.id),
    now,
  );

  const rn = routineNow(s.routines, s.completions, kid.id, today, minutes);
  const countdowns = upcomingCountdowns(s.events, s.kids, today);

  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 2600);
    return () => clearTimeout(t);
  }, [celebrate]);

  function didIt() {
    if (rn.kind !== 'active') return;
    const steps = [...rn.done, rn.next.id];
    const finished = rn.routine.steps.every((st) => steps.includes(st.id));
    const row = { family_id: s.family.id, routine_id: rn.routine.id, kid_id: kid.id, on_date: today, completed_steps: steps, completed_at: finished ? new Date().toISOString() : null };
    patch((snap) => ({
      ...snap,
      completions: [...snap.completions.filter((c) => !(c.routine_id === row.routine_id && c.kid_id === kid.id && c.on_date === today)), row],
    }));
    enqueue({ kind: 'completion', key: `${row.routine_id}:${kid.id}:${today}`, row });
    if (finished) {
      log('routines', 'completed', rn.routine.id);
      speak(`You did it! ${rn.routine.name} is done.`);
      setCelebrate(rn.routine.name);
    } else {
      const upNext = rn.routine.steps.find((st) => !steps.includes(st.id));
      if (upNext) speak(`Nice! Next: ${upNext.text}.`);
    }
  }

  const tiles: TileDef[] = kidVisibleModules(s.modules, focus.mode).flatMap((m): TileDef[] => {
    switch (m.key) {
      case 'wave_check':
        return [{ key: m.key, label: 'Wave Check', status: 'How are you?', icon: 'waves', art: 'rolling', to: 'wave' }];
      case 'tour_dates': {
        const next = countdowns[0];
        return [{ key: m.key, label: 'Tour Dates', status: next ? `${sleepsLabel(next.sleeps)} · ${next.title}` : 'Countdowns', icon: 'calendar', art: next && isArtKey(next.icon) ? next.icon : 'star', to: 'dates' }];
      }
      case 'routines':
        return [{ key: m.key, label: 'Routines', status: 'Today', icon: 'board', art: 'toothbrush', to: 'routines' }];
      case 'session':
        return [{ key: m.key, label: 'Session', status: 'Learning', icon: 'book', art: 'book', to: 'session' }];
      default:
        return [];
    }
  });

  function open(t: TileDef) {
    if (prereader) speak(t.label);
    log(t.key, 'opened');
    nav(t.to);
  }

  const mascot: ArtKey = rn.kind !== 'none' && 'routine' in rn && rn.routine.slot === 'bedtime' ? 'turtle' : 'rooster';
  const title = rn.kind === 'active' || rn.kind === 'finished' ? rn.routine.name : 'Grom Zone';
  const scene = (rn.kind === 'active' || rn.kind === 'finished') && rn.routine.slot === 'bedtime' ? 'lastrun' : undefined;
  const cols = prereader ? 2 : tiles.length <= 4 ? 2 : 3;

  return (
    <KidTheme kid={kid} scene={scene}>
      <main className={prereader ? 'kid home home--pre' : 'kid home'} data-audience="kid" data-age={kid.age_band} style={{ '--accent': accentVar(kid.accent) } as CSSProperties}>
        <DaySun />
        <header className="kid__bar">
          <div className="home__title">
            <Marker size={prereader ? 20 : 18}>
              {greeting(minutes)} · {new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz })}
            </Marker>
            <Headline size={prereader ? 52 : 56}>{title}</Headline>
          </div>
          <button
            type="button"
            className="home__me"
            aria-label={`${kid.nickname}. Tap to switch riders.`}
            onClick={() => {
              setCurrentKid(null);
              nav('/kid');
            }}
          >
            <KidAvatar nickname={kid.nickname} avatar={kid.avatar} accent={kid.accent} size={prereader ? 88 : 80} />
          </button>
        </header>

        <section className="home__hero" aria-label="Your routine">
          <Sticker art={mascot} size={prereader ? 190 : 170} alt={ART[mascot].label} />
          <div className="home__hero-side">
            <TaskCard className="home__bubble">
              <span className="dk-title">
                {rn.kind === 'active'
                  ? `${rn.routine.steps.length - doneCount(rn.routine, rn.done)} more to go!`
                  : rn.kind === 'finished'
                    ? 'All done!'
                    : rn.kind === 'waiting'
                      ? `${rn.upcoming.name} at ${formatTime(rn.upcoming.starts_at)}`
                      : `Hi, ${kid.nickname}!`}
              </span>
            </TaskCard>
            {(rn.kind === 'active' || rn.kind === 'finished') && (
              <ProgressDots total={rn.routine.steps.length} done={rn.kind === 'active' ? doneCount(rn.routine, rn.done) : rn.routine.steps.length} size={prereader ? 64 : 58} label={`${rn.kind === 'active' ? doneCount(rn.routine, rn.done) : rn.routine.steps.length} of ${rn.routine.steps.length} steps done`} />
            )}
          </div>
        </section>

        {rn.kind === 'active' ? (
          <>
            <AccentBlock className="home__upnext">
              <span className="home__upnext-art">{isArtKey(rn.next.icon) ? <Sticker art={rn.next.icon} size={prereader ? 104 : 88} decorative /> : <Icon name="sparkle" size={56} />}</span>
              <span className="home__upnext-text">
                <span className="dk-label home__upnext-label">Up next</span>
                <span className="dk-title home__upnext-step" data-testid="up-next">
                  {rn.next.text}
                </span>
              </span>
              <PressButton round aria-label="Read it to me" className="home__speak" onClick={() => speak(`Up next: ${rn.next.text}.`)}>
                <Icon name="speaker" size={36} />
              </PressButton>
            </AccentBlock>
            <PressButton variant="ink" block className="home__did" onClick={didIt}>
              <Icon name="check" size={40} strokeWidth={3.4} /> I did it!
            </PressButton>
          </>
        ) : rn.kind === 'finished' && rn.upcoming ? (
          <TaskCard className="home__next-card">
            <span className="dk-title">Next up: {rn.upcoming.name}</span>
            <span className="dk-muted">at {formatTime(rn.upcoming.starts_at)}</span>
          </TaskCard>
        ) : null}

        <nav className="home__tiles" aria-label="Things to do" style={{ '--cols': cols } as CSSProperties}>
          {tiles.map((t) => (
            <button key={t.key} type="button" className="dk-tile home__tile" onClick={() => open(t)} data-testid={`tile-${t.key}`}>
              {prereader ? <Sticker art={t.art} size={84} decorative /> : <Icon name={t.icon} size={40} />}
              <span className="home__tile-label">{t.label}</span>
              {t.status && <span className="dk-tile__status">{t.status}</span>}
            </button>
          ))}
        </nav>

        {celebrate && (
          <ThemeScope ground="night" volume={celebrationVolume(kid.default_volume === 'focus' || focus.mode !== 'everything' ? 'focus' : 'normal', reduced)} className="home__celebrate" role="status">
            <Burst word="SHRED!" size={360} animate={!reduced} />
            <p className="dk-title home__celebrate-text">{celebrate} done!</p>
          </ThemeScope>
        )}
      </main>
    </KidTheme>
  );
}

import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { isArtKey } from '../art/art';
import type { Kid } from '../lib/types';
import { ThemeScope } from '../theme/ThemeScope';
import { celebrationVolume, effectiveVolume } from '../theme/volume';
import { Burst } from '../ui/Burst';
import { Icon } from '../ui/Icon';
import { PressButton } from '../ui/PressButton';
import { ProgressDots } from '../ui/ProgressDots';
import { Sticker } from '../ui/Sticker';
import { TaskCard } from '../ui/surfaces';
import { familyDate } from './cache';
import { effectiveFocus, modeVolume } from './focus';
import { KidFrame } from './KidFrame';
import { KidTheme } from './KidTheme';
import { doneCount } from './routine';
import { speak } from './speech';
import { useKidStore } from './store';
import { useNow } from './useNow';
import { useReducedMotion } from './useReducedMotion';
import { useStepDone } from './useStepDone';
import './routines.css';
import { servesKid } from '../lib/routines';

/** One routine, one step at a time: a big picture, the words, read-aloud, and "I did it!". */
export function RoutineRun({ kid }: { kid: Kid }) {
  const { routineId } = useParams();
  const { snapshot } = useKidStore();
  const nav = useNavigate();
  const now = useNow(30_000);
  const reduced = useReducedMotion();
  const stepDone = useStepDone(kid.id);
  const [celebrate, setCelebrate] = useState(false);
  const routine = snapshot!.routines.find((r) => r.id === routineId && servesKid(r, kid.id));

  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => nav(`/kid/${kid.id}`), 2800);
    return () => clearTimeout(t);
  }, [celebrate, nav, kid.id]);

  if (!routine) return <Navigate to={`/kid/${kid.id}/routines`} replace />;
  const today = familyDate(snapshot!.family.timezone, new Date(now));
  const done = snapshot!.completions.find((c) => c.routine_id === routine.id && c.kid_id === kid.id && c.on_date === today)?.completed_steps ?? [];
  const index = routine.steps.findIndex((s) => !done.includes(s.id));
  const step = index >= 0 ? routine.steps[index]! : null;
  const prereader = kid.age_band === 'prereader';
  const focus = effectiveFocus(snapshot!.focus.find((f) => f.kid_id === kid.id), now);

  return (
    <KidTheme kid={kid} scene={routine.slot === 'bedtime' ? 'lastrun' : undefined}>
      <KidFrame kid={kid} title={routine.name}>
        <div className="rt-run__dots">
          <ProgressDots total={routine.steps.length} done={doneCount(routine, done)} size={prereader ? 44 : 36} />
        </div>
        {step ? (
          <>
            <TaskCard className="rt-run__card">
              {!prereader && (
                <p className="dk-muted rt-run__count">
                  Step {index + 1} of {routine.steps.length}
                </p>
              )}
              <span className="rt-run__art">{isArtKey(step.icon) ? <Sticker art={step.icon} size={prereader ? 220 : 180} decorative /> : <Icon name="sparkle" size={120} />}</span>
              <p className="dk-title rt-run__text" data-testid="step-text">
                {step.text}
              </p>
              <PressButton round aria-label="Read it to me" className="rt-run__speak" onClick={() => speak(step.text)}>
                <Icon name="speaker" size={40} />
              </PressButton>
            </TaskCard>
            <PressButton variant="ink" block className="rt-run__did" onClick={() => stepDone(routine, done, step.id) && setCelebrate(true)}>
              <Icon name="check" size={40} strokeWidth={3.4} /> I did it!
            </PressButton>
          </>
        ) : (
          <TaskCard className="rt-run__card">
            <span className="rt-run__art">
              <Sticker art={routine.slot === 'bedtime' ? 'turtle' : 'rooster'} size={180} />
            </span>
            <p className="dk-title rt-run__text">All done!</p>
            <PressButton variant="ink" onClick={() => nav(`/kid/${kid.id}`)}>
              <Icon name="home" size={30} /> Home
            </PressButton>
          </TaskCard>
        )}
        {celebrate && (
          <ThemeScope ground="night" volume={celebrationVolume(effectiveVolume(kid.default_volume, modeVolume(focus.mode)), reduced)} className="home__celebrate" role="status">
            {reduced ? <Sticker art="sparkles" size={160} decorative /> : <Burst word="SHRED!" size={360} />}
            <p className="dk-title home__celebrate-text">{routine.name} done!</p>
          </ThemeScope>
        )}
      </KidFrame>
    </KidTheme>
  );
}

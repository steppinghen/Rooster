import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Kid } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { PressButton } from '../../ui/PressButton';
import { Sticker } from '../../ui/Sticker';
import { TaskCard } from '../../ui/surfaces';
import { KidFrame } from '../KidFrame';
import { KidTheme } from '../KidTheme';
import { speak } from '../speech';
import { useReducedMotion } from '../useReducedMotion';
import { useLogUsage } from '../usage';
import './wave.css';

const IN_MS = 4000;
const OUT_MS = 5000;
const BREATHS = 3;

type Phase = 'ready' | 'in' | 'out' | 'done';

/**
 * Balloon breathing with the turtle: three slow breaths. The balloon grows as you breathe in
 * and shrinks as you breathe out. With reduced motion it stays still and the words lead.
 * Never locked out by any mode.
 */
export function Breathe({ kid, lightsOut = false }: { kid: Kid; lightsOut?: boolean }) {
  const nav = useNavigate();
  const reduced = useReducedMotion();
  const log = useLogUsage(kid.id);
  const [phase, setPhase] = useState<Phase>('ready');
  const [breath, setBreath] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (phase !== 'in' && phase !== 'out') return;
    const t = setTimeout(
      () => {
        if (phase === 'in') {
          setPhase('out');
          if (!lightsOut) speak('Breathe out.', { rate: 0.75 });
        } else if (breath + 1 >= BREATHS) {
          setBreath(BREATHS);
          setPhase('done');
          log('breathe', 'completed', null, Date.now() - started.current);
        } else {
          setBreath((b) => b + 1);
          setPhase('in');
          if (!lightsOut) speak('Breathe in.', { rate: 0.75 });
        }
      },
      phase === 'in' ? IN_MS : OUT_MS,
    );
    return () => clearTimeout(t);
  }, [phase, breath, lightsOut, log]);

  function start() {
    started.current = Date.now();
    setBreath(0);
    setPhase('in');
    speak(lightsOut ? 'Breathe in.' : "Let's go into our shells. Three slow breaths. Breathe in.", { rate: 0.75 });
  }

  const big = phase === 'in';
  const label = phase === 'ready' ? 'Three slow breaths' : phase === 'in' ? 'Breathe in…' : phase === 'out' ? 'Breathe out…' : 'Nice and calm.';

  return (
    <KidTheme kid={kid} scene={lightsOut ? 'lastrun' : undefined}>
      <KidFrame kid={kid} title="Breathe" wave={false}>
        <TaskCard className="breathe">
          <div className="breathe__stage">
            <span
              className={`breathe__balloon${reduced ? '' : ' breathe__balloon--move'}`}
              style={{ transform: reduced ? undefined : `scale(${big ? 1.25 : 0.7})`, transitionDuration: `${big ? IN_MS : OUT_MS}ms` }}
              data-phase={phase}
            >
              <Sticker art="balloon" size={220} decorative />
            </span>
            <Sticker art="turtle" size={130} decorative />
          </div>
          <p className="dk-title breathe__label" aria-live="polite" data-testid="breathe-label">
            {label}
          </p>
          <div className="breathe__count" aria-label={`${Math.min(breath + (phase === 'out' ? 0 : 0), BREATHS)} of ${BREATHS} breaths`}>
            {Array.from({ length: BREATHS }, (_, i) => (
              <span key={i} className={i < breath || phase === 'done' ? 'breathe__dot breathe__dot--on' : 'breathe__dot'} />
            ))}
          </div>
          {phase === 'ready' && (
            <PressButton variant="ink" block onClick={start}>
              <Icon name="breathe" size={36} /> Start
            </PressButton>
          )}
          {phase === 'done' && (
            <div className="wave-thanks__actions">
              <PressButton block onClick={start}>
                Again
              </PressButton>
              <PressButton variant="ink" block onClick={() => nav(`/kid/${kid.id}`)}>
                <Icon name={lightsOut ? 'moon' : 'home'} size={30} /> {lightsOut ? 'Back to bed' : 'Done'}
              </PressButton>
            </div>
          )}
        </TaskCard>
      </KidFrame>
    </KidTheme>
  );
}

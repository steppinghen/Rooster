import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Kid } from '../../lib/types';
import { localMinutes } from '../../theme/ground';
import { Icon } from '../../ui/Icon';
import { PressButton } from '../../ui/PressButton';
import { Sticker } from '../../ui/Sticker';
import { TaskCard } from '../../ui/surfaces';
import { familyDate } from '../cache';
import { KidFrame } from '../KidFrame';
import { KidTheme } from '../KidTheme';
import { routineNow } from '../routine';
import { speak } from '../speech';
import { useKidStore } from '../store';
import { useLogUsage } from '../usage';
import { FEELINGS, SIZES } from './feelings';
import './wave.css';

type Step = { at: 'pick' } | { at: 'size'; feeling: (typeof FEELINGS)[number] } | { at: 'thanks'; feeling: (typeof FEELINGS)[number] };

/**
 * Wave Check: one question per screen. No scores, points or rewards, ever. Always reachable,
 * in every mode. The check-in is visible to parents; the kid sees only their own, today.
 */
export function WaveCheck({ kid }: { kid: Kid }) {
  const { snapshot, enqueue, patch, now } = useKidStore();
  const nav = useNavigate();
  const log = useLogUsage(kid.id);
  const [step, setStep] = useState<Step>({ at: 'pick' });
  const s = snapshot!;
  const at = new Date(now());
  const rn = routineNow(s.routines, s.completions, kid.id, familyDate(s.family.timezone, at), localMinutes(s.family.timezone, at));
  const slot = rn.kind === 'active' || rn.kind === 'finished' ? rn.routine.slot : null;
  const bedtime = slot === 'bedtime';
  const question = bedtime ? 'How was your day?' : "How's your wave?";
  const prereader = kid.age_band === 'prereader';

  function record(feeling: (typeof FEELINGS)[number], size: number) {
    const created = new Date(now()).toISOString();
    const row = { family_id: s.family.id, kid_id: kid.id, feeling: feeling.key, size, moment: slot ?? 'anytime' };
    enqueue({ kind: 'checkin', key: created, row });
    patch((snap) => ({ ...snap, checkins: [...snap.checkins.filter((c) => c.kid_id !== kid.id), { kid_id: kid.id, feeling: feeling.key, size, created_at: created }] }));
    log('wave_check', 'completed');
    speak(feeling.key === 'pumping' || feeling.key === 'rolling' ? 'Thanks for telling me.' : 'Thanks for telling me. Want to breathe with the turtle?');
    setStep({ at: 'thanks', feeling });
  }

  return (
    <KidTheme kid={kid} scene={bedtime ? 'lastrun' : undefined}>
      <KidFrame kid={kid} title="Wave Check" wave={false}>
        {step.at === 'pick' && (
          <>
            <div className="wave-ask">
              <Sticker art="turtle" size={prereader ? 130 : 110} decorative />
              <TaskCard className="wave-ask__bubble">
                <span className="dk-title">{question}</span>
                <PressButton round aria-label="Read it to me" className="wave-ask__speak" onClick={() => speak(`${question} Pumping, Rolling, Flat, or Choppy?`)}>
                  <Icon name="speaker" size={30} />
                </PressButton>
              </TaskCard>
            </div>
            <div className="wave-grid">
              {FEELINGS.map((f, i) => (
                <button
                  key={f.key}
                  type="button"
                  className="dk-tile wave-tile"
                  style={{ '--feel': f.color, '--tilt': `${[-2, 1.5, 1, -1.5][i]}deg` } as CSSProperties}
                  data-testid={`feeling-${f.key}`}
                  onClick={() => {
                    speak(f.spoken);
                    setStep({ at: 'size', feeling: f });
                  }}
                >
                  <Sticker art={f.art} size={prereader ? 130 : 112} decorative />
                  <span className="wave-tile__surf">{f.surf}</span>
                  <span className="wave-tile__words">{f.words}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step.at === 'size' && (
          <>
            <TaskCard className="wave-ask__bubble wave-ask__bubble--center">
              <Sticker art={step.feeling.art} size={96} decorative />
              <span className="dk-title">How big is your {step.feeling.surf.toLowerCase()} wave?</span>
              <PressButton round aria-label="Read it to me" className="wave-ask__speak" onClick={() => speak(`How big? ${SIZES.join(', ')}?`)}>
                <Icon name="speaker" size={30} />
              </PressButton>
            </TaskCard>
            <div className="wave-sizes" role="group" aria-label="How big">
              {SIZES.map((label, n) => (
                <button
                  key={label}
                  type="button"
                  className="dk-tile wave-size"
                  style={{ '--feel': step.feeling.color } as CSSProperties}
                  onClick={() => {
                    speak(label);
                    record(step.feeling, n);
                  }}
                  data-testid={`size-${n}`}
                >
                  <span className="wave-size__waves" aria-hidden="true">
                    <Icon name="waves" size={28 + n * 14} strokeWidth={3} />
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <PressButton onClick={() => setStep({ at: 'pick' })}>
              <Icon name="back" size={26} /> Pick a different one
            </PressButton>
          </>
        )}

        {step.at === 'thanks' && (
          <TaskCard className="wave-thanks" data-testid="wave-thanks">
            <Sticker art="turtle" size={150} decorative />
            <span className="dk-title wave-thanks__title">Thanks for telling me.</span>
            <div className="wave-thanks__actions">
              <PressButton variant="ink" block onClick={() => nav(`/kid/${kid.id}/breathe`)}>
                <Sticker art="balloon" size={56} decorative /> Breathe with the turtle
              </PressButton>
              {(step.feeling.key === 'choppy' || step.feeling.key === 'flat') && (
                <PressButton block onClick={() => nav(`/kid/${kid.id}/reset`)}>
                  <Icon name="sparkle" size={30} /> My reset plan
                </PressButton>
              )}
              <PressButton block onClick={() => nav(`/kid/${kid.id}`)}>
                <Icon name="home" size={30} /> Done
              </PressButton>
            </div>
          </TaskCard>
        )}
      </KidFrame>
    </KidTheme>
  );
}

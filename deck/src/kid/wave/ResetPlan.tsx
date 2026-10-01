import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ArtKey } from '../../art/art';
import type { Kid } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { PressButton } from '../../ui/PressButton';
import { Sticker } from '../../ui/Sticker';
import { TaskCard } from '../../ui/surfaces';
import { KidFrame } from '../KidFrame';
import { KidTheme } from '../KidTheme';
import { speak } from '../speech';
import { useKidStore } from '../store';
import { BODY_SIGNS, TOOLS } from './feelings';
import './wave.css';

type Option = { key: string; art: ArtKey; label: string };

/** A question a pre-reader can hear: words plus a read-aloud button. */
function Question({ text, spoken }: { text: string; spoken: string }) {
  return (
    <div className="reset-card__ask">
      <p className="dk-title reset-card__q">{text}</p>
      <PressButton round aria-label="Read it to me" className="wave-ask__speak" onClick={() => speak(spoken)}>
        <Icon name="speaker" size={30} />
      </PressButton>
    </div>
  );
}

function Picker({ options, chosen, toggle }: { options: Option[]; chosen: string[]; toggle: (k: string) => void }) {
  return (
    <div className="reset-grid">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className="dk-tile reset-opt"
          aria-pressed={chosen.includes(o.key)}
          onClick={() => {
            speak(o.label);
            toggle(o.key);
          }}
          style={{ '--tilt': '0deg' } as CSSProperties}
        >
          <Sticker art={o.art} size={84} decorative />
          <span>{o.label}</span>
          {chosen.includes(o.key) && (
            <span className="reset-opt__tick" aria-hidden="true">
              <Icon name="check" size={22} strokeWidth={3.4} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * The kid's reset plan: how a choppy wave feels in my body, and what helps. Built with a
 * grown-up on the iPad. Step one, step two, then the plan.
 */
export function ResetPlan({ kid }: { kid: Kid }) {
  const { snapshot, enqueue, patch } = useKidStore();
  const nav = useNavigate();
  const existing = snapshot!.resetPlans.find((p) => p.kid_id === kid.id);
  const [step, setStep] = useState<'view' | 'signs' | 'tools'>(existing ? 'view' : 'signs');
  const [signs, setSigns] = useState<string[]>(existing?.body_signs ?? []);
  const [tools, setTools] = useState<string[]>(existing?.tools ?? ['turtle']);
  const toggle = (list: string[], set: (v: string[]) => void) => (k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k].slice(0, 8));

  function save() {
    const row = { family_id: snapshot!.family.id, kid_id: kid.id, body_signs: signs, tools };
    enqueue({ kind: 'reset_plan', key: `reset:${kid.id}`, row });
    patch((s) => ({ ...s, resetPlans: [...s.resetPlans.filter((p) => p.kid_id !== kid.id), { kid_id: kid.id, body_signs: signs, tools }] }));
    speak('Your reset plan is saved.');
    setStep('view');
  }

  return (
    <KidTheme kid={kid}>
      <KidFrame kid={kid} title="Reset plan">
        {step === 'signs' && (
          <TaskCard className="reset-card">
            <Question text="When my wave gets choppy, my body…" spoken="When my wave gets choppy, how does my body feel? Tap the pictures." />
            <Picker options={BODY_SIGNS} chosen={signs} toggle={toggle(signs, setSigns)} />
            <PressButton variant="ink" block onClick={() => setStep('tools')}>
              Next
            </PressButton>
          </TaskCard>
        )}
        {step === 'tools' && (
          <TaskCard className="reset-card">
            <Question text="Things that help me" spoken="What helps me calm down? Tap the pictures." />
            <Picker options={TOOLS} chosen={tools} toggle={toggle(tools, setTools)} />
            {!tools.length && <p className="dk-muted reset-card__hint">Pick at least one thing that helps.</p>}
            <div className="wave-thanks__actions">
              <PressButton variant="ink" block onClick={save} disabled={!tools.length}>
                <Icon name="check" size={30} strokeWidth={3.4} /> Save my plan
              </PressButton>
              <PressButton block onClick={() => setStep('signs')}>
                <Icon name="back" size={28} /> Back
              </PressButton>
            </div>
          </TaskCard>
        )}
        {step === 'view' && (
          <TaskCard className="reset-card" data-testid="reset-plan">
            <Question
              text="My reset plan"
              spoken={`My reset plan. ${signs.length ? `My body says: ${BODY_SIGNS.filter((b) => signs.includes(b.key)).map((b) => b.label).join(', ')}. ` : ''}I can: ${TOOLS.filter((t) => tools.includes(t.key)).map((t) => t.label).join(', ')}.`}
            />
            {signs.length > 0 && (
              <div className="reset-plan__row">
                <span className="dk-label">My body says:</span>
                {BODY_SIGNS.filter((b) => signs.includes(b.key)).map((b) => (
                  <span key={b.key} className="reset-plan__chip">
                    <Sticker art={b.art} size={48} decorative /> {b.label}
                  </span>
                ))}
              </div>
            )}
            <div className="reset-plan__row">
              <span className="dk-label">I can:</span>
              {TOOLS.filter((t) => tools.includes(t.key)).map((t) => (
                <span key={t.key} className="reset-plan__chip">
                  <Sticker art={t.art} size={48} decorative /> {t.label}
                </span>
              ))}
            </div>
            <div className="wave-thanks__actions">
              {tools.includes('turtle') || tools.includes('balloon') ? (
                <PressButton variant="ink" block onClick={() => nav(`/kid/${kid.id}/breathe`)}>
                  <Sticker art="turtle" size={52} decorative /> Go in my shell
                </PressButton>
              ) : null}
              <PressButton block onClick={() => setStep('signs')}>
                Change my plan
              </PressButton>
              <PressButton block onClick={() => nav(`/kid/${kid.id}`)}>
                <Icon name="home" size={28} /> Done
              </PressButton>
            </div>
          </TaskCard>
        )}
      </KidFrame>
    </KidTheme>
  );
}

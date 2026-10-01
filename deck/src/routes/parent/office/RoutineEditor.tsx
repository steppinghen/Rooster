import { useId, useState, type FormEvent } from 'react';
import { artInGroup, artSrc } from '../../../art/art';
import { supabase } from '../../../lib/supabase';
import type { Kid, Routine, RoutineSlot, RoutineStep } from '../../../lib/types';
import { Field, Notice, Segmented, TextField } from '../../../ui/forms';
import { Icon } from '../../../ui/Icon';
import { PressButton } from '../../../ui/PressButton';
import { newStepId, SLOT_LABEL } from './routineTemplates';

const STEP_ART = artInGroup('step');

type Draft = { name: string; slot: RoutineSlot; starts_at: string; kid_id: string | null; steps: RoutineStep[] };

/** Edit one routine: name, time of day, who it's for, and ordered picture steps. */
export function RoutineEditor({ familyId, kids, routine, draft, onDone }: { familyId: string; kids: Kid[]; routine: Routine | null; draft: Draft; onDone: (changed: boolean) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [picking, setPicking] = useState<number | null>(null);
  const [newStep, setNewStep] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeId = useId();
  const forId = useId();

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setStep = (i: number, patch: Partial<RoutineStep>) => set({ steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, by: number) => {
    const steps = [...d.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + by, 0, s!);
    set({ steps });
  };

  function addStep(e: FormEvent) {
    e.preventDefault();
    const text = newStep.trim();
    if (!text) return;
    set({ steps: [...d.steps, { id: newStepId(d.steps.map((s) => s.id), text), text, icon: 'star' }] });
    setNewStep('');
    setPicking(d.steps.length);
  }

  async function save() {
    if (!d.steps.length) return setError('Add at least one step.');
    setBusy(true);
    setError(null);
    const row = { name: d.name.trim(), slot: d.slot, starts_at: d.starts_at, kid_id: d.kid_id, steps: d.steps.map((s) => ({ ...s, text: s.text.trim() })) };
    const { error } = routine ? await supabase.from('routines').update(row).eq('id', routine.id) : await supabase.from('routines').insert({ ...row, family_id: familyId });
    setBusy(false);
    if (error) return setError(error.message);
    onDone(true);
  }

  async function remove() {
    if (!routine) return;
    setBusy(true);
    const { error } = await supabase.from('routines').delete().eq('id', routine.id);
    setBusy(false);
    if (error) return setError(error.message);
    onDone(true);
  }

  return (
    <div className="dk-card p-section" data-testid="routine-editor">
      <h3 className="p-section__title">{routine ? `Edit ${routine.name}` : `New ${SLOT_LABEL[d.slot].toLowerCase()} routine`}</h3>
      <TextField label="Name" maxLength={40} value={d.name} onChange={(e) => set({ name: e.target.value })} />
      <Segmented label="Time of day" value={d.slot} onChange={(slot) => set({ slot })} options={(['morning', 'after_school', 'bedtime'] as const).map((v) => ({ value: v, label: SLOT_LABEL[v] }))} />
      <div className="p-grid-2">
        <Field label="Starts at" htmlFor={timeId}>
          <input id={timeId} className="dk-input" type="time" value={d.starts_at.slice(0, 5)} onChange={(e) => set({ starts_at: e.target.value })} />
        </Field>
        <Field label="For" htmlFor={forId}>
          <select id={forId} className="dk-input" value={d.kid_id ?? ''} onChange={(e) => set({ kid_id: e.target.value || null })}>
            <option value="">Everyone</option>
            {kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nickname}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="dk-muted">The morning routine's start is when the iPad switches to the day look; the bedtime routine's start is when night begins (Auto).</p>

      <ol className="p-steps">
        {d.steps.map((s, i) => (
          <li key={s.id} className="p-step" data-testid="routine-step">
            <button type="button" className="p-step__art" aria-label={`Picture for ${s.text}`} onClick={() => setPicking(picking === i ? null : i)}>
              <img src={artSrc(STEP_ART.includes(s.icon as never) ? (s.icon as never) : 'star')} alt="" />
            </button>
            <input className="dk-input p-step__text" aria-label={`Step ${i + 1}`} maxLength={60} value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} />
            <span className="p-step__tools">
              <PressButton small aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="back" size={18} />
              </PressButton>
              <PressButton small aria-label="Remove step" onClick={() => set({ steps: d.steps.filter((_, j) => j !== i) })}>
                <Icon name="close" size={18} />
              </PressButton>
            </span>
            {picking === i && (
              <div className="p-art-pick p-step__picker" role="radiogroup" aria-label={`Picture for ${s.text}`}>
                {STEP_ART.map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={s.icon === a} aria-label={a} onClick={() => (setStep(i, { icon: a }), setPicking(null))}>
                    <img src={artSrc(a)} alt="" />
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <form onSubmit={addStep} className="p-actions" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <TextField label="Add a step" maxLength={60} value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Feed the turtle" />
        </div>
        <PressButton type="submit" disabled={!newStep.trim() || d.steps.length >= 15}>
          Add
        </PressButton>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="p-actions">
        <PressButton variant="ink" onClick={() => void save()} disabled={busy || !d.name.trim()}>
          {busy ? 'Saving…' : 'Save routine'}
        </PressButton>
        <PressButton onClick={() => onDone(false)}>Cancel</PressButton>
        {routine &&
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
    </div>
  );
}

import { useCallback } from 'react';
import type { Routine } from '../lib/types';
import { familyDate } from './cache';
import { speak } from './speech';
import { useKidStore } from './store';
import { useLogUsage } from './usage';

/**
 * Tick a routine step for a kid: optimistic in the cached snapshot, queued in the outbox
 * (works offline), spoken feedback, and a usage event when the routine is finished.
 * Returns true when that step finished the routine.
 */
export function useStepDone(kidId: string) {
  const { snapshot, enqueue, patch, now } = useKidStore();
  const log = useLogUsage(kidId);
  return useCallback(
    (routine: Routine, done: string[], stepId: string): boolean => {
      if (!snapshot) return false;
      const today = familyDate(snapshot.family.timezone, new Date(now()));
      const steps = done.includes(stepId) ? done : [...done, stepId];
      const finished = routine.steps.every((st) => steps.includes(st.id));
      const row = { family_id: snapshot.family.id, routine_id: routine.id, kid_id: kidId, on_date: today, completed_steps: steps, completed_at: finished ? new Date(now()).toISOString() : null };
      patch((snap) => ({
        ...snap,
        completions: [...snap.completions.filter((c) => !(c.routine_id === routine.id && c.kid_id === kidId && c.on_date === today)), row],
      }));
      enqueue({ kind: 'completion', key: `${routine.id}:${kidId}:${today}`, row });
      if (finished) {
        log('routines', 'completed', routine.id);
        speak(`You did it! ${routine.name} is done.`);
      } else {
        const next = routine.steps.find((st) => !steps.includes(st.id));
        if (next) speak(`Nice! Next: ${next.text}.`);
      }
      return finished;
    },
    [snapshot, enqueue, patch, now, kidId, log],
  );
}

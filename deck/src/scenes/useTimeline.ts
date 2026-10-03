import { useEffect, useRef, useState } from 'react';

/**
 * Plays a stepped timeline once: returns the beat to show. With `reduced` it shows the last beat
 * (the still) straight away. `onDone` fires after `total` seconds (plus `holdAfter`), once.
 * `skip()` jumps to the end, for "tap to skip". A new timeline (other beats, or play turning
 * on) starts again from its first beat.
 */
export function useTimeline(ats: readonly number[], total: number, opts: { reduced?: boolean; onDone?: () => void; holdAfter?: number; play?: boolean } = {}) {
  const { reduced = false, holdAfter = 0, play = true } = opts;
  const last = ats.length - 1;
  const key = `${ats.join(',')}|${total}|${play}|${reduced}`;
  // The beat belongs to one run of the timeline; a different run starts from its first beat.
  const [state, setState] = useState<{ key: string; beat: number }>({ key, beat: reduced ? last : 0 });
  const beat = reduced ? last : state.key === key ? state.beat : 0;
  const done = useRef(false);
  const onDone = useRef(opts.onDone);
  useEffect(() => {
    onDone.current = opts.onDone;
  });

  useEffect(() => {
    if (!play) return;
    done.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!reduced) ats.forEach((at, i) => i > 0 && timers.push(setTimeout(() => setState({ key, beat: i }), at * 1000)));
    timers.push(
      setTimeout(() => {
        if (done.current) return;
        done.current = true;
        onDone.current?.();
      }, (total + holdAfter) * 1000),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, holdAfter]);

  const skip = () => {
    setState({ key, beat: last });
    if (done.current) return;
    done.current = true;
    onDone.current?.();
  };
  return { beat, skip, last };
}

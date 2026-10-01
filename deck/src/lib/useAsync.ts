import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type State<T> = { data: T | null; error: string | null; loading: boolean };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Minimal data loader: runs `fn` when deps change; `reload` re-runs it. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(
    () =>
      fnRef.current().then(
        (data) => setState({ data, error: null, loading: false }),
        (e) => setState((s) => ({ ...s, error: message(e), loading: false })),
      ),
    [],
  );

  useEffect(() => {
    let alive = true;
    fnRef.current().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e) => alive && setState((s) => ({ ...s, error: message(e), loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), []);
  return { ...state, reload, setData };
}

/** Throws a PostgREST error so useAsync can surface it. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

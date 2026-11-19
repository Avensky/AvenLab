import { useLayoutEffect, useMemo, useRef, useState, type DependencyList } from "react";

type Disposable = { dispose: () => void };
type Entry<T> = { key: object; value: T; revision: number; disposed: boolean };

/** Allocate only after a render commits. React's synchronous effect replay
 * reacquires the same resource before deferred disposal; abandoned renders
 * allocate nothing. A real replacement/unmount releases each resource once.
 */
export function useCommittedResource<T extends Disposable>(create: () => T, dependencies: DependencyList): T | null {
  // The key captures the factory belonging to these dependencies, without running it.
  const key = useMemo(() => ({ create }), dependencies);
  const current = useRef<Entry<T> | null>(null);
  const [ready, setReady] = useState<Entry<T> | null>(null);
  useLayoutEffect(() => {
    let entry = current.current;
    if (!entry || entry.key !== key || entry.disposed) {
      entry = { key, value: key.create(), revision: 0, disposed: false };
      current.current = entry;
    }
    const acquired = entry;
    const revision = ++acquired.revision;
    setReady(acquired);
    return () => {
      queueMicrotask(() => {
        if (acquired.revision !== revision || acquired.disposed) return;
        acquired.disposed = true;
        acquired.value.dispose();
        if (current.current === acquired) current.current = null;
      });
    };
  }, [key]);
  return ready?.key === key && !ready.disposed ? ready.value : null;
}

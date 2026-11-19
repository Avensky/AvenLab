import { useLayoutEffect, useRef, useState } from "react";

type Disposable = { dispose: () => void };
type Entry<T> = { create: () => T; value: T; revision: number; disposed: boolean };

/** Pass a stable factory (useCallback). Allocate only after a render commits. React's synchronous effect replay
 * reacquires the same resource before deferred disposal; abandoned renders
 * allocate nothing. A real replacement/unmount releases each resource once.
 */
export function useCommittedResource<T extends Disposable>(create: () => T): T | null {
  const current = useRef<Entry<T> | null>(null);
  const [ready, setReady] = useState<Entry<T> | null>(null);
  useLayoutEffect(() => {
    let entry = current.current;
    if (!entry || entry.create !== create || entry.disposed) {
      entry = { create, value: create(), revision: 0, disposed: false };
      current.current = entry;
      // Publish the committed rig before paint so the preview never shows an empty frame.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(entry);
    }
    const acquired = entry;
    const revision = ++acquired.revision;
    return () => {
      queueMicrotask(() => {
        if (acquired.revision !== revision || acquired.disposed) return;
        acquired.disposed = true;
        acquired.value.dispose();
        if (current.current === acquired) current.current = null;
      });
    };
  }, [create]);
  return ready?.create === create && !ready.disposed ? ready.value : null;
}

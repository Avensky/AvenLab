import { useStore, type StoreApi } from "zustand";
import { useNetworkStore, type NetworkState } from "./networkStore";

// All writes still belong to the socket store. A group shares one upstream
// subscription, even when a dozen vehicle components need the same player ID.
function makeNetworkView<const K extends keyof NetworkState>(keys: readonly K[]) {
  type View = Readonly<Pick<NetworkState, K>>;
  type Listener = (next: View, previous: View) => void;
  function project(source: NetworkState): View {
    const result = {} as Pick<NetworkState, K>;
    for (const key of keys) result[key] = source[key];
    return result;
  }
  const initial = project(useNetworkStore.getInitialState());
  // Imperative reads with no subscribers must neither retain old physics
  // frames nor manufacture a new snapshot on each React getSnapshot call.
  const idle = new WeakMap<NetworkState, View>();
  let cached = initial;
  let lastSource: NetworkState | undefined;
  const listeners = new Set<Listener>();
  let detach: (() => void) | undefined;

  function read(): View {
    const source = useNetworkStore.getState();
    if (!detach) {
      let value = idle.get(source);
      if (!value) {
        value = project(source);
        idle.set(source, value);
      }
      return value;
    }
    if (source === lastSource) return cached;
    if (keys.some(key => !Object.is(cached[key], source[key]))) cached = project(source);
    lastSource = source;
    return cached;
  }
  function subscribe(listener: Listener) {
    if (!detach) {
      cached = read();
      lastSource = useNetworkStore.getState();
      detach = useNetworkStore.subscribe((next, previous) => {
        if (keys.every(key => Object.is(next[key], previous[key]))) {
          if (lastSource === previous) lastSource = next;
          return;
        }
        // read() may already have run through another synchronous subscriber.
        const before = keys.every(key => Object.is(cached[key], previous[key]))
          ? cached : project(previous);
        const current = read();
        for (const notify of listeners) notify(current, before);
      });
    }
    // Independent unsubscribe handles even for the same listener function.
    const notify: Listener = (next, before) => listener(next, before);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
      if (!listeners.size) {
        detach?.();
        detach = undefined;
        cached = initial;
        lastSource = undefined;
      }
    };
  }
  const api: Pick<StoreApi<View>, "getState" | "getInitialState" | "subscribe"> = {
    getState: read, getInitialState: () => initial, subscribe,
  };
  function useView<T>(select: (state: View) => T): T { return useStore(api, select); }
  return Object.assign(useView, api);
}

export const useConnectionView = makeNetworkView(["connected", "playerId", "team", "room_id", "worldMap", "worldName", "spawn"]);
export const useMotionView = makeNetworkView(["connected", "playerId", "team", "room_id", "snapshot", "tick", "snapshotIntervalMs", "getMe", "getOthers"]);
export const useDiagnosticsView = makeNetworkView(["connected", "playerId", "room_id", "debugOverlay", "debugTick", "pingMs"]);

export type MotionState = ReturnType<typeof useMotionView.getState>;

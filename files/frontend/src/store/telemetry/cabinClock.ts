import { useSyncExternalStore } from "react";

const read = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
let value = read(),
  timer: number | null = null;
const listeners = new Set<() => void>();
function update() {
  const next = read();
  if (next !== value) {
    value = next;
    for (const listener of listeners) listener();
  }
}
function visibility() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  update();
  if (document.visibilityState !== "hidden")
    timer = window.setInterval(update, 30_000);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    visibility();
    document.addEventListener("visibilitychange", visibility);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", visibility);
    }
  };
}
export const useCabinTime = () =>
  useSyncExternalStore(
    subscribe,
    () => value,
    () => "--:--",
  );

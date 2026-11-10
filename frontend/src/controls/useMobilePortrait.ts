import { useSyncExternalStore } from "react";
import { isMobileBrowser } from "./inputDevice";

function portraitQuery() {
  return isMobileBrowser() ? window.matchMedia?.("(orientation: portrait)") : undefined;
}

function subscribe(onChange: () => void) {
  const query = portraitQuery();
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

const getSnapshot = () => portraitQuery()?.matches ?? false;

export function useMobilePortrait() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

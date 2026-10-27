import { create } from "zustand";
import { useUIStore } from "../store/uiStore";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { useCanDataStore } from "../store/canDataStore";
import { useInputStore } from "../store/inputStore";

export const PERFORMANCE_TABS = ["position", "network", "assets"] as const;
export type PerformanceTab = typeof PERFORMANCE_TABS[number];
export const usePerformanceOverlayStore = create<{
  expanded: boolean; focused: boolean; tab: PerformanceTab;
  expand: (focused?: boolean) => void; minimize: () => void; setTab: (tab: PerformanceTab) => void;
}>((set) => ({
  expanded: false, focused: false, tab: "position",
  expand: (focused = false) => set({ expanded: true, focused }),
  minimize: () => set({ expanded: false, focused: false }),
  setTab: tab => set({ tab }),
}));
function available() {
  const ui = useUIStore.getState();
  return ui.screen === "sandbox" && ui.overlay === null && !ui.isModeLoading && !useCanDataStore.getState().commandOpen;
}
export function performanceOverlayHasFocus() {
  return available() && useRenderSettingsStore.getState().overlay && usePerformanceOverlayStore.getState().focused;
}
export function minimizePerformanceOverlay() {
  usePerformanceOverlayStore.getState().minimize();
  if (typeof document !== "undefined" && typeof HTMLElement !== "undefined" && document.activeElement instanceof HTMLElement
    && document.activeElement.closest("[data-performance-overlay]")) document.activeElement.blur();
}
export function togglePerformanceDetails() {
  if (!available()) return;
  if (performanceOverlayHasFocus()) { minimizePerformanceOverlay(); return; }
  useInputStore.getState().releaseControls();
  useRenderSettingsStore.getState().update({ overlay: true });
  usePerformanceOverlayStore.getState().expand(true);
}
export function closePerformanceOverlay() {
  minimizePerformanceOverlay();
  useRenderSettingsStore.getState().update({ overlay: false });
}

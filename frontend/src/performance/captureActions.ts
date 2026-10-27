import { useUIStore } from "../store/uiStore";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { experimentContext } from "./context";
import { capturesCsv, performanceRecorder as recorder } from "./measurements";
import { captureFilename, loadCaptureArchive, saveCaptureArchive } from "./captureArchive";
import { useCaptureSettingsStore } from "./captureSettingsStore";
import { minimizePerformanceOverlay } from "./performanceOverlayStore";
import { resolveCityViewDistance } from "../world/cityViewDistance";
import { useNetworkStore } from "../store/networkStore";

let initialized = false;
export function initializeCaptureArchive() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const storage = window.localStorage;
    const archive = loadCaptureArchive(storage);
    recorder.restore(archive.runs, archive.baselineId);
    recorder.storageStatus = archive.message;
    // Disk writes happen once per completed capture or clear, never per frame.
    recorder.subscribeArchive(() => { recorder.storageStatus = saveCaptureArchive(storage, recorder.runs, recorder.baselineId); });
  } catch {
    recorder.storageStatus = "Browser storage unavailable. Export JSON before reloading.";
  }
}

export function automaticCaptureLabel() {
  const s = useRenderSettingsStore.getState();
  const vehicle = useNetworkStore.getState().getMe()?.vehicle_id ?? "vehicle";
  const range = resolveCityViewDistance(s.cityQuality, s.cityViewDistance);
  return `${vehicle.toUpperCase()} / ${s.cityQuality.toUpperCase()} / ${Number.isFinite(range) ? `${range}M` : "ALL LOADED"} / SHADOWS ${s.shadows ? "ON" : "OFF"}`;
}
export function startPerformanceCapture(baseline?: boolean, resume = false) {
  if (useUIStore.getState().screen !== "sandbox" || recorder.capturing) return;
  initializeCaptureArchive();
  if (resume) useUIStore.getState().closeOverlay();
  minimizePerformanceOverlay();
  useRenderSettingsStore.getState().update({ overlay: true });
  const settings = useCaptureSettingsStore.getState();
  recorder.start(settings.label.trim() || automaticCaptureLabel(), baseline ?? (settings.asBaseline || recorder.baselineId === null), settings.seconds, experimentContext());
}

export function togglePerformanceCapture() {
  if (recorder.capturing) recorder.stop(experimentContext());
  else startPerformanceCapture();
}

export function exportPerformanceCaptures(extension: "json" | "csv") {
  initializeCaptureArchive();
  if (!recorder.runs.length) return;
  const contents = extension === "csv" ? capturesCsv(recorder.runs) : JSON.stringify({
    schemaVersion: 1, exportedAt: new Date().toISOString(), baselineId: recorder.baselineId,
    units: { positions: "meters", yaw: "radians", frameSamplesMs: "milliseconds", timeline: "10 Hz latest observations" },
    runs: recorder.runs,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: extension === "csv" ? "text/csv;charset=utf-8" : "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = captureFilename(recorder.runs.at(-1)!.label, extension);
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

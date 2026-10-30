import {
  ACTION_MS,
  BASELINE_MS,
  CAPTURE_MS,
  COUNTDOWN_MS,
  type ReconMarkerDefinition,
  type ReconPhaseName,
} from "./catalog";

import type { ReconStep } from "./types";
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

let markerPostTail: Promise<void> = Promise.resolve();

export function serializeMarkerPost<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = markerPostTail.then(operation, operation);
  markerPostTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function waitForPendingMarkerPosts(): Promise<void> {
  return markerPostTail;
}

export function isCorrelationMarker(marker: ReconMarkerDefinition) {
  const markerType = marker.marker_type.trim().toLowerCase();
  return (
    marker.trigger === "action" ||
    markerType === "action_start" ||
    markerType === "action" ||
    markerType === "target_action" ||
    markerType === "target_event"
  );
}

export function makeRunId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `run-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
  );
}

export function makeMarkerId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `marker-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
  );
}

export function nowMs() {
  return performance.now();
}

export function phaseDuration(step: ReconStep, phase: ReconPhaseName): number {
  if (phase === "baseline") return step.baseline_ms ?? BASELINE_MS;
  if (phase === "countdown") return step.countdown_ms ?? COUNTDOWN_MS;
  if (phase === "action") return step.action_ms ?? ACTION_MS;
  return step.capture_ms ?? CAPTURE_MS;
}

export function markerLabel(
  marker: ReconMarkerDefinition,
  step: ReconStep,
): string {
  if (marker.label_source === "custom") {
    return marker.label?.trim() || marker.marker_type;
  }
  if (marker.label_source === "action_text") {
    return step.action_text ?? step.label;
  }
  return step.label;
}

export async function waitForRun(
  durationMs: number,
  runId: string,
  activeRunId: () => string | null,
): Promise<boolean> {
  const deadline = nowMs() + Math.max(0, durationMs);

  while (true) {
    if (activeRunId() !== runId) return false;

    const remaining = deadline - nowMs();
    if (remaining <= 0) return true;

    await sleep(Math.min(remaining, 250));
  }
}

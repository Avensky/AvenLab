import {
  ALL_RECON_PHASES,
  DEFAULT_TARGET_MARKERS,
  RECON_MISSIONS,
  getDefaultMissionProtocol,
  type MissionAnalyzerProfile,
  type ReconMarkerDefinition,
  type ReconMarkerLabelSource,
  type ReconMarkerTrigger,
  type ReconMissionProtocol,
  type ReconPhaseName,
  type ReconStepAnalysisMetadata,
  type ReconTiming,
} from "./catalog";

import type { ReconMission } from "./types";
const PROTOCOL_STORAGE_KEY = "avenlab.signal-recon.protocols.v1";
const MAX_PHASE_DURATION_MS = 24 * 60 * 60 * 1000;
export function clampDuration(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(Math.round(value), MAX_PHASE_DURATION_MS));
}

export function isPhase(value: unknown): value is ReconPhaseName {
  return (
    value === "baseline" ||
    value === "countdown" ||
    value === "action" ||
    value === "capture"
  );
}

function isMarkerTrigger(value: unknown): value is ReconMarkerTrigger {
  return (
    value === "step_start" ||
    value === "baseline" ||
    value === "countdown" ||
    value === "action" ||
    value === "capture" ||
    value === "step_complete" ||
    value === "run_cancelled"
  );
}

function isLabelSource(value: unknown): value is ReconMarkerLabelSource {
  return (
    value === "step_label" || value === "action_text" || value === "custom"
  );
}

function isAnalyzerProfile(value: unknown): value is MissionAnalyzerProfile {
  return (
    value === "baseline_profile" ||
    value === "boolean_transition" ||
    value === "ordinal_level" ||
    value === "continuous_trace" ||
    value === "enum_state" ||
    value === "pulse_event"
  );
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function sanitizeProtocol(
  mission: ReconMission,
  value: unknown,
): ReconMissionProtocol {
  const fallback = getDefaultMissionProtocol(mission);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const raw = value as Partial<ReconMissionProtocol>;
  const requestedPhases = Array.isArray(raw.enabled_phases)
    ? raw.enabled_phases.filter(isPhase)
    : fallback.enabled_phases;
  let enabledPhases = ALL_RECON_PHASES.filter((phase) =>
    requestedPhases.includes(phase),
  );

  const markers = Array.isArray(raw.markers)
    ? raw.markers
        .filter((marker): marker is ReconMarkerDefinition =>
          Boolean(
            marker &&
            typeof marker === "object" &&
            typeof marker.id === "string" &&
            isMarkerTrigger(marker.trigger) &&
            typeof marker.marker_type === "string" &&
            isLabelSource(marker.label_source),
          ),
        )
        .map((marker) => ({
          ...marker,
          marker_type: marker.marker_type,
          label: typeof marker.label === "string" ? marker.label : undefined,
          enabled: marker.enabled !== false,
        }))
    : fallback.markers;

  const targetCorrelationRequired =
    mission.analysis_mode !== "baseline_profile" && mission.rank !== "BASELINE";
  const isTargetMarker = (marker: ReconMarkerDefinition) =>
    marker.marker_type.trim().toLowerCase() === "action_start" ||
    marker.marker_type.trim().toLowerCase() === "action" ||
    marker.marker_type.trim().toLowerCase() === "target_action" ||
    marker.marker_type.trim().toLowerCase() === "target_event";
  const hasEnabledTargetMarker = markers.some(
    (marker) =>
      marker.enabled !== false &&
      marker.marker_type.trim().length > 0 &&
      isTargetMarker(marker),
  );

  // Old per-mission localStorage entries can contain an empty/invalid marker
  // list. A target-correlation mission without an action marker produces a
  // normal-looking recording that the analyzer can never correlate.
  if (targetCorrelationRequired && !hasEnabledTargetMarker) {
    const recoveryMarkers = fallback.markers.some(isTargetMarker)
      ? fallback.markers.filter(isTargetMarker)
      : DEFAULT_TARGET_MARKERS;
    for (const recoveryMarker of recoveryMarkers) {
      const existingIndex = markers.findIndex(
        (marker) => marker.id === recoveryMarker.id,
      );
      if (existingIndex >= 0) {
        markers[existingIndex] = {
          ...recoveryMarker,
          enabled: true,
        };
      } else {
        markers.push({
          ...recoveryMarker,
          enabled: true,
        });
      }
    }
  }

  // A configured marker must never be silently skipped merely because its
  // phase was disabled in a stale protocol. Heal the phase list in memory.
  const requiredMarkerPhases = new Set<ReconPhaseName>();
  for (const marker of markers) {
    if (marker.enabled !== false && isPhase(marker.trigger)) {
      requiredMarkerPhases.add(marker.trigger);
    }
  }
  enabledPhases = ALL_RECON_PHASES.filter(
    (phase) =>
      requestedPhases.includes(phase) || requiredMarkerPhases.has(phase),
  );

  const rawOverrides =
    raw.step_timing_overrides &&
    typeof raw.step_timing_overrides === "object" &&
    !Array.isArray(raw.step_timing_overrides)
      ? raw.step_timing_overrides
      : {};

  const step_timing_overrides: Record<string, Partial<ReconTiming>> = {};
  for (const [stepId, rawTiming] of Object.entries(rawOverrides)) {
    if (!rawTiming || typeof rawTiming !== "object") continue;
    const timing = rawTiming as Partial<ReconTiming>;
    const clean: Partial<ReconTiming> = {};

    const baseline = clampDuration(timing.baseline_ms);
    const countdown = clampDuration(timing.countdown_ms);
    const action = clampDuration(timing.action_ms);
    const capture = clampDuration(timing.capture_ms);

    if (baseline !== undefined) clean.baseline_ms = baseline;
    if (countdown !== undefined) clean.countdown_ms = countdown;
    if (action !== undefined) clean.action_ms = action;
    if (capture !== undefined) clean.capture_ms = capture;

    step_timing_overrides[stepId] = clean;
  }

  const rawAnalysisOverrides =
    raw.step_analysis_overrides &&
    typeof raw.step_analysis_overrides === "object" &&
    !Array.isArray(raw.step_analysis_overrides)
      ? raw.step_analysis_overrides
      : {};
  const step_analysis_overrides: Record<
    string,
    Partial<ReconStepAnalysisMetadata>
  > = {};
  for (const [stepId, rawAnalysis] of Object.entries(rawAnalysisOverrides)) {
    if (!rawAnalysis || typeof rawAnalysis !== "object") continue;
    const analysis = rawAnalysis as Partial<ReconStepAnalysisMetadata>;
    const clean: Partial<ReconStepAnalysisMetadata> = {};
    if (isAnalyzerProfile(analysis.analyzer_profile)) {
      clean.analyzer_profile = analysis.analyzer_profile;
    }
    const expectedValue = finiteNumber(analysis.expected_value);
    const returnValue = finiteNumber(analysis.return_value);
    const holdMs = clampDuration(analysis.hold_ms);
    if (expectedValue !== undefined) clean.expected_value = expectedValue;
    if (returnValue !== undefined) clean.return_value = returnValue;
    if (holdMs !== undefined) clean.hold_ms = holdMs;
    if (typeof analysis.expected_unit === "string") {
      clean.expected_unit = analysis.expected_unit;
    }
    if (
      analysis.expected_direction === "increase" ||
      analysis.expected_direction === "decrease" ||
      analysis.expected_direction === "bidirectional" ||
      analysis.expected_direction === "categorical" ||
      analysis.expected_direction === "unknown"
    ) {
      clean.expected_direction = analysis.expected_direction;
    }
    if (Array.isArray(analysis.field_widths)) {
      clean.field_widths = analysis.field_widths.filter(
        (value): value is 8 | 16 | 24 | 32 =>
          value === 8 || value === 16 || value === 24 || value === 32,
      );
    }
    if (typeof analysis.allow_signed === "boolean")
      clean.allow_signed = analysis.allow_signed;
    if (typeof analysis.allow_little_endian === "boolean")
      clean.allow_little_endian = analysis.allow_little_endian;
    if (typeof analysis.allow_big_endian === "boolean")
      clean.allow_big_endian = analysis.allow_big_endian;
    step_analysis_overrides[stepId] = clean;
  }

  return {
    enabled_phases: enabledPhases.length > 0 ? enabledPhases : ["capture"],
    markers,
    step_timing_overrides,
    step_analysis_overrides,
  };
}

function defaultProtocolMap(): Record<string, ReconMissionProtocol> {
  return Object.fromEntries(
    RECON_MISSIONS.map((mission) => [
      mission.mission_code,
      getDefaultMissionProtocol(mission),
    ]),
  );
}

export function loadProtocolMap(): Record<string, ReconMissionProtocol> {
  const defaults = defaultProtocolMap();
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(PROTOCOL_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const mission of RECON_MISSIONS) {
      if (parsed[mission.mission_code] !== undefined) {
        defaults[mission.mission_code] = sanitizeProtocol(
          mission,
          parsed[mission.mission_code],
        );
      }
    }
  } catch {
    return defaults;
  }

  return defaults;
}

export function persistProtocolMap(
  protocols: Record<string, ReconMissionProtocol>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PROTOCOL_STORAGE_KEY,
      JSON.stringify(protocols),
    );
  } catch {
    // Local persistence is a convenience; a full storage quota must not
    // block live CAN capture.
  }
}

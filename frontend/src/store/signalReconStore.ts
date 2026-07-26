// store/signalReconStore.ts
import { create } from "zustand";
import { getApiBaseUrl, type CanInterface, type CanMode } from "./canBusStore";
import { useCanDataStore } from "./canDataStore";
import {
    ALL_RECON_PHASES,
    CAPTURE_MS,
    ACTION_MS,
    BASELINE_MS,
    COUNTDOWN_MS,
    DEFAULT_TARGET_MARKERS,
    RECON_MISSIONS,
    applyMissionProtocolToSteps,
    getDefaultMissionProtocol,
    type MissionRank,
    type ReconMarkerDefinition,
    type ReconMarkerLabelSource,
    type ReconMarkerTrigger,
    type ReconMissionDefinition,
    type MissionAnalyzerProfile,
    type ReconMissionProtocol,
    type ReconPhaseName,
    type ReconStepAnalysisMetadata,
    type ReconStepDefinition,
    type ReconTiming,
} from "./signalReconMissions";

export type ReconMission = ReconMissionDefinition;
export type ReconStep = ReconStepDefinition;

export type CanVehicleIdentity = {
    slug: string;
    year?: number | null;
    make: string;
    model: string;
    trim?: string | null;
    alias?: string | null;
    vin?: string | null;
    datasetKind?: "live" | "practice" | "simulation";
    notes?: string;
    metadata?: Record<string, unknown>;
};

export type ReconRunPhase = ReconPhaseName | "idle" | "complete" | "cancelled";

type SwitchMissionArgs = {
    mission: ReconMission;
    busInterface: CanInterface;
    busMode: CanMode;
    restartActiveSession?: boolean;
};

type SignalReconState = {
    vehicleSlug: string;
    vehicleIdentity: CanVehicleIdentity;
    missions: ReconMission[];
    steps: ReconStep[];
    selectedMission: ReconMission | null;
    selectedRank: MissionRank | "ALL";
    missionProtocols: Record<string, ReconMissionProtocol>;

    activeSessionId: string | null;

    activeRunId: string | null;
    activeStep: ReconStep | null;
    activeStepIndex: number;
    activePhase: ReconRunPhase;
    phaseStartedAt: number | null;
    phaseEndsAt: number | null;
    postedMarkerCount: number;
    markerPostFailures: number;

    setVehicleSlug: (slug: string) => void;
    setVehicleIdentity: (vehicle: CanVehicleIdentity) => void;
    setSelectedRank: (rank: MissionRank | "ALL") => void;
    loadMissions: () => Promise<void>;
    selectMission: (mission: ReconMission) => Promise<void>;
    selectMissionByCode: (missionCode: string) => Promise<void>;
    switchMission: (args: SwitchMissionArgs) => Promise<string | null>;
    selectStepByIndex: (index: number) => void;

    setMissionEnabledPhases: (
        missionCode: string,
        phases: ReconPhaseName[],
    ) => void;
    addMissionMarker: (
        missionCode: string,
        marker?: Partial<ReconMarkerDefinition>,
    ) => void;
    updateMissionMarker: (
        missionCode: string,
        markerId: string,
        patch: Partial<ReconMarkerDefinition>,
    ) => void;
    removeMissionMarker: (
        missionCode: string,
        markerId: string,
    ) => void;
    updateStepTiming: (
        missionCode: string,
        stepId: string,
        timing: Partial<ReconTiming>,
    ) => void;
    updateStepAnalysis: (
        missionCode: string,
        stepId: string,
        analysis: Partial<ReconStepAnalysisMetadata>,
    ) => void;
    resetMissionProtocol: (missionCode: string) => void;

    startSession: (args: {
        busInterface: CanInterface;
        busMode: CanMode;
    }) => Promise<string>;

    postMarker: (args: {
        stepCode?: string;
        markerType: string;
        label?: string;
        metadata?: Record<string, unknown>;
    }) => Promise<void>;
    flushMarkerPosts: () => Promise<void>;

    runStep: (step?: ReconStep) => Promise<void>;
    runSelectedMission: () => Promise<void>;
    cancelActiveRun: () => Promise<void>;

    stopSession: (metadata?: Record<string, unknown>) => Promise<void>;
};

const PROTOCOL_STORAGE_KEY = "avenlab.signal-recon.protocols.v1";
const MAX_PHASE_DURATION_MS = 24 * 60 * 60 * 1000;
const MARKER_POST_ATTEMPTS = 3;

const sleep = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms));

let markerPostTail: Promise<void> = Promise.resolve();

function serializeMarkerPost<T>(
    operation: () => Promise<T>,
): Promise<T> {
    const result = markerPostTail.then(operation, operation);
    markerPostTail = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

function waitForPendingMarkerPosts(): Promise<void> {
    return markerPostTail;
}

function isCorrelationMarker(marker: ReconMarkerDefinition) {
    const markerType = marker.marker_type.trim().toLowerCase();
    return (
        marker.trigger === "action" ||
        markerType === "action_start" ||
        markerType === "action" ||
        markerType === "target_action" ||
        markerType === "target_event"
    );
}

function makeRunId() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `run-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
    );
}

function makeMarkerId() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `marker-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
    );
}

function nowMs() {
    return performance.now();
}

function phaseDuration(step: ReconStep, phase: ReconPhaseName): number {
    if (phase === "baseline") return step.baseline_ms ?? BASELINE_MS;
    if (phase === "countdown") return step.countdown_ms ?? COUNTDOWN_MS;
    if (phase === "action") return step.action_ms ?? ACTION_MS;
    return step.capture_ms ?? CAPTURE_MS;
}

function clampDuration(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(Math.round(value), MAX_PHASE_DURATION_MS));
}

function isPhase(value: unknown): value is ReconPhaseName {
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
        value === "step_label" ||
        value === "action_text" ||
        value === "custom"
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

function sanitizeProtocol(
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
              .filter(
                  (marker): marker is ReconMarkerDefinition =>
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
                  label:
                      typeof marker.label === "string"
                          ? marker.label
                          : undefined,
                  enabled: marker.enabled !== false,
              }))
        : fallback.markers;

    const targetCorrelationRequired =
        mission.analysis_mode !== "baseline_profile" &&
        mission.rank !== "BASELINE";
    const isTargetMarker = (marker: ReconMarkerDefinition) =>
        (
            marker.marker_type.trim().toLowerCase() === "action_start" ||
            marker.marker_type.trim().toLowerCase() === "action" ||
            marker.marker_type.trim().toLowerCase() === "target_action" ||
            marker.marker_type.trim().toLowerCase() === "target_event"
        );
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
        if (
            marker.enabled !== false &&
            isPhase(marker.trigger)
        ) {
            requiredMarkerPhases.add(marker.trigger);
        }
    }
    enabledPhases = ALL_RECON_PHASES.filter(
        (phase) =>
            requestedPhases.includes(phase) ||
            requiredMarkerPhases.has(phase),
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
        if (typeof analysis.allow_signed === "boolean") clean.allow_signed = analysis.allow_signed;
        if (typeof analysis.allow_little_endian === "boolean") clean.allow_little_endian = analysis.allow_little_endian;
        if (typeof analysis.allow_big_endian === "boolean") clean.allow_big_endian = analysis.allow_big_endian;
        step_analysis_overrides[stepId] = clean;
    }

    return {
        enabled_phases:
            enabledPhases.length > 0 ? enabledPhases : ["capture"],
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

function loadProtocolMap(): Record<string, ReconMissionProtocol> {
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

function persistProtocolMap(
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

function markerLabel(
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

async function waitForRun(
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

const DEFAULT_VEHICLE_IDENTITY: CanVehicleIdentity = {
    slug: "custom-vehicle",
    year: null,
    make: "Custom",
    model: "Vehicle",
    trim: null,
    alias: "Custom",
    datasetKind: "practice",
    notes: "Auto-created vehicle profile for Signal Recon sessions.",
    metadata: { source: "signal-recon-store-default" },
};

function normalizeVehicleIdentity(
    vehicle: CanVehicleIdentity,
): CanVehicleIdentity {
    const slug =
        vehicle.slug
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "custom-vehicle";

    return {
        ...DEFAULT_VEHICLE_IDENTITY,
        ...vehicle,
        slug,
        make: vehicle.make || "Custom",
        model: vehicle.model || vehicle.alias || slug,
    };
}

const INITIAL_PROTOCOLS = loadProtocolMap();
const INITIAL_MISSION = RECON_MISSIONS[0] ?? null;
const INITIAL_PROTOCOL = INITIAL_MISSION
    ? INITIAL_PROTOCOLS[INITIAL_MISSION.mission_code] ??
      getDefaultMissionProtocol(INITIAL_MISSION)
    : null;

export const useSignalReconStore = create<SignalReconState>((set, get) => ({
    vehicleSlug: DEFAULT_VEHICLE_IDENTITY.slug,
    vehicleIdentity: DEFAULT_VEHICLE_IDENTITY,
    missions: RECON_MISSIONS,
    missionProtocols: INITIAL_PROTOCOLS,
    steps:
        INITIAL_MISSION && INITIAL_PROTOCOL
            ? applyMissionProtocolToSteps(
                  INITIAL_MISSION,
                  INITIAL_PROTOCOL,
              )
            : [],
    selectedMission: INITIAL_MISSION,
    selectedRank: "ALL",

    activeSessionId: null,

    activeRunId: null,
    activeStep: null,
    activeStepIndex: 0,
    activePhase: "idle",
    phaseStartedAt: null,
    phaseEndsAt: null,
    postedMarkerCount: 0,
    markerPostFailures: 0,

    setVehicleSlug: (slug) =>
        set((state) => {
            const vehicleIdentity = normalizeVehicleIdentity({
                ...state.vehicleIdentity,
                slug,
            });
            return {
                vehicleSlug: vehicleIdentity.slug,
                vehicleIdentity,
            };
        }),

    setVehicleIdentity: (vehicle) =>
        set(() => {
            const vehicleIdentity = normalizeVehicleIdentity(vehicle);
            return {
                vehicleSlug: vehicleIdentity.slug,
                vehicleIdentity,
            };
        }),

    setSelectedRank: (rank) => set({ selectedRank: rank }),

    async loadMissions() {
        const selectedMission =
            get().selectedMission ?? RECON_MISSIONS[0] ?? null;
        const protocol = selectedMission
            ? get().missionProtocols[selectedMission.mission_code] ??
              getDefaultMissionProtocol(selectedMission)
            : null;

        set({
            missions: RECON_MISSIONS,
            selectedMission,
            steps:
                selectedMission && protocol
                    ? applyMissionProtocolToSteps(
                          selectedMission,
                          protocol,
                      )
                    : [],
        });
    },

    async selectMission(mission) {
        const protocol =
            get().missionProtocols[mission.mission_code] ??
            getDefaultMissionProtocol(mission);

        set({
            selectedMission: mission,
            steps: applyMissionProtocolToSteps(mission, protocol),
            activeRunId: null,
            activeStep: null,
            activeStepIndex: 0,
            activePhase: "idle",
            phaseStartedAt: null,
            phaseEndsAt: null,
        });
    },

    async selectMissionByCode(missionCode) {
        const mission = get().missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) {
            throw new Error(
                `Unknown Signal Recon mission: ${missionCode}`,
            );
        }
        await get().selectMission(mission);
    },

    async switchMission({
        mission,
        busInterface,
        busMode,
        restartActiveSession = true,
    }) {
        if (get().activeRunId) {
            throw new Error(
                "Cancel the active mission step before switching missions.",
            );
        }

        const hadActiveSession = Boolean(get().activeSessionId);
        if (hadActiveSession) {
            await get().stopSession({
                ui_event: "mission_switch",
                next_mission_code: mission.mission_code,
            });
        }

        await get().selectMission(mission);

        if (hadActiveSession && restartActiveSession) {
            return get().startSession({
                busInterface,
                busMode,
            });
        }

        return null;
    },

    selectStepByIndex(index) {
        const steps = get().steps;
        const safeIndex = Math.max(
            0,
            Math.min(index, steps.length - 1),
        );
        set({
            activeStepIndex: safeIndex,
            activeStep: steps[safeIndex] ?? null,
        });
    },

    setMissionEnabledPhases(missionCode, phases) {
        const state = get();
        const mission = state.missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) return;

        const current =
            state.missionProtocols[missionCode] ??
            getDefaultMissionProtocol(mission);
        const ordered = ALL_RECON_PHASES.filter((phase) =>
            phases.includes(phase),
        );
        const nextProtocol = sanitizeProtocol(mission, {
            ...current,
            enabled_phases:
                ordered.length > 0 ? ordered : ["capture"],
        });
        const missionProtocols = {
            ...state.missionProtocols,
            [missionCode]: nextProtocol,
        };

        persistProtocolMap(missionProtocols);
        set({
            missionProtocols,
            steps:
                state.selectedMission?.mission_code === missionCode
                    ? applyMissionProtocolToSteps(
                          mission,
                          nextProtocol,
                      )
                    : state.steps,
        });
    },

    addMissionMarker(missionCode, marker = {}) {
        const state = get();
        const mission = state.missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) return;

        const current =
            state.missionProtocols[missionCode] ??
            getDefaultMissionProtocol(mission);
        const nextMarker: ReconMarkerDefinition = {
            id: marker.id ?? makeMarkerId(),
            trigger: marker.trigger ?? "action",
            marker_type: marker.marker_type ?? "action_start",
            label_source: marker.label_source ?? "action_text",
            label: marker.label,
            enabled: marker.enabled !== false,
        };
        const nextProtocol = sanitizeProtocol(mission, {
            ...current,
            markers: [...current.markers, nextMarker],
        });
        const missionProtocols = {
            ...state.missionProtocols,
            [missionCode]: nextProtocol,
        };

        persistProtocolMap(missionProtocols);
        set({ missionProtocols });
    },

    updateMissionMarker(missionCode, markerId, patch) {
        const state = get();
        const mission = state.missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) return;

        const current =
            state.missionProtocols[missionCode] ??
            getDefaultMissionProtocol(mission);
        const nextProtocol = sanitizeProtocol(mission, {
            ...current,
            markers: current.markers.map((marker) =>
                marker.id === markerId
                    ? { ...marker, ...patch }
                    : marker,
            ),
        });
        const missionProtocols = {
            ...state.missionProtocols,
            [missionCode]: nextProtocol,
        };

        persistProtocolMap(missionProtocols);
        set({ missionProtocols });
    },

    removeMissionMarker(missionCode, markerId) {
        const state = get();
        const mission = state.missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) return;

        const current =
            state.missionProtocols[missionCode] ??
            getDefaultMissionProtocol(mission);
        const nextProtocol = sanitizeProtocol(mission, {
            ...current,
            markers: current.markers.filter(
                (marker) => marker.id !== markerId,
            ),
        });
        const missionProtocols = {
            ...state.missionProtocols,
            [missionCode]: nextProtocol,
        };

        persistProtocolMap(missionProtocols);
        set({ missionProtocols });
    },

    updateStepTiming(missionCode, stepId, timing) {
        const state = get();
        const mission = state.missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) return;

        const current =
            state.missionProtocols[missionCode] ??
            getDefaultMissionProtocol(mission);
        const currentTiming =
            current.step_timing_overrides[stepId] ?? {};
        const nextProtocol = sanitizeProtocol(mission, {
            ...current,
            step_timing_overrides: {
                ...current.step_timing_overrides,
                [stepId]: {
                    ...currentTiming,
                    ...timing,
                },
            },
        });
        const missionProtocols = {
            ...state.missionProtocols,
            [missionCode]: nextProtocol,
        };

        persistProtocolMap(missionProtocols);
        set({
            missionProtocols,
            steps:
                state.selectedMission?.mission_code === missionCode
                    ? applyMissionProtocolToSteps(
                          mission,
                          nextProtocol,
                      )
                    : state.steps,
        });
    },

    updateStepAnalysis(missionCode, stepId, analysis) {
        const state = get();
        const mission = state.missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) return;

        const current =
            state.missionProtocols[missionCode] ??
            getDefaultMissionProtocol(mission);
        const currentAnalysis =
            current.step_analysis_overrides[stepId] ?? {};
        const nextProtocol = sanitizeProtocol(mission, {
            ...current,
            step_analysis_overrides: {
                ...current.step_analysis_overrides,
                [stepId]: {
                    ...currentAnalysis,
                    ...analysis,
                },
            },
        });
        const missionProtocols = {
            ...state.missionProtocols,
            [missionCode]: nextProtocol,
        };

        persistProtocolMap(missionProtocols);
        set({
            missionProtocols,
            steps:
                state.selectedMission?.mission_code === missionCode
                    ? applyMissionProtocolToSteps(mission, nextProtocol)
                    : state.steps,
        });
    },

    resetMissionProtocol(missionCode) {
        const state = get();
        const mission = state.missions.find(
            (item) => item.mission_code === missionCode,
        );
        if (!mission) return;

        const nextProtocol = getDefaultMissionProtocol(mission);
        const missionProtocols = {
            ...state.missionProtocols,
            [missionCode]: nextProtocol,
        };

        persistProtocolMap(missionProtocols);
        set({
            missionProtocols,
            steps:
                state.selectedMission?.mission_code === missionCode
                    ? applyMissionProtocolToSteps(
                          mission,
                          nextProtocol,
                      )
                    : state.steps,
        });
    },

    async startSession({ busInterface, busMode }) {
        const {
            vehicleIdentity,
            selectedMission,
            missionProtocols,
            steps,
        } = get();
        const vehicleSlug = vehicleIdentity.slug;

        if (!selectedMission) {
            throw new Error("No mission selected");
        }

        const protocol =
            missionProtocols[selectedMission.mission_code] ??
            getDefaultMissionProtocol(selectedMission);

        const res = await fetch(
            `${getApiBaseUrl()}/data/can/session/start`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vehicle_slug: vehicleSlug,
                    vehicle: vehicleIdentity,
                    mission_code: selectedMission.mission_code,
                    label: selectedMission.title,
                    bus_interface: busInterface,
                    bus_mode: busMode,
                    metadata: {
                        source: "signal-recon",
                        target: selectedMission.target,
                        rank: selectedMission.rank,
                        category: selectedMission.category,
                        recording_stage:
                            selectedMission.recording_stage,
                        difficulty: selectedMission.difficulty,
                        default_timing:
                            selectedMission.default_timing,
                        analysis_mode:
                            selectedMission.analysis_mode,
                        expected_target:
                            selectedMission.analysis_mode ===
                            "baseline_profile"
                                ? null
                                : selectedMission.target,
                        analyzer_profile: selectedMission.analyzer_profile,
                        ...selectedMission.metadata,
                        mission_protocol: protocol,
                        mission_steps: steps.map((step) => ({
                            id: step.id,
                            step_code: step.step_code,
                            label: step.label,
                            baseline_ms: step.baseline_ms,
                            countdown_ms: step.countdown_ms,
                            action_ms: step.action_ms,
                            capture_ms: step.capture_ms,
                            metadata: step.metadata,
                        })),
                    },
                }),
            },
        );

        const data = await res.json();

        if (!res.ok || !data.session_id) {
            throw new Error(
                data.error ?? data.detail ?? "Failed to start session",
            );
        }

        set({
            activeSessionId: data.session_id,
            postedMarkerCount: 0,
            markerPostFailures: 0,
        });

        useCanDataStore
            .getState()
            .setCurrentSessionId(data.session_id);
        useCanDataStore
            .getState()
            .addLog(
                `[signal-recon] started ${selectedMission.mission_code}: ${selectedMission.title}`,
            );

        return data.session_id as string;
    },

    postMarker({
        stepCode,
        markerType,
        label,
        metadata = {},
    }) {
        return serializeMarkerPost(async () => {
        const { activeSessionId, selectedMission } = get();

        if (!activeSessionId || !selectedMission) {
            throw new Error(
                `Cannot post ${markerType}: no active Signal Recon session`,
            );
        }

        const sessionId = activeSessionId;
        const mission = selectedMission;
        const clientEventId =
            globalThis.crypto?.randomUUID?.() ??
            `marker-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
        let lastError = `Failed to post marker: ${markerType}`;

        for (
            let attempt = 1;
            attempt <= MARKER_POST_ATTEMPTS;
            attempt += 1
        ) {
            try {
                const res = await fetch(
                    `${getApiBaseUrl()}/data/can/session/${sessionId}/marker`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            mission_code: mission.mission_code,
                            step_code: stepCode,
                            marker_type: markerType,
                            label,
                            client_event_id: clientEventId,
                            metadata: {
                                timestamp_authority: "server",
                                source: "signal-recon",
                                analysis_mode: mission.analysis_mode,
                                expected_target:
                                    mission.analysis_mode ===
                                    "baseline_profile"
                                        ? null
                                        : mission.target,
                                ...metadata,
                            },
                        }),
                    },
                );
                const data = await res.json().catch(() => ({}));

                if (res.ok && data.ok !== false && data.marker_id) {
                    set((current) => ({
                        postedMarkerCount:
                            current.postedMarkerCount + 1,
                    }));
                    return;
                }

                lastError =
                    data.error ??
                    data.detail ??
                    `Failed to post marker: ${markerType}`;

                // Conflicts and validation failures are not transient.
                if (
                    res.status < 500 &&
                    res.status !== 408 &&
                    res.status !== 429
                ) {
                    break;
                }
            } catch (error) {
                lastError =
                    error instanceof Error
                        ? error.message
                        : lastError;
            }

            if (attempt < MARKER_POST_ATTEMPTS) {
                await sleep(150 * attempt);
            }
        }

        set((current) => ({
            markerPostFailures:
                current.markerPostFailures + 1,
        }));
        throw new Error(lastError);
        });
    },

    async flushMarkerPosts() {
        await waitForPendingMarkerPosts();
    },

    async runStep(stepArg) {
        const state = get();
        const step =
            stepArg ??
            state.steps[state.activeStepIndex];
        const selectedMission = state.selectedMission;

        if (!selectedMission) {
            throw new Error("No mission selected");
        }
        if (!step) {
            throw new Error("No step selected");
        }
        if (!state.activeSessionId) {
            throw new Error(
                "Start a CAN session before running a Signal Recon step",
            );
        }

        const protocol =
            state.missionProtocols[
                selectedMission.mission_code
            ] ?? getDefaultMissionProtocol(selectedMission);
        const runId = makeRunId();
        const stepIndex = state.steps.findIndex(
            (item) => item.id === step.id,
        );

        set({
            activeRunId: runId,
            activeStep: step,
            activeStepIndex:
                stepIndex >= 0
                    ? stepIndex
                    : state.activeStepIndex,
            activePhase: "idle",
            phaseStartedAt: null,
            phaseEndsAt: null,
        });

        const postConfigured = async (
            trigger: ReconMarkerTrigger,
            phase?: ReconPhaseName,
            durationMs?: number,
        ) => {
            const currentProtocol =
                get().missionProtocols[
                    selectedMission.mission_code
                ] ?? protocol;

            for (const marker of currentProtocol.markers) {
                if (
                    marker.enabled === false ||
                    marker.trigger !== trigger ||
                    !marker.marker_type.trim()
                ) {
                    continue;
                }

                await get().postMarker({
                    stepCode: step.step_code,
                    markerType: marker.marker_type,
                    label: markerLabel(marker, step),
                    metadata: {
                        marker_definition_id: marker.id,
                        marker_trigger: trigger,
                        phase,
                        planned_duration_ms: durationMs,
                        step_id: step.id,
                        action_text: step.action_text,
                        instruction: step.instruction,
                        step_metadata: step.metadata,
                        analyzer_profile:
                            step.metadata?.analyzer_profile ??
                            selectedMission.analyzer_profile,
                        expected_value: step.metadata?.expected_value,
                        expected_unit: step.metadata?.expected_unit,
                        expected_direction:
                            step.metadata?.expected_direction,
                        return_value: step.metadata?.return_value,
                        hold_ms:
                            step.metadata?.hold_ms ?? durationMs,
                        field_widths: step.metadata?.field_widths,
                        allow_signed: step.metadata?.allow_signed,
                        allow_little_endian:
                            step.metadata?.allow_little_endian,
                        allow_big_endian:
                            step.metadata?.allow_big_endian,
                    },
                });
            }
        };

        await postConfigured("step_start");

        for (const phase of protocol.enabled_phases) {
            if (get().activeRunId !== runId) return;

            const startedAt = nowMs();
            const durationMs = phaseDuration(step, phase);

            set({
                activePhase: phase,
                phaseStartedAt: startedAt,
                phaseEndsAt: startedAt + durationMs,
            });

            await postConfigured(phase, phase, durationMs);

            const completed = await waitForRun(
                durationMs,
                runId,
                () => get().activeRunId,
            );
            if (!completed) return;
        }

        if (get().activeRunId !== runId) return;

        await postConfigured("step_complete");

        set({
            activeRunId: null,
            activePhase: "complete",
            phaseStartedAt: nowMs(),
            phaseEndsAt: null,
        });
    },

    async runSelectedMission() {
        const steps = get().steps;
        const sessionId = get().activeSessionId;

        for (
            let index = 0;
            index < steps.length;
            index += 1
        ) {
            if (!get().activeSessionId) return;

            set({
                activeStepIndex: index,
                activeStep: steps[index],
            });
            await get().runStep(steps[index]);
            const current = get();
            if (
                current.activeSessionId !== sessionId ||
                current.activePhase === "cancelled"
            ) {
                return;
            }
        }

        await waitForPendingMarkerPosts();
    },

    async cancelActiveRun() {
        const state = get();
        if (!state.activeRunId) return;

        const step = state.activeStep;
        const mission = state.selectedMission;
        const protocol = mission
            ? state.missionProtocols[
                  mission.mission_code
              ] ?? getDefaultMissionProtocol(mission)
            : null;

        // Clear the run id first so waitForRun exits immediately, then wait for
        // cancellation markers before a caller is allowed to finalize.
        set({
            activeRunId: null,
            activePhase: "cancelled",
            phaseStartedAt: nowMs(),
            phaseEndsAt: null,
        });

        if (!step || !protocol) return;

        for (const marker of protocol.markers) {
            if (
                marker.enabled === false ||
                marker.trigger !== "run_cancelled" ||
                !marker.marker_type.trim()
            ) {
                continue;
            }

            await get().postMarker({
                stepCode: step.step_code,
                markerType: marker.marker_type,
                label: markerLabel(marker, step),
                metadata: {
                    marker_definition_id: marker.id,
                    marker_trigger: "run_cancelled",
                    step_id: step.id,
                    step_metadata: step.metadata,
                },
            });
        }
    },

    async stopSession(metadata = {}) {
        const {
            activeSessionId,
            selectedMission,
            activeRunId,
            missionProtocols,
            steps,
        } = get();
        if (!activeSessionId) return;

        if (activeRunId) {
            await get().cancelActiveRun();
        }

        await waitForPendingMarkerPosts();

        const finalProtocol = selectedMission
            ? missionProtocols[selectedMission.mission_code] ??
              getDefaultMissionProtocol(selectedMission)
            : null;
        const expectedActionMarkerCount =
            finalProtocol && selectedMission
                ? steps.length *
                  finalProtocol.markers.filter(
                      (marker) =>
                          marker.enabled !== false &&
                          isCorrelationMarker(marker),
                  ).length
                : 0;
        const postedMarkerCount = get().postedMarkerCount;
        const markerPostFailures = get().markerPostFailures;

        const res = await fetch(
            `${getApiBaseUrl()}/data/can/session/${activeSessionId}/finalize`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: {
                        source: "signal-recon",
                        mission_code:
                            selectedMission?.mission_code,
                        final_mission_protocol:
                            finalProtocol,
                        final_mission_steps: steps.map((step) => ({
                            id: step.id,
                            step_code: step.step_code,
                            baseline_ms: step.baseline_ms,
                            countdown_ms: step.countdown_ms,
                            action_ms: step.action_ms,
                            capture_ms: step.capture_ms,
                        })),
                        browser_posted_marker_count:
                            postedMarkerCount,
                        browser_marker_post_failures:
                            markerPostFailures,
                        expected_action_marker_count:
                            expectedActionMarkerCount,
                        ...metadata,
                    },
                }),
            },
        );

        const data = await res
            .json()
            .catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                data.error ??
                    data.detail ??
                    "Failed to finalize session",
            );
        }

        useCanDataStore
            .getState()
            .setCurrentSessionId(null);
        useCanDataStore
            .getState()
            .addLog(
                `[signal-recon] finalized ${selectedMission?.mission_code ?? "session"} using Pi server time`,
            );
        const serverMarkerCount =
            typeof data.markers === "number"
                ? data.markers
                : null;
        if (
            serverMarkerCount !== null &&
            serverMarkerCount < postedMarkerCount
        ) {
            useCanDataStore
                .getState()
                .addLog(
                    `[signal-recon] marker reconciliation warning: browser acknowledged ${postedMarkerCount}, server finalized ${serverMarkerCount}`,
                );
        }
        if (
            data.capture_quality?.usable_for_analysis === false
        ) {
            useCanDataStore
                .getState()
                .addLog(
                    `[signal-recon] capture quality warning: ${data.capture_quality?.quality_issue ?? "session is not usable for target analysis"}`,
                );
        }

        set({
            activeSessionId: null,
            activeRunId: null,
            activeStep: null,
            activePhase: "idle",
            phaseStartedAt: null,
            phaseEndsAt: null,
            postedMarkerCount: 0,
            markerPostFailures: 0,
        });
    },
}));
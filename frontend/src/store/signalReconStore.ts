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
    RECON_MISSIONS,
    applyMissionProtocolToSteps,
    getDefaultMissionProtocol,
    type MissionRank,
    type ReconMarkerDefinition,
    type ReconMarkerLabelSource,
    type ReconMarkerTrigger,
    type ReconMissionDefinition,
    type ReconMissionProtocol,
    type ReconPhaseName,
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
    sessionStartedAt: number | null;

    activeRunId: string | null;
    activeStep: ReconStep | null;
    activeStepIndex: number;
    activePhase: ReconRunPhase;
    phaseStartedAt: number | null;
    phaseEndsAt: number | null;

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

    runStep: (step?: ReconStep) => Promise<void>;
    runSelectedMission: () => Promise<void>;
    cancelActiveRun: () => void;

    stopSession: (metadata?: Record<string, unknown>) => Promise<void>;
};

const PROTOCOL_STORAGE_KEY = "avenlab.signal-recon.protocols.v1";
const MAX_PHASE_DURATION_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function makeRunId() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `run-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
}

function makeMarkerId() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `marker-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
    const enabledPhases = ALL_RECON_PHASES.filter((phase) =>
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

    return {
        enabled_phases:
            enabledPhases.length > 0 ? enabledPhases : ["capture"],
        markers,
        step_timing_overrides,
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
    sessionStartedAt: null,

    activeRunId: null,
    activeStep: null,
    activeStepIndex: 0,
    activePhase: "idle",
    phaseStartedAt: null,
    phaseEndsAt: null,

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
                        mission_protocol: protocol,
                        mission_steps: steps.map((step) => ({
                            id: step.id,
                            step_code: step.step_code,
                            label: step.label,
                            baseline_ms: step.baseline_ms,
                            countdown_ms: step.countdown_ms,
                            action_ms: step.action_ms,
                            capture_ms: step.capture_ms,
                        })),
                        frontend_started_at:
                            new Date().toISOString(),
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
            sessionStartedAt: nowMs(),
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

    async postMarker({
        stepCode,
        markerType,
        label,
        metadata = {},
    }) {
        const {
            activeSessionId,
            selectedMission,
            sessionStartedAt,
        } = get();

        if (
            !activeSessionId ||
            !selectedMission ||
            sessionStartedAt === null
        ) {
            return;
        }

        const timestampMs = Math.round(
            nowMs() - sessionStartedAt,
        );

        const res = await fetch(
            `${getApiBaseUrl()}/data/can/session/${activeSessionId}/marker`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mission_code:
                        selectedMission.mission_code,
                    step_code: stepCode,
                    marker_type: markerType,
                    label,
                    timestamp_ms: timestampMs,
                    metadata: {
                        source: "signal-recon",
                        analysis_mode:
                            selectedMission.analysis_mode,
                        expected_target:
                            selectedMission.analysis_mode ===
                            "baseline_profile"
                                ? null
                                : selectedMission.target,
                        ...metadata,
                    },
                }),
            },
        );

        if (!res.ok) {
            const data = await res
                .json()
                .catch(() => ({}));
            throw new Error(
                data.error ??
                    data.detail ??
                    `Failed to post marker: ${markerType}`,
            );
        }
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
        }
    },

    cancelActiveRun() {
        const state = get();
        if (!state.activeRunId) return;

        const step = state.activeStep;
        const mission = state.selectedMission;
        const protocol = mission
            ? state.missionProtocols[
                  mission.mission_code
              ] ?? getDefaultMissionProtocol(mission)
            : null;

        if (step && protocol) {
            for (const marker of protocol.markers) {
                if (
                    marker.enabled === false ||
                    marker.trigger !== "run_cancelled" ||
                    !marker.marker_type.trim()
                ) {
                    continue;
                }

                void get().postMarker({
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
        }

        set({
            activeRunId: null,
            activePhase: "cancelled",
            phaseStartedAt: nowMs(),
            phaseEndsAt: null,
        });
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
            get().cancelActiveRun();
        }

        const res = await fetch(
            `${getApiBaseUrl()}/data/can/session/${activeSessionId}/stop`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: {
                        source: "signal-recon",
                        mission_code:
                            selectedMission?.mission_code,
                        final_mission_protocol:
                            selectedMission
                                ? missionProtocols[
                                      selectedMission.mission_code
                                  ] ??
                                  getDefaultMissionProtocol(
                                      selectedMission,
                                  )
                                : null,
                        final_mission_steps: steps.map((step) => ({
                            id: step.id,
                            step_code: step.step_code,
                            baseline_ms: step.baseline_ms,
                            countdown_ms: step.countdown_ms,
                            action_ms: step.action_ms,
                            capture_ms: step.capture_ms,
                        })),
                        frontend_stopped_at:
                            new Date().toISOString(),
                        ...metadata,
                    },
                }),
            },
        );

        if (!res.ok) {
            const data = await res
                .json()
                .catch(() => ({}));
            throw new Error(
                data.error ??
                    data.detail ??
                    "Failed to stop session",
            );
        }

        useCanDataStore
            .getState()
            .setCurrentSessionId(null);
        useCanDataStore
            .getState()
            .addLog(
                `[signal-recon] stopped ${selectedMission?.mission_code ?? "session"}`,
            );

        set({
            activeSessionId: null,
            sessionStartedAt: null,
            activeRunId: null,
            activeStep: null,
            activePhase: "idle",
            phaseStartedAt: null,
            phaseEndsAt: null,
        });
    },
}));
